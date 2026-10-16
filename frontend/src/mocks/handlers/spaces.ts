import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { problem } from "../problem";
import { spacesFor } from "../operatorStore";

export const spaceHandlers = [
  http.get("/api/v1/operator/spaces", ({ request }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const url = new URL(request.url);
    if (url.searchParams.has("sort")) {
      return problem(400, "VALIDATION_FAILED", { errors: [{ field: "sort" }] });
    }
    const items = spacesFor(operator.userId).map((space) => ({
      spaceId: space.spaceId,
      name: space.name,
      role: space.role,
    }));
    return HttpResponse.json({
      items,
      page: { number: 0, size: 50, totalItems: items.length, totalPages: items.length === 0 ? 0 : 1 },
    });
  }),
];
