import type { FormDetail, FormField, FormListItem } from "../api/forms";
import type { LifecycleResult } from "../api/lifecycle";
import { eventById, setLifecycle, spacesFor } from "./operatorStore";
import { permissionsFor } from "./taskStore";

const LABEL_MAX = 200;

type StoredField = FormField;

type StoredForm = {
  eventId: string;
  formId: string;
  acceptingApplications: boolean;
  fields: StoredField[];
};

export type FormFailure = {
  status: number;
  code: string;
  errors?: { field: string }[];
  lifecycleVersion?: number;
  currentStatus?: string;
};

let forms: StoredForm[] = [];

export function resetFormStore(): void {
  forms = [];
}

export function listForms(eventId: string, actorId: string): FormListItem[] | FormFailure {
  const gate = requireRead(eventId, actorId);
  if (gate) return gate;
  return forms
    .filter((form) => form.eventId === eventId)
    .map((form) => ({ formId: form.formId, acceptingApplications: form.acceptingApplications }));
}

export function createForm(eventId: string, actorId: string, body: unknown): FormDetail | FormFailure {
  const gate = requireWrite(eventId, actorId);
  if (gate) return gate;
  const customLabel = readCustomLabel(body);
  if (isFormFailure(customLabel)) return customLabel;
  if (forms.some((form) => form.eventId === eventId)) return { status: 409, code: "CONFLICT" };
  const form: StoredForm = {
    eventId,
    formId: crypto.randomUUID(),
    acceptingApplications: false,
    fields: [
      { fieldId: crypto.randomUUID(), kind: "SYSTEM", systemKey: "NAME", label: "이름", position: 0 },
      { fieldId: crypto.randomUUID(), kind: "SYSTEM", systemKey: "PHONE", label: "전화", position: 1 },
    ],
  };
  if (typeof customLabel === "string") {
    form.fields.push({
      fieldId: crypto.randomUUID(),
      kind: "CUSTOM",
      systemKey: null,
      label: customLabel,
      position: 2,
    });
  }
  forms.push(form);
  return toDetail(form);
}

export function publicForm(eventId: string, formId: string): FormDetail | FormFailure {
  const found = forms.find((form) => form.eventId === eventId && form.formId === formId);
  if (!found) return { status: 404, code: "FORM_NOT_FOUND" };
  if (!found.acceptingApplications) return { status: 409, code: "FORM_CLOSED" };
  return toDetail(found);
}

export function readForm(eventId: string, formId: string, actorId: string): FormDetail | FormFailure {
  const found = forms.find((form) => form.eventId === eventId && form.formId === formId);
  if (!found) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const gate = requireRead(eventId, actorId);
  if (gate) return gate;
  return toDetail(found);
}

export function setAccepting(
  eventId: string,
  formId: string,
  actorId: string,
  body: unknown,
): FormDetail | FormFailure {
  const found = forms.find((form) => form.eventId === eventId && form.formId === formId);
  if (!found) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const gate = requireWrite(eventId, actorId);
  if (gate) return gate;
  const accepting = readAccepting(body);
  if (isFormFailure(accepting)) return accepting;
  const event = eventById(eventId);
  if (accepting && event?.lifecycleStatus !== "ACTIVE") return { status: 409, code: "INVALID_STATE_TRANSITION" };
  found.acceptingApplications = accepting;
  return toDetail(found);
}

export function addField(eventId: string, formId: string, actorId: string, body: unknown): FormDetail | FormFailure {
  const found = forms.find((form) => form.eventId === eventId && form.formId === formId);
  if (!found) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const gate = requireWrite(eventId, actorId);
  if (gate) return gate;
  const label = readLabel(body);
  if (isFormFailure(label)) return label;
  if (found.fields.some((field) => field.kind === "CUSTOM")) return { status: 400, code: "VALIDATION_FAILED" };
  const position = found.fields.reduce((max, field) => Math.max(max, field.position), -1) + 1;
  found.fields.push({ fieldId: crypto.randomUUID(), kind: "CUSTOM", systemKey: null, label, position });
  return toDetail(found);
}

export function renameField(
  eventId: string,
  formId: string,
  fieldId: string,
  actorId: string,
  body: unknown,
): FormDetail | FormFailure {
  const found = forms.find((form) => form.eventId === eventId && form.formId === formId);
  const field = found?.fields.find((item) => item.fieldId === fieldId);
  if (!found || !field) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const gate = requireWrite(eventId, actorId);
  if (gate) return gate;
  const label = readLabel(body);
  if (isFormFailure(label)) return label;
  field.label = label;
  return toDetail(found);
}

