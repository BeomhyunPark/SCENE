import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { csrfMatches } from "../csrf";
import {
  addField,
  createForm,
  deleteField,
  listForms,
  readForm,
  renameField,
  setAccepting,
  type FormFailure,
} from "../formStore";
import { operatorRequests } from "../operatorStore";
import { problem } from "../problem";

const PAGE_SIZE = 50;

export const formHandlers = [
  http.get("/api/v1/operator/events/:eventId/forms", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const url = new URL(request.url);
    operatorRequests.push({ method: "GET", url: url.pathname + url.search });
    if (url.searchParams.has("sort")) {
      return problem(400, "VALIDATION_FAILED", { errors: [{ field: "sort" }], detail: "hidden" });
    }
    const result = listForms(String(params.eventId), operator.userId);
    if (isFailure(result)) return fail(result);
    const page = numberParam(url, "page");
    const start = page * PAGE_SIZE;
    const slice = result.slice(start, start + PAGE_SIZE);
    const totalPages = result.length === 0 ? 0 : Math.ceil(result.length / PAGE_SIZE);
    return HttpResponse.json({
      items: slice,
      page: { number: page, size: PAGE_SIZE, totalItems: result.length, totalPages },
    });
  }),

  http.post("/api/v1/operator/events/:eventId/forms", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname, body });
    const created = createForm(String(params.eventId), operator.userId, body);
    if (isFailure(created)) return fail(created);
    return HttpResponse.json(created, { status: 201 });
  }),

  http.get("/api/v1/operator/events/:eventId/forms/:formId", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "GET", url: new URL(request.url).pathname });
    const detail = readForm(String(params.eventId), String(params.formId), operator.userId);
    if (isFailure(detail)) return fail(detail);
    return HttpResponse.json(detail);
  }),

  http.patch("/api/v1/operator/events/:eventId/forms/:formId", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    operatorRequests.push({ method: "PATCH", url: new URL(request.url).pathname, body });
    const updated = setAccepting(String(params.eventId), String(params.formId), operator.userId, body);
    if (isFailure(updated)) return fail(updated);
    return HttpResponse.json(updated);
  }),

  http.post("/api/v1/operator/events/:eventId/forms/:formId/fields", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname, body });
    const updated = addField(String(params.eventId), String(params.formId), operator.userId, body);
    if (isFailure(updated)) return fail(updated);
    return HttpResponse.json(updated, { status: 201 });
  }),

  http.patch(
    "/api/v1/operator/events/:eventId/forms/:formId/fields/:fieldId",
    async ({ request, params, cookies }) => {
      if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
      const operator = currentOperator();
      if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
      const body = await readJson(request);
      operatorRequests.push({ method: "PATCH", url: new URL(request.url).pathname, body });
      const updated = renameField(
        String(params.eventId),
        String(params.formId),
        String(params.fieldId),
        operator.userId,
        body,
      );
      if (isFailure(updated)) return fail(updated);
      return HttpResponse.json(updated);
    },
  ),

  http.delete(
    "/api/v1/operator/events/:eventId/forms/:formId/fields/:fieldId",
    ({ request, params, cookies }) => {
      if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
      const operator = currentOperator();
      if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
      operatorRequests.push({ method: "DELETE", url: new URL(request.url).pathname });
      const removed = deleteField(
        String(params.eventId),
        String(params.formId),
        String(params.fieldId),
        operator.userId,
      );
      if (removed) return fail(removed);
      return new HttpResponse(null, { status: 204 });
    },
  ),
];

function fail(failure: FormFailure): Response {
  return problem(failure.status, failure.code, {
    errors: failure.errors,
    lifecycleVersion: failure.lifecycleVersion,
    currentStatus: failure.currentStatus,
    detail: "hidden",
  });
}

function isFailure(value: object): value is FormFailure {
  return "status" in value && "code" in value;
}

function numberParam(url: URL, name: string): number {
  const value = Number(url.searchParams.get(name) ?? "0");
  return Number.isInteger(value) && value > 0 ? value : 0;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
