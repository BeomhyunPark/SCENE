import type {
  AnswerType,
  FieldConfig,
  FieldOption,
  FormDetail,
  FormField,
  FormListItem,
  FormSetup,
  ShowWhen,
} from "../api/forms";
import type { LifecycleResult } from "../api/lifecycle";
import { PRESET_ORDER, eventDays, generatePreset, type PresetQuestion } from "./formPreset";
import { eventById, setLifecycle, spacesFor } from "./operatorStore";
import { permissionsFor } from "./taskStore";

const LABEL_MAX = 200;

/** The wording the setup generated last time. Text that still equals it follows a new setup. */
type PresetDefaults = {
  label: string;
  description: string | null;
  required: boolean;
  placeholder: string | null;
  options: Record<string, string>;
};

type StoredField = FormField & { presetDefaults?: PresetDefaults };

type StoredForm = {
  eventId: string;
  formId: string;
  acceptingApplications: boolean;
  fields: StoredField[];
  /** Submitted applications. One or more locks type changes (DEC-068). */
  submitted: number;
  setup: FormSetup | null;
};

const FIELD_KEYS = ["label", "answerType", "required", "description", "config", "showWhen", "hidden"];
const ANSWER_TYPES: AnswerType[] = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "DROPDOWN",
  "DATE",
  "DATE_RANGE",
  "NUMBER",
  "YES_NO",
];
const CHOICE_TYPES: AnswerType[] = ["SINGLE_CHOICE", "MULTI_CHOICE", "DROPDOWN"];

export type FormFailure = {
  status: number;
  code: string;
  errors?: { field: string }[];
  lifecycleVersion?: number;
  currentStatus?: string;
  warnings?: { openTasks: number };
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
    fields: [systemField("NAME", "이름", 0), systemField("PHONE", "전화", 1), systemField("COHORT", "또래", 2)],
    submitted: 0,
    setup: null,
  };
  if (typeof customLabel === "string") {
    form.fields.push(customField(customLabel, 3, "SHORT_TEXT", defaultConfig("SHORT_TEXT"), false, null, null, false));
  }
  forms.push(form);
  return toDetail(form);
}

export function publicForm(eventId: string, formId: string): FormDetail | FormFailure {
  const found = forms.find((form) => form.eventId === eventId && form.formId === formId);
  if (!found) return { status: 404, code: "FORM_NOT_FOUND" };
  if (!found.acceptingApplications) return { status: 409, code: "FORM_CLOSED" };
  const detail = toDetail(found);
  const fields = detail.fields
    .filter((field) => !field.hidden)
    .map((field) =>
      field.config.options
        ? { ...field, config: { ...field.config, options: field.config.options.filter((option) => !option.hidden) } }
        : field,
    );
  return { ...detail, fields };
}

/** Stored fields of a form whether or not it is accepting. Empty when the form is gone. */
export function formFields(eventId: string, formId: string): FormDetail["fields"] {
  const found = forms.find((form) => form.eventId === eventId && form.formId === formId);
  return found ? toDetail(found).fields : [];
}

/** The event's form with its stored setup, for the summary mock. Null when the event has no form. */
export function eventFormDetail(eventId: string): FormDetail | null {
  const found = forms.find((form) => form.eventId === eventId);
  return found ? toDetail(found) : null;
}

/** The event's form id, accepting or not (#308 table without applications). */
export function eventFormId(eventId: string): string | undefined {
  return forms.find((form) => form.eventId === eventId)?.formId;
}