export function deleteField(eventId: string, formId: string, fieldId: string, actorId: string): null | FormFailure {
  const found = forms.find((form) => form.eventId === eventId && form.formId === formId);
  if (!found) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const gate = requireWrite(eventId, actorId);
  if (gate) return gate;
  const field = found.fields.find((item) => item.fieldId === fieldId);
  if (!field) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (field.kind === "SYSTEM") return { status: 409, code: "CONFLICT" };
  found.fields = found.fields.filter((item) => item.fieldId !== fieldId);
  return null;
}

export function activateEvent(eventId: string, actorId: string, body: unknown): LifecycleResult | FormFailure {
  const event = eventById(eventId);
  if (!event) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const perms = permissionsFor(eventId, actorId, actorId);
  if ("status" in perms) return perms;
  const spaceOwner = spacesFor(actorId).some((space) => space.spaceId === event.spaceId && space.role === "OWNER");
  if (perms.role !== "OWNER") {
    if (spaceOwner) return { status: 403, code: "OVERRIDE_REQUIRED" };
    return { status: 403, code: "FORBIDDEN" };
  }
  if (!isRecord(body) || typeof body.expectedLifecycleVersion !== "number") {
    return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "expectedLifecycleVersion" }] };
  }
  const expected = body.expectedLifecycleVersion;
  if (event.lifecycleStatus === "ACTIVE") {
    return {
      outcome: "ALREADY_IN_STATE",
      lifecycleStatus: "ACTIVE",
      lifecycleVersion: event.lifecycleVersion,
      actedAs: "EVENT_OWNER",
    };
  }
  if (event.lifecycleVersion !== expected) {
    return {
      status: 409,
      code: "CONCURRENT_MODIFICATION",
      lifecycleVersion: event.lifecycleVersion,
      currentStatus: event.lifecycleStatus,
    };
  }
  if (event.lifecycleStatus !== "DRAFT") return { status: 409, code: "INVALID_STATE_TRANSITION" };
  const next = expected + 1;
  setLifecycle(eventId, "ACTIVE", next);
  return { outcome: "TRANSITIONED", lifecycleStatus: "ACTIVE", lifecycleVersion: next, actedAs: "EVENT_OWNER" };
}

function requireRead(eventId: string, actorId: string): FormFailure | null {
  if (!eventById(eventId)) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const perms = permissionsFor(eventId, actorId, actorId);
  if (!("status" in perms)) {
    if (perms.effective.includes("EVENT_READ")) return null;
    return { status: 403, code: "FORBIDDEN" };
  }
  const event = eventById(eventId);
  const spaceRole = event
    ? spacesFor(actorId).find((space) => space.spaceId === event.spaceId)?.role
    : undefined;
  if (spaceRole === "OWNER" || spaceRole === "ADMIN") return null;
  return perms;
}

function requireWrite(eventId: string, actorId: string): FormFailure | null {
  const read = requireRead(eventId, actorId);
  if (read) return read;
  const perms = permissionsFor(eventId, actorId, actorId);
  if ("status" in perms) return perms;
  if (!perms.effective.includes("FORM_WRITE")) return { status: 403, code: "FORBIDDEN" };
  return null;
}

function readCustomLabel(body: unknown): string | null | FormFailure {
  if (body == null) return null;
  if (!isRecord(body)) return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "customLabel" }] };
  for (const key of Object.keys(body)) {
    if (key !== "customLabel") return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: key }] };
  }
  if (!("customLabel" in body) || body.customLabel == null) return null;
  if (typeof body.customLabel !== "string") {
    return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "customLabel" }] };
  }
  return checkedLabel(body.customLabel, "customLabel");
}

function readLabel(body: unknown): string | FormFailure {
  if (!isRecord(body)) return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "label" }] };
  for (const key of Object.keys(body)) {
    if (key !== "label") return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: key }] };
  }
  if (typeof body.label !== "string") return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "label" }] };
  return checkedLabel(body.label, "label");
}

function readAccepting(body: unknown): boolean | FormFailure {
  if (!isRecord(body)) return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "acceptingApplications" }] };
  for (const key of Object.keys(body)) {
    if (key !== "acceptingApplications") return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: key }] };
  }
  if (typeof body.acceptingApplications !== "boolean") {
    return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "acceptingApplications" }] };
  }
  return body.acceptingApplications;
}

function checkedLabel(value: string, field: string): string | FormFailure {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > LABEL_MAX) {
    return { status: 400, code: "VALIDATION_FAILED", errors: [{ field }] };
  }
  return trimmed;
}

function isFormFailure(value: unknown): value is FormFailure {
  return typeof value === "object" && value !== null && "status" in value && "code" in value;
}

function toDetail(form: StoredForm): FormDetail {
  const fields = [...form.fields].sort((left, right) => left.position - right.position);
  return { formId: form.formId, acceptingApplications: form.acceptingApplications, fields };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
