import { HttpResponse } from "msw";

export function problem(
  status: number,
  code: string,
  extra?: { errors?: { field: string }[]; eventStatus?: string },
): Response {
  return HttpResponse.json(
    {
      type: `urn:scene:problem:${code.toLowerCase().replaceAll("_", "-")}`,
      title: code,
      status,
      detail: "",
      code,
      traceId: "mock-trace",
      ...extra,
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}