/** Same read gate as the form read: EVENT_READ, or an active space OWNER or ADMIN. */
export function requireEventRead(eventId: string, actorId: string): FormFailure | null {
  return requireRead(eventId, actorId);
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
  if (!isRecord(body)) return invalid("label");
  const extra = Object.keys(body).find((key) => !FIELD_KEYS.includes(key));
  if (extra) return invalid(extra);
  const label = readLabel({ label: body.label });
  if (isFormFailure(label)) return label;
  const type = body.answerType === undefined ? "SHORT_TEXT" : readType(body.answerType);
  if (!type) return invalid("answerType");
  const config = readConfig(type, body.config, null);
  if (isFormFailure(config)) return config;
  const position = found.fields.reduce((max, field) => Math.max(max, field.position), -1) + 1;
  const next = customField(
    label,
    position,
    type,
    config,
    body.required === true,
    typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
    readShowWhen(body.showWhen),
    body.hidden === true,
  );
  const conditions = checkConditions([...found.fields, next]);
  if (conditions) return conditions;
  found.fields.push(next);
  return toDetail(found);
}

export function updateField(
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
  if (!isRecord(body) || Object.keys(body).length === 0) return invalid("label");
  const allowed = field.kind === "SYSTEM" ? ["label", "description", "config", "hidden"] : FIELD_KEYS;
  const extra = Object.keys(body).find((key) => !allowed.includes(key));
  if (extra) return invalid(extra);
  const label = "label" in body ? readLabel({ label: body.label }) : field.label;
  if (isFormFailure(label)) return label;
  if (field.kind === "SYSTEM") {
    // Wording only; 또래 may also be turned off (DEC-070).
    if (body.hidden === true && field.systemKey !== "COHORT") return { status: 409, code: "CONFLICT" };
    let placeholder = field.config.placeholder ?? null;
    if ("config" in body) {
      if (!isRecord(body.config) || Object.keys(body.config).some((key) => key !== "placeholder")) return invalid("config");
      placeholder = cleanText(body.config.placeholder);
    }
    const next: StoredField = {
      ...field,
      label,
      description: "description" in body ? cleanText(body.description) : field.description,
      config: { ...field.config, placeholder },
      hidden: "hidden" in body ? body.hidden === true : field.hidden,
    };
    found.fields = found.fields.map((item) => (item.fieldId === fieldId ? next : item));
    return toDetail(found);
  }
  const locked = found.submitted > 0;
  const type = "answerType" in body ? readType(body.answerType) : field.answerType;
  if (!type) return invalid("answerType");
  if (field.presetKey && type !== field.answerType) return { status: 409, code: "CONFLICT" };
  if (locked && type !== field.answerType) return { status: 409, code: "FIELD_LOCKED" };
  let config = field.config;
  if ("config" in body || type !== field.answerType) {
    const next = readConfig(type, body.config, field);
    if (isFormFailure(next)) return next;
    const kept = new Set((next.options ?? []).map((option) => option.optionId));
    const before = new Map((field.config.options ?? []).map((option) => [option.optionId, option.showWhen]));
    const removes = [...before.keys()].some((id) => !kept.has(id));
    const changes = (next.options ?? []).some(
      (option) => before.has(option.optionId) && !sameCondition(before.get(option.optionId) ?? null, option.showWhen),
    );
    if (locked && (removes || changes)) return { status: 409, code: "FIELD_LOCKED" };
    config = next;
  }
  const showWhen = "showWhen" in body ? readShowWhen(body.showWhen) : field.showWhen;
  if (locked && !sameCondition(showWhen, field.showWhen)) return { status: 409, code: "FIELD_LOCKED" };
  const next: StoredField = {
    ...field,
    label,
    answerType: type,
    config,
    showWhen,
    required: "required" in body ? body.required === true : field.required,
    description:
      "description" in body
        ? typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null
        : field.description,
    hidden: "hidden" in body ? body.hidden === true : field.hidden,
  };
  if (
    field.presetKey &&
    (!sameCondition(showWhen, field.showWhen) ||
      structureOf(config) !== structureOf(field.config) ||
      (!next.hidden && field.presetActive === false))
  ) {
    // The form setup owns a generated question's structure and whether it is on (DEC-070).
    return { status: 409, code: "CONFLICT" };
  }
  const all = found.fields.map((item) => (item.fieldId === fieldId ? next : item));
  const conditions = checkConditions(all);
  if (conditions) return conditions;
  found.fields = all;
  return toDetail(found);
}

