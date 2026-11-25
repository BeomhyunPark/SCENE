import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { requireEventRead } from "../formStore";
import { mealCounts } from "../mealCounts";
import { eventById, operatorRequests } from "../operatorStore";
import { problem } from "../problem";

/** 식수 현황 (#454, DEC-089), shaped like MealCountController. Same read gate as the summary. */
export const mealCountHandlers = [
  http.get("/api/v1/operator/events/:eventId/meal-counts", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "GET", url: new URL(request.url).pathname });
    const eventId = String(params.eventId);
    if (!eventById(eventId)) return problem(404, "RESOURCE_NOT_FOUND", { detail: "hidden" });
    const gate = requireEventRead(eventId, operator.userId);
    if (gate) return problem(gate.status, gate.code, { detail: "hidden" });
    return HttpResponse.json(mealCounts(eventId));
  }),
];
