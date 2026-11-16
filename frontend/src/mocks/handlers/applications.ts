import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { requireEventRead } from "../formStore";
import { eventById, operatorRequests } from "../operatorStore";
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
];

function pageParam(url: URL): number {
  const value = Number(url.searchParams.get("page") ?? "0");
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function sizeParam(url: URL): number {
  const value = Number(url.searchParams.get("size") ?? String(DEFAULT_SIZE));
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_SIZE;
}
