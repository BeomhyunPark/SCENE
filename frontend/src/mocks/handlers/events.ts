import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { csrfMatches } from "../csrf";
import { problem } from "../problem";
import type { EventListItem } from "../../api/events";
import {
  addEvent,
  eventById,
  eventsFor,
  isEventType,
  operatorRequests,
  type StoredEvent,
} from "../operatorStore";

const PAGE_SIZE = 50;

export const eventHandlers = [
  http.get("/api/v1/operator/spaces/:spaceId/events", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const url = new URL(request.url);
    operatorRequests.push({ method: "GET", url: url.pathname + url.search });
    if (url.searchParams.has("sort")) {
      return problem(400, "VALIDATION_FAILED", { errors: [{ field: "sort" }] });
    }
    const page = numberParam(url, "page");
    const items = eventsFor(String(params.spaceId)).map(toListItem);
    const start = page * PAGE_SIZE;
    const slice = items.slice(start, start + PAGE_SIZE);
    const totalPages = items.length === 0 ? 0 : Math.ceil(items.length / PAGE_SIZE);
    return HttpResponse.json({
      items: slice,
      page: { number: page, size: PAGE_SIZE, totalItems: items.length, totalPages },
    });
  }),

  http.post("/api/v1/operator/spaces/:spaceId/events", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname, body });
    if (!isRecord(body) || typeof body.name !== "string" || body.name.trim().length === 0) {
      return problem(400, "VALIDATION_FAILED", { errors: [{ field: "name" }] });
    }
    if ("eventType" in body && body.eventType !== null && !isEventType(body.eventType)) {
      return problem(400, "VALIDATION_FAILED", { errors: [{ field: "eventType" }] });
    }
    const event = {
      eventId: crypto.randomUUID(),
      spaceId: String(params.spaceId),
      name: body.name.trim(),
      lifecycleStatus: "DRAFT" as const,
      lifecycleVersion: 0,
      startDate: stringOrNull(body.startDate),
      endDate: stringOrNull(body.endDate),
      place: stringOrNull(body.place),
      eventType: isEventType(body.eventType) ? body.eventType : null,
    };
    addEvent(event);
    const detail = toDetail(event);
    operatorRequests[operatorRequests.length - 1].response = detail;
    return HttpResponse.json(detail, { status: 201 });
  }),

  http.get("/api/v1/operator/events/:eventId", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const event = eventById(String(params.eventId));
    operatorRequests.push({
      method: "GET",
      url: new URL(request.url).pathname,
      response: event ? toDetail(event) : undefined,
    });
    if (!event) return problem(404, "RESOURCE_NOT_FOUND");
    return HttpResponse.json(toDetail(event));
  }),
];

function toListItem(event: StoredEvent): EventListItem {
  return {
    eventId: event.eventId,
    name: event.name,
    lifecycleStatus: event.lifecycleStatus,
    startDate: event.startDate,
    endDate: event.endDate,
    place: event.place,
    eventType: event.eventType,
  };
}

function toDetail(event: StoredEvent) {
  return { ...toListItem(event), lifecycleVersion: event.lifecycleVersion };
}

function numberParam(url: URL, name: string): number {
  const raw = url.searchParams.get(name);
  const value = raw === null ? 0 : Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