/**
 * Mock of PUT /setup (DEC-070): generated questions are added, hidden, or removed to match, and
 * operator wording stays. Looser than the server: it does not check locked condition changes.
 */
export function applySetup(eventId: string, formId: string, actorId: string, body: unknown): FormDetail | FormFailure {
  const found = forms.find((form) => form.eventId === eventId && form.formId === formId);
  if (!found) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const gate = requireWrite(eventId, actorId);
  if (gate) return gate;
  const event = eventById(eventId);
  if (!event?.startDate || !event.endDate || eventDays(event.startDate, event.endDate) > 10) return invalid("eventPeriod");
  const setup = readSetup(body, eventDays(event.startDate, event.endDate));
  if (isFormFailure(setup)) return setup;
  const locked = found.submitted > 0;
  const ids = new Map(found.fields.filter((field) => field.presetKey).map((field) => [field.presetKey!, field.fieldId]));
  const idOf = (key: string) => {
    if (!ids.has(key)) ids.set(key, crypto.randomUUID());
    return ids.get(key)!;
  };
  const ideal = generatePreset(setup, event.startDate, event.endDate, idOf);
  const wanted = new Map(ideal.map((question) => [question.key, question]));
  const kept: StoredField[] = [];
  for (const field of [...found.fields].sort((left, right) => left.position - right.position)) {
    if (!field.presetKey) {
      kept.push(field);
      continue;
    }
    const question = wanted.get(field.presetKey);
    if (question) kept.push(mergePreset(field, question, locked));
    else if (locked || !untouched(field)) kept.push({ ...field, hidden: true, presetActive: false });
  }
  for (const question of ideal) {
    if (kept.some((field) => field.presetKey === question.key)) continue;
    const rank = PRESET_ORDER.indexOf(question.key);
    const lastSystem = kept.reduce((last, field, index) => (field.kind === "SYSTEM" ? index : last), -1);
    const presetBefore = kept.reduce(
      (last, field, index) => (field.presetKey && PRESET_ORDER.indexOf(field.presetKey) < rank ? index : last),
      -1,
    );
    kept.splice((presetBefore >= 0 ? presetBefore : lastSystem) + 1, 0, {
      fieldId: idOf(question.key),
      kind: "CUSTOM",
      systemKey: null,
      label: question.label,
      position: 0,
      answerType: question.answerType,
      required: question.required,
      description: question.description,
      config: question.config,
      showWhen: question.showWhen,
      hidden: false,
      presetKey: question.key,
      presetActive: true,
      presetDefaults: defaultsOf(question),
    });
  }
  const numbered = kept.map((field, position) => ({ ...field, position }));
  if (checkConditions(numbered)) return { status: 409, code: "CONFLICT" };
  found.fields = numbered;
  found.setup = { ...setup, generatedFor: { startDate: event.startDate, endDate: event.endDate } };
  return toDetail(found);
}

function defaultsOf(question: PresetQuestion): PresetDefaults {
  return {
    label: question.label,
    description: question.description,
    required: question.required,
    placeholder: question.config.placeholder ?? null,
    options: Object.fromEntries((question.config.options ?? []).map((option) => [option.optionId, option.label])),
  };
}

function untouched(field: StoredField): boolean {
  const defaults = field.presetDefaults;
  if (!defaults) return true;
  return (
    field.label === defaults.label &&
    field.description === defaults.description &&
    field.required === defaults.required &&
    (field.config.placeholder ?? null) === defaults.placeholder &&
    (field.config.options ?? []).every(
      (option) => defaults.options[option.optionId] === undefined || defaults.options[option.optionId] === option.label,
    )
  );
}

