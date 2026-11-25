import { http, HttpResponse } from "msw";
import { csrfMatches } from "../csrf";
import { problem } from "../problem";
import {
  assignRooms,
  confirmReview,
  createRoom,
  deleteRoom,
  publishRooms,
  readRoomBoard,
  reorderRooms,
  updateRoom,
  type RoomFailure,
} from "../roomBoardStore";
import { currentOperator } from "./session";

/** Shaped like RoomController (G2 #457) for the operator room screen (G3 #458) and 다시 볼 것 (A11 #461) (참가자 설정 is served by groups.ts through participantSettingsStore). */
const base = "/api/v1/operator/events/:eventId";

type Handler = (eventId: string, actorId: string, request: Request, params: Record<string, string | readonly string[] | undefined>) => Promise<object> | object;

function read(handler: Handler) {
  return async ({ params, request }: { params: Record<string, string | readonly string[] | undefined>; request: Request }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(await handler(String(params.eventId), operator.userId, request, params));
  };
}

function write(handler: Handler, status = 200) {
  return async ({ params, request, cookies }: { params: Record<string, string | readonly string[] | undefined>; request: Request; cookies: Record<string, string> }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(await handler(String(params.eventId), operator.userId, request, params), status);
  };
}

export const roomBoardHandlers = [
  http.get(`${base}/room-board`, read((eventId, actorId) => readRoomBoard(eventId, actorId))),
  http.post(`${base}/rooms`, write(async (eventId, actorId, request) => createRoom(eventId, actorId, await readJson(request)), 201)),
  // Before `rooms/:roomId` so "order" and "publish" are not read as a room id.
  http.post(`${base}/rooms/publish`, write(async (eventId, actorId, request) => publishRooms(eventId, actorId, await readJson(request)))),
  http.put(`${base}/rooms/order`, write(async (eventId, actorId, request) => reorderRooms(eventId, actorId, await readJson(request)))),
  http.patch(
    `${base}/rooms/:roomId`,
    write(async (eventId, actorId, request, params) => updateRoom(eventId, String(params.roomId), actorId, await readJson(request))),
  ),
  http.delete(
    `${base}/rooms/:roomId`,
    write((eventId, actorId, request, params) => deleteRoom(eventId, String(params.roomId), actorId, new URL(request.url))),
  ),
  http.post(`${base}/room-assignments/review`, write(async (eventId, actorId, request) => confirmReview(eventId, actorId, await readJson(request)))),
  http.post(`${base}/room-assignments`, write(async (eventId, actorId, request) => assignRooms(eventId, actorId, await readJson(request)))),
];

function reply(result: object, status = 200): Response {
  if (isFailure(result)) {
    return problem(result.status, result.code, {
      errors: result.errors,
      version: result.version,
      boardVersion: result.boardVersion,
      conflicts: result.conflicts,
      reason: result.reason,
      participantIds: result.participantIds,
      unassignedCount: result.unassignedCount,
      notLodgingAssignedCount: result.notLodgingAssignedCount,
      detail: "hidden",
    });
  }
  return HttpResponse.json(result, { status });
}

function isFailure(value: object): value is RoomFailure {
  return "status" in value && typeof (value as { status: unknown }).status === "number" && "code" in value;
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
