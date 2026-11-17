import { http, HttpResponse } from "msw";
import type { ApplicationAnswer } from "../../api/applications";
import { formatAnswer } from "../../components/answerDisplay";
import { formatSubmittedAt } from "../../components/eventFormat";
import { currentOperator } from "./session";
import { eventFormId, formFields, requireEventRead } from "../formStore";
import { eventById, operatorRequests } from "../operatorStore";
import { permissionsFor } from "../taskStore";
import { submittedApplication, submittedApplications, tableApplications } from "../participantStore";
import { checkedInAtOf } from "../checkInStore";
import { workingGroupOf } from "../groupStore";
import { problem } from "../problem";
import { applicationSummary } from "../applicationSummary";

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

  // Summary (#251, DEC-073), counted with ApplicationSummaryService's rules. Registered before the
  // detail route so "summary" is not read as an application id. Same read gate as the list.
  http.get("/api/v1/operator/events/:eventId/applications/summary", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "GET", url: new URL(request.url).pathname });
    const eventId = String(params.eventId);
    if (!eventById(eventId)) return problem(404, "RESOURCE_NOT_FOUND", { detail: "hidden" });
    const gate = requireEventRead(eventId, operator.userId);
    if (gate) return problem(gate.status, gate.code, { detail: "hidden" });
    return HttpResponse.json(applicationSummary(eventId));
  }),

  // 참가 현황 table (#308), shaped like ApplicationTableController. EVENT_READ or a space
  // OWNER/ADMIN reads; phone questions only with PARTICIPANT_CONTACT_READ; groups only with
  // GROUP_WRITE. Must stay before the :applicationId route.
  http.get("/api/v1/operator/events/:eventId/applications/table", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "GET", url: new URL(request.url).pathname });
    const eventId = String(params.eventId);
    const gate = requireEventRead(eventId, operator.userId);
    if (gate) return problem(gate.status, gate.code, { detail: "hidden" });
    const perms = permissionsFor(eventId, operator.userId, operator.userId);
    const effective = "effective" in perms ? perms.effective : [];
    const contact = effective.includes("PARTICIPANT_CONTACT_READ");
    const groupVisible = effective.includes("GROUP_WRITE");
    const rows = tableApplications(eventId);
    const formId = rows[0]?.formId ?? formOf(eventId);
    const fields = formId ? formFields(eventId, formId) : [];
    const columns = fields
      .map((field) => ({
        fieldId: field.fieldId,
        kind: field.kind,
        systemKey: field.systemKey,
        presetKey: field.presetKey ?? null,
        label: field.label,
        position: field.position,
        answerType: field.answerType,
        hidden: field.hidden,
        config: field.config,
        contact: field.systemKey === "PHONE" || (isText(field.answerType) && field.config.format === "PHONE"),
      }))
      .filter((column) => contact || !column.contact);
    const shown = new Set(columns.map((column) => column.fieldId));
    return HttpResponse.json(
      {
        formId: formId ?? null,
        contactVisible: contact && columns.some((column) => column.contact),
        groupVisible,
        columns,
        rows: rows.map((row) => ({
          applicationId: row.applicationId,
          submittedAt: row.submittedAt,
          answers: Object.fromEntries(Object.entries(row.answers).filter(([fieldId]) => shown.has(fieldId))),
          group: groupVisible ? workingGroupOf(eventId, row.participantId) : null,
          checkedInAt: checkedInAtOf(eventId, row.participantId),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
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

function isText(type: string): boolean {
  return type === "SHORT_TEXT" || type === "LONG_TEXT";
}

function formOf(eventId: string): string | undefined {
  return eventFormId(eventId);
}

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
