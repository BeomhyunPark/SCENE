import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { server } from "../mocks/server";

const EVENT = localEvent.eventId;
const SECRET = "hidden-server-detail";

function eventBody(status: string, version: number) {
  return {
    eventId: EVENT,
    name: "Local event",
    lifecycleStatus: status,
    lifecycleVersion: version,
    startDate: null,
    endDate: null,
    place: null,
    eventType: null,
  };
}

async function openApp(path: string, state?: unknown) {
  await login({ userId: localUsers[0].userId });
  return render(
    <MemoryRouter initialEntries={[state === undefined ? path : { pathname: path, state }]}>
      <App />
    </MemoryRouter>,
  );
}

describe("event end", () => {
  it("opens settings from the event home and does not end a draft", async () => {
    await openApp(`/events/${EVENT}`);
    fireEvent.click(await screen.findByRole("button", { name: "행사 설정" }, { timeout: 4000 }));
    expect(await screen.findByRole("heading", { name: "행사 설정" })).toBeInTheDocument();
    expect(await screen.findByText("진행 중인 행사만 종료할 수 있어요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "행사 종료" })).not.toBeInTheDocument();
  });

  it("sends a direct end address to settings", async () => {
    server.use(http.get("/api/v1/operator/events/:eventId", () => HttpResponse.json(eventBody("ACTIVE", 3))));
    await openApp(`/events/${EVENT}/end`);
    expect(await screen.findByRole("heading", { name: "행사 설정" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "행사를 종료할까요?" })).not.toBeInTheDocument();
  });

  it("ends an active event and lands on the ended home", async () => {
    let status = "ACTIVE";
    let version = 3;
    const posted: unknown[] = [];
    server.use(
      http.get("/api/v1/operator/events/:eventId", () => HttpResponse.json(eventBody(status, version))),
      http.post("/api/v1/operator/events/:eventId/end", async ({ request }) => {
        posted.push(await request.json());
        status = "ENDED";
        version += 1;
        return HttpResponse.json({
          outcome: "TRANSITIONED",
          lifecycleStatus: "ENDED",
          lifecycleVersion: version,
          actedAs: "EVENT_OWNER",
        });
      }),
    );
    await openApp(`/events/${EVENT}/settings`);
    fireEvent.click(await screen.findByRole("button", { name: "행사 종료" }, { timeout: 4000 }));
    expect(await screen.findByRole("heading", { name: "행사를 종료할까요?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "행사 종료" }));
    expect(await screen.findByRole("heading", { name: "행사가 종료됐어요" })).toBeInTheDocument();
    expect(posted).toEqual([{ expectedLifecycleVersion: 3 }]);
    expect(JSON.stringify(posted)).not.toContain("override");
  });

  it("acknowledges open tasks before ending", async () => {
    let status = "ACTIVE";
    let version = 4;
    const posted: unknown[] = [];
    server.use(
      http.get("/api/v1/operator/events/:eventId", () => HttpResponse.json(eventBody(status, version))),
      http.post("/api/v1/operator/events/:eventId/end", async ({ request }) => {
        const body = await request.json();
        posted.push(body);
        if (posted.length === 1) {
          return HttpResponse.json(
            {
              type: "urn:scene:problem:confirmation-required",
              title: "CONFIRMATION_REQUIRED",
              status: 409,
              detail: SECRET,
              code: "CONFIRMATION_REQUIRED",
              warnings: { openTasks: 2 },
            },
            { status: 409, headers: { "Content-Type": "application/problem+json" } },
          );
        }
        status = "ENDED";
        version += 1;
        return HttpResponse.json({
          outcome: "TRANSITIONED",
          lifecycleStatus: "ENDED",
          lifecycleVersion: version,
          actedAs: "EVENT_OWNER",
        });
      }),
    );
    await openApp(`/events/${EVENT}/end`, { from: "settings" });
    fireEvent.click(await screen.findByRole("button", { name: "행사 종료" }, { timeout: 4000 }));
    expect(await screen.findByRole("heading", { name: "끝내지 않은 업무가 있어요" })).toBeInTheDocument();
    expect(screen.getByText(/열린 업무 2건/)).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "그래도 종료" }));
    expect(await screen.findByRole("heading", { name: "행사가 종료됐어요" })).toBeInTheDocument();
    expect(posted[1]).toEqual({ expectedLifecycleVersion: 4, acknowledgeWarnings: true });
  });

  it("asks to reload when the version changed", async () => {
    server.use(
      http.get("/api/v1/operator/events/:eventId", () => HttpResponse.json(eventBody("ACTIVE", 1))),
      http.post("/api/v1/operator/events/:eventId/end", () =>
        HttpResponse.json(
          {
            type: "urn:scene:problem:concurrent-modification",
            title: "CONCURRENT_MODIFICATION",
            status: 409,
            detail: SECRET,
            code: "CONCURRENT_MODIFICATION",
          },
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await openApp(`/events/${EVENT}/end`, { from: "settings" });
    fireEvent.click(await screen.findByRole("button", { name: "행사 종료" }, { timeout: 4000 }));
    expect(await screen.findByRole("heading", { name: "다른 변경이 먼저 반영됐어요" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it("hides the override reason when a space owner is blocked", async () => {
    const posted: unknown[] = [];
    server.use(
      http.get("/api/v1/operator/events/:eventId", () => HttpResponse.json(eventBody("ACTIVE", 1))),
      http.post("/api/v1/operator/events/:eventId/end", async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json(
          {
            type: "urn:scene:problem:override-required",
            title: "OVERRIDE_REQUIRED",
            status: 403,
            detail: SECRET,
            code: "OVERRIDE_REQUIRED",
          },
          { status: 403, headers: { "Content-Type": "application/problem+json" } },
        );
      }),
    );
    await openApp(`/events/${EVENT}/end`, { from: "settings" });
    fireEvent.click(await screen.findByRole("button", { name: "행사 종료" }, { timeout: 4000 }));
    expect(await screen.findByRole("heading", { name: "행사를 종료할 수 없어요" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(posted).toHaveLength(1);
    expect(JSON.stringify(posted[0])).not.toContain("override");
  });

  it("does not offer end to someone who is not an event owner", async () => {
    const posted: unknown[] = [];
    server.use(
      http.get("/api/v1/operator/events/:eventId", () => HttpResponse.json(eventBody("ACTIVE", 1))),
      http.get("/api/v1/operator/events/:eventId/operators", () =>
        HttpResponse.json({
          items: [{ userId: localUsers[0].userId, displayName: "Local owner", role: "MANAGER" }],
          page: { number: 0, size: 50, totalItems: 1, totalPages: 1 },
        }),
      ),
      http.post("/api/v1/operator/events/:eventId/end", async ({ request }) => {
        posted.push(await request.json());
        return new HttpResponse(null, { status: 200 });
      }),
    );
    await openApp(`/events/${EVENT}/end`, { from: "settings" });
    expect(await screen.findByRole("heading", { name: "행사를 종료할 수 없어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(posted).toEqual([]);
  });

  it("sends an already ended address to the ended home", async () => {
    server.use(http.get("/api/v1/operator/events/:eventId", () => HttpResponse.json(eventBody("ENDED", 2))));
    await openApp(`/events/${EVENT}/end`);
    expect(await screen.findByRole("heading", { name: "행사가 종료됐어요" }, { timeout: 4000 })).toBeInTheDocument();
  });
});