function mergePreset(field: StoredField, question: PresetQuestion, locked: boolean): StoredField {
  const before = field.presetDefaults ?? defaultsOf(question);
  const keep = <T,>(current: T, generatedBefore: T, generatedNow: T): T =>
    current === generatedBefore ? generatedNow : current;
  const config: FieldConfig = structuredClone(question.config);
  if ("placeholder" in config) {
    config.placeholder = keep(field.config.placeholder ?? null, before.placeholder, config.placeholder ?? null);
  }
  if (config.options) {
    const existing = new Map((field.config.options ?? []).map((option) => [option.optionId, option]));
    config.options = config.options.map((option) => {
      const was = existing.get(option.optionId);
      return was ? { ...option, label: keep(was.label, before.options[option.optionId], option.label) } : option;
    });
    if (locked) {
      const listed = new Set(config.options.map((option) => option.optionId));
      for (const option of field.config.options ?? []) {
        if (!listed.has(option.optionId)) config.options.push({ ...option, hidden: true });
      }
    }
  }
  return {
    ...field,
    label: keep(field.label, before.label, question.label),
    description: keep(field.description, before.description, question.description),
    required: field.required === before.required ? question.required : field.required,
    answerType: question.answerType,
    config,
    showWhen: question.showWhen,
    hidden: field.presetActive !== false && field.hidden,
    presetActive: true,
    presetDefaults: defaultsOf(question),
  };
}

function readSetup(body: unknown, days: number): FormSetup | FormFailure {
  if (!isRecord(body)) return invalid("setup");
  const { attendance, transport, schedule } = body;
  const flags = (value: unknown, keys: string[]) =>
    isRecord(value) && keys.every((key) => typeof value[key] === "boolean");
  if (!flags(body, ["gender", "middleGroup", "cell"])) return invalid("setup");
  // newcomer was added later: optional, off when missing.
  if (body.newcomer !== undefined && typeof body.newcomer !== "boolean") return invalid("setup");
  if (!flags(attendance, ["partial", "worshipOnly"])) return invalid("attendance");
  if (!flags(transport, ["groupBus", "worshipShuttle", "car", "publicTransit", "support"])) return invalid("transport");
  if (
    !Array.isArray(schedule) ||
    schedule.length !== days ||
    !schedule.every((day) => flags(day, ["breakfast", "lunch", "dinner", "worship"]))
  ) {
    return invalid("schedule");
  }
  return structuredClone({
    gender: body.gender,
    middleGroup: body.middleGroup,
    cell: body.cell,
    newcomer: body.newcomer === true,
    attendance,
    schedule,
    transport,
  }) as FormSetup;
}

