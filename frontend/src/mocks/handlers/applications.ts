import { http, HttpResponse } from "msw";
import type { ApplicationAnswer } from "../../api/applications";
import { formatAnswer } from "../../components/answerDisplay";
import { formatSubmittedAt } from "../../components/eventFormat";
import { currentOperator } from "./session";
import { formFields, requireEventRead } from "../formStore";
import { eventById, operatorRequests } from "../operatorStore";
import { permissionsFor } from "../taskStore";
import { submittedApplication, submittedApplications } from "../participantStore";
import { problem } from "../problem";

const DEFAULT_SIZE = 50;
const MAX_SIZE = 100;
const STATUSES = new Set(["SUBMITTED", "SUPERSEDED", "WITHDRAWN"]);

/**
 * Operator application reads, shaped like OperatorApplicationController. Applications come from the
 * public submit store, so a mock submit shows up here. The access key, participant session, and
 * phone stay off the list.
 */
export const applicationHandlers = [
  http.get("/api/v1/operator/events/:eventId/applications", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const url = new URL(request.url);
    operatorRequests.push({ method: "GET", url: url.pathname + url.search });
    const eventId = String(params.eventId);
    const gate = requireEventRead(eventId, operator.userId);
    if (gate) return problem(gate.status, gate.code, { detail: "hidden" });
    if (url.searchParams.has("sort")) {
      return problem(400, "VALIDATION_FAILED", { errors: [{ field: "sort" }], detail: "hidden" });
    }
    const statuses = url.searchParams.getAll("status");
    if (statuses.some((status) => !STATUSES.has(status))) {
      return problem(400, "VALIDATION_FAILED", { errors: [{ field: "status" }], detail: "hidden" });
    }
    const size = sizeParam(url);
    if (size > MAX_SIZE) return problem(400, "PAGE_SIZE_EXCEEDED", { detail: "hidden" });
    const page = pageParam(url);
    const rows = submittedApplications(eventId);
    const items = rows.slice(page * size, page * size + size);
    const totalPages = rows.length === 0 ? 0 : Math.ceil(rows.length / size);
    return HttpResponse.json({
      items,
      page: { number: page, size, totalItems: rows.length, totalPages },
    });
  }),

  http.get("/api/v1/operator/events/:eventId/applications/:applicationId", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "GET", url: new URL(request.url).pathname });
    const eventId = String(params.eventId);
    if (!eventById(eventId)) return problem(404, "RESOURCE_NOT_FOUND", { detail: "hidden" });
    const detail = submittedApplication(eventId, String(params.applicationId));
    if (!detail) return problem(404, "RESOURCE_NOT_FOUND", { detail: "hidden" });
    const gate = requireEventRead(eventId, operator.userId);
    if (gate) return problem(gate.status, gate.code, { detail: "hidden" });
    return HttpResponse.json(detail);
  }),

  // Applicant CSV, shaped like OperatorApplicationController#export (#233). Effective DATA_EXPORT
  // only; EVENT_READ alone is 403. Hidden questions keep a "(숨김)" column; a missing answer is empty.
  http.post("/api/v1/operator/events/:eventId/applications/export", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname });
    const eventId = String(params.eventId);
    const event = eventById(eventId);
    if (!event) return problem(404, "RESOURCE_NOT_FOUND", { detail: "hidden" });
    const perms = permissionsFor(eventId, operator.userId, operator.userId);
    if ("status" in perms) return problem(perms.status, perms.code, { detail: "hidden" });
    if (!perms.effective.includes("DATA_EXPORT")) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const rows = submittedApplications(eventId);
    const formId = rows[0]?.formId;
    const fields = formId ? formFields(eventId, formId) : [];
    const table: string[][] = [["제출 시각", ...fields.map((field) => (field.hidden ? `${field.label} (숨김)` : field.label))]];
    for (const row of rows) {
      const detail = submittedApplication(eventId, row.applicationId);
      const answers = detail?.answers ?? [];
      table.push([
        formatSubmittedAt(row.submittedAt),
        ...fields.map((field) => {
          const answer = answers.find((item) => item.fieldId === field.fieldId);
          return answer ? formatAnswer(answer as ApplicationAnswer) : "";
        }),
      ]);
    }
    const body = "\uFEFF" + table.map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const name = `${event.name}_신청자.csv`;
    return new HttpResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv;charset=UTF-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  }),
];

/** Same rules as the server's ApplicationCsv: formula prefix, then RFC 4180 quoting. */
function csvCell(raw: string): string {
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function pageParam(url: URL): number {
  const value = Number(url.searchParams.get("page") ?? "0");
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function sizeParam(url: URL): number {
  const value = Number(url.searchParams.get("size") ?? String(DEFAULT_SIZE));
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_SIZE;
}
