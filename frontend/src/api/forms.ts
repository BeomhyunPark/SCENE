import { apiRequest } from "./client";
import type { ItemPage } from "./types";

export type FormFieldKind = "SYSTEM" | "CUSTOM";

export type FormField = {
  fieldId: string;
  kind: FormFieldKind;
  systemKey: string | null;
  label: string;
  position: number;
};

export type FormListItem = {
  formId: string;
  acceptingApplications: boolean;
};

export type FormDetail = FormListItem & {
  fields: FormField[];
};

export function listForms(
  eventId: string,
  query: { page: number; size: number },
): Promise<ItemPage<FormListItem>> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms`, {
    query: { page: query.page, size: query.size },
  });
}

export function createForm(eventId: string, input: { customLabel?: string } = {}): Promise<FormDetail> {
  const body: { customLabel?: string } = {};
  if (input.customLabel !== undefined) body.customLabel = input.customLabel;
  return apiRequest(`/api/v1/operator/events/${eventId}/forms`, { method: "POST", body });
}

export function getForm(eventId: string, formId: string): Promise<FormDetail> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}`);
}

export function setAccepting(
  eventId: string,
  formId: string,
  acceptingApplications: boolean,
): Promise<FormDetail> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}`, {
    method: "PATCH",
    body: { acceptingApplications },
  });
}

export function addField(eventId: string, formId: string, label: string): Promise<FormDetail> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}/fields`, {
    method: "POST",
    body: { label },
  });
}

export function renameField(
  eventId: string,
  formId: string,
  fieldId: string,
  label: string,
): Promise<FormDetail> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}/fields/${fieldId}`, {
    method: "PATCH",
    body: { label },
  });
}

export function deleteField(eventId: string, formId: string, fieldId: string): Promise<void> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}/fields/${fieldId}`, {
    method: "DELETE",
  });
}