/** Option ids, order, groups, hidden flags, and conditions. Labels and the placeholder are wording. */
function structureOf(config: FieldConfig): string {
  return JSON.stringify({
    ...config,
    placeholder: null,
    options: config.options?.map((option) => ({ ...option, label: "" })),
  });
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function reorderFields(eventId: string, formId: string, actorId: string, body: unknown): FormDetail | FormFailure {
  const found = forms.find((form) => form.eventId === eventId && form.formId === formId);
  if (!found) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const gate = requireWrite(eventId, actorId);
  if (gate) return gate;
  if (!isRecord(body) || !Array.isArray(body.fieldIds)) return invalid("fieldIds");
  const ids = body.fieldIds as unknown[];
  const byId = new Map(found.fields.map((field) => [field.fieldId, field]));
  if (ids.length !== found.fields.length || new Set(ids).size !== ids.length) return invalid("fieldIds");
  const ordered: StoredField[] = [];
  for (const id of ids) {
    const field = typeof id === "string" ? byId.get(id) : undefined;
    if (!field) return invalid("fieldIds");
    ordered.push({ ...field, position: ordered.length });
  }
  const conditions = checkConditions(ordered);
  if (conditions) return conditions;
  found.fields = ordered;
  return toDetail(found);
}

export function deleteField(eventId: string, formId: string, fieldId: string, actorId: string): null | FormFailure {
  const found = forms.find((form) => form.eventId === eventId && form.formId === formId);
  if (!found) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const gate = requireWrite(eventId, actorId);
  if (gate) return gate;
  const field = found.fields.find((item) => item.fieldId === fieldId);
  if (!field) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (field.kind === "SYSTEM" || field.presetKey) return { status: 409, code: "CONFLICT" };
  if (found.submitted > 0) return { status: 409, code: "FIELD_LOCKED" };
  const target = found.fields.some(
    (item) =>
      item.showWhen?.fieldId === fieldId ||
      (item.config.options ?? []).some((option) => option.showWhen?.fieldId === fieldId),
  );
  if (target) return { status: 409, code: "CONFLICT" };
  found.fields = found.fields.filter((item) => item.fieldId !== fieldId);
  return null;
}

/** The public submit mock calls this so the operator form reads as locked. */
export function markSubmitted(eventId: string, formId: string): void {
  const found = forms.find((form) => form.eventId === eventId && form.formId === formId);
  if (found) found.submitted += 1;
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

/** Mock of POST /end: event OWNER only, ACTIVE → ENDED, open tasks need acknowledgeWarnings. */
export function endEvent(
  eventId: string,
  actorId: string,
  body: unknown,
  openTasks: number,
): LifecycleResult | FormFailure {
  const event = eventById(eventId);
  if (!event) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const perms = permissionsFor(eventId, actorId, actorId);
  if ("status" in perms) return perms;
  if (perms.role !== "OWNER") return { status: 403, code: "FORBIDDEN" };
  if (!isRecord(body) || typeof body.expectedLifecycleVersion !== "number") {
    return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "expectedLifecycleVersion" }] };
  }
  if (event.lifecycleStatus === "ENDED") {
    return { outcome: "ALREADY_IN_STATE", lifecycleStatus: "ENDED", lifecycleVersion: event.lifecycleVersion, actedAs: "EVENT_OWNER" };
  }
  if (event.lifecycleVersion !== body.expectedLifecycleVersion) {
    return {
      status: 409,
      code: "CONCURRENT_MODIFICATION",
      lifecycleVersion: event.lifecycleVersion,
      currentStatus: event.lifecycleStatus,
    };
  }
  if (event.lifecycleStatus !== "ACTIVE") return { status: 409, code: "INVALID_STATE_TRANSITION" };
  if (openTasks > 0 && body.acknowledgeWarnings !== true) {
    return { status: 409, code: "CONFIRMATION_REQUIRED", warnings: { openTasks } };
  }
  const next = event.lifecycleVersion + 1;
  setLifecycle(eventId, "ENDED", next);
  return { outcome: "TRANSITIONED", lifecycleStatus: "ENDED", lifecycleVersion: next, actedAs: "EVENT_OWNER" };
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
  return {
    formId: form.formId,
    acceptingApplications: form.acceptingApplications,
    fields: structuredClone(fields).map((field) => {
      delete field.presetDefaults;
      return field;
    }),
    locked: form.submitted > 0,
    setup: structuredClone(form.setup),
  };
}

function systemField(systemKey: "NAME" | "PHONE" | "COHORT", label: string, position: number): StoredField {
  return {
    fieldId: crypto.randomUUID(),
    kind: "SYSTEM",
    systemKey,
    label,
    position,
    answerType: "SHORT_TEXT",
    required: true,
    description: systemKey === "COHORT" ? "출생연도 뒤 두 자리를 적어주세요." : null,
    config:
      systemKey === "PHONE"
        ? { maxLength: 50, format: "PHONE", placeholder: null }
        : systemKey === "COHORT"
          ? { maxLength: 2, format: "DIGITS", placeholder: "예: 94" }
          : { maxLength: 200, format: "NONE", placeholder: null },
    showWhen: null,
    hidden: false,
    presetKey: null,
    presetActive: null,
  };
}

function customField(
  label: string,
  position: number,
  answerType: AnswerType,
  config: FieldConfig,
  required: boolean,
  description: string | null,
  showWhen: ShowWhen | null,
  hidden: boolean,
): StoredField {
  return {
    fieldId: crypto.randomUUID(),
    kind: "CUSTOM",
    systemKey: null,
    label,
    position,
    answerType,
    required,
    description,
    config,
    showWhen,
    hidden,
    presetKey: null,
    presetActive: null,
  };
}

function readType(value: unknown): AnswerType | null {
  return ANSWER_TYPES.find((type) => type === value) ?? null;
}

/** Defaults match the server (DEC-068 §1). */
function defaultConfig(type: AnswerType): FieldConfig {
  switch (type) {
    case "SHORT_TEXT":
      return { maxLength: 200, format: "NONE", placeholder: null };
    case "LONG_TEXT":
      return { maxLength: 1000, placeholder: null };
    case "SINGLE_CHOICE":
      return { options: [], allowOther: false, display: "LIST" };
    case "MULTI_CHOICE":
      return { options: [], allowOther: false, minSelect: 0, maxSelect: null };
    case "DROPDOWN":
      return { options: [] };
    case "DATE":
    case "DATE_RANGE":
      return { includeTime: false, min: null, max: null };
    case "NUMBER":
      return { min: null, max: null, unit: null };
    case "YES_NO":
      return { style: "YES_NO", yesLabel: null, noLabel: null };
  }
}

/** A light copy of the server rules: defaults, option ids, and required options. */
function readConfig(type: AnswerType, raw: unknown, previous: StoredField | null): FieldConfig | FormFailure {
  const input = raw == null ? {} : raw;
  if (!isRecord(input)) return invalid("config");
  const base = defaultConfig(type);
  const allowed = new Set(Object.keys(base));
  if (Object.keys(input).some((key) => !allowed.has(key))) return invalid("config");
  const merged: FieldConfig = { ...base, ...(input as FieldConfig) };
  if (CHOICE_TYPES.includes(type)) {
    const options = input.options;
    if (!Array.isArray(options) || options.length === 0 || options.length > 50) return invalid("config");
    const known = new Set((previous?.config.options ?? []).map((option) => option.optionId));
    const next: FieldOption[] = [];
    for (const option of options as unknown[]) {
      if (!isRecord(option) || typeof option.label !== "string" || !option.label.trim()) return invalid("config");
      if (option.optionId != null && (typeof option.optionId !== "string" || !known.has(option.optionId))) {
        return invalid("config");
      }
      next.push({
        optionId: typeof option.optionId === "string" ? option.optionId : `opt_${crypto.randomUUID().slice(0, 8)}`,
        label: option.label.trim(),
        group: typeof option.group === "string" && option.group.trim() ? option.group.trim() : null,
        hidden: option.hidden === true,
        showWhen: readShowWhen(option.showWhen),
      });
    }
    merged.options = next;
  }
  return merged;
}

function readShowWhen(value: unknown): ShowWhen | null {
  if (!isRecord(value) || typeof value.fieldId !== "string") return null;
  if (Array.isArray(value.optionIds)) return { fieldId: value.fieldId, optionIds: value.optionIds.map(String) };
  if (typeof value.equals === "boolean") return { fieldId: value.fieldId, equals: value.equals };
  return null;
}

function sameCondition(left: ShowWhen | null, right: ShowWhen | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** A condition points at an earlier CUSTOM choice or yes/no question, and its options exist. */
function checkConditions(fields: StoredField[]): FormFailure | null {
  const byId = new Map(fields.map((field) => [field.fieldId, field]));
  for (const field of fields) {
    const checks: [ShowWhen | null, string][] = [[field.showWhen, "showWhen"]];
    for (const option of field.config.options ?? []) checks.push([option.showWhen, "config"]);
    for (const [condition, name] of checks) {
      if (!condition) continue;
      const target = byId.get(condition.fieldId);
      if (!target || target.kind === "SYSTEM" || target.position >= field.position) return invalid(name);
      if (target.answerType === "YES_NO") {
        if (!("equals" in condition)) return invalid(name);
        continue;
      }
      if (!CHOICE_TYPES.includes(target.answerType) || !("optionIds" in condition)) return invalid(name);
      const ids = new Set((target.config.options ?? []).map((option) => option.optionId));
      if (condition.optionIds.length === 0 || condition.optionIds.some((id) => !ids.has(id))) return invalid(name);
    }
  }
  return null;
}

function invalid(field: string): FormFailure {
  return { status: 400, code: "VALIDATION_FAILED", errors: [{ field }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
