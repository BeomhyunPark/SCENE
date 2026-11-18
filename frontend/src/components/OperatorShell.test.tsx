import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { OperatorShell } from "./OperatorShell";

function renderRoutes(path: string, routes: ReactNode) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>{routes}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderOrgAt(path: string) {
  return renderRoutes(
    path,
    <Routes>
      <Route
        path="*"
        element={
          <OperatorShell title="조직" spaceName="Local space">
            <p>본문</p>
          </OperatorShell>
        }
      />
    </Routes>,
  );
}

const orgMenus = [
  ["행사", "/events"],
  ["알림", "/notifications"],
  ["기록", "/history"],
  ["준비 업무", "/tasks"],
  ["안내", "/guides"],
  ["일정", "/schedule"],
  ["현장 운영", "/field"],
  ["참가 현황", "/participants"],
  ["운영 멤버", "/operators"],
  ["연동", "/integrations"],
  ["설정", "/settings"],
] as const;

function renderAt(path: string) {
  return renderRoutes(
    path,
    <Routes>
      <Route
        path="/events/:eventId/*"
        element={
          <OperatorShell
            title="Local event"
            spaceName="Local space"
            eventName="Local event"
            eventHref="/events/e1"
            eventAreas={["participants", "tasks"]}
            participantsHref="/events/e1/participants"
            tasksHref="/events/e1/tasks"
          >
            <p>본문</p>
          </OperatorShell>
        }
      />
    </Routes>,
  );
}

describe("operator shell", () => {
  it("highlights the participants item on the participants page", () => {
    renderAt("/events/e1/participants");
    expect(screen.getByRole("link", { name: "참가 현황" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Local event" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the participants item current on the setup page", () => {
    renderAt("/events/e1/participants/setup");
    expect(screen.getByRole("link", { name: "참가 현황" })).toHaveAttribute("aria-current", "page");
  });

  it("highlights the event on its home and tasks on the task list", () => {
    renderAt("/events/e1");
    expect(screen.getByRole("link", { name: "Local event" })).toHaveAttribute("aria-current", "page");
    cleanup();
    renderAt("/events/e1/tasks/task-1");
    expect(screen.getByRole("link", { name: "준비 업무" })).toHaveAttribute("aria-current", "page");
  });

  it("links every organization menu to its own address", () => {
    renderOrgAt("/events");
    for (const [label, href] of orgMenus) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });

  it("marks only the menu for the current address", () => {
    for (const [label, href] of orgMenus) {
      renderOrgAt(href);
      const current = screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent);
      expect(current).toEqual([label]);
      cleanup();
    }
  });

  it("links the event sidebar's 다른 기능 시작 and 설정 to this event", () => {
    renderAt("/events/e1");
    expect(screen.getByRole("link", { name: "다른 기능 시작" })).toHaveAttribute("href", "/events/e1/areas");
    expect(screen.getByRole("link", { name: "설정" })).toHaveAttribute("href", "/events/e1/settings");
    cleanup();
    renderAt("/events/e1/settings");
    expect(screen.getByRole("link", { name: "설정" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Local event" })).not.toHaveAttribute("aria-current");
    cleanup();
    renderAt("/events/e1/areas");
    expect(screen.getByRole("link", { name: "다른 기능 시작" })).toHaveAttribute("aria-current", "page");
  });

  it("offers 로그아웃 in the organization and event sidebars", () => {
    renderOrgAt("/events");
    expect(screen.getByRole("button", { name: "로그아웃" })).toHaveAttribute("title", "로그아웃");
    cleanup();
    renderAt("/events/e1");
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });

  it("shows 현장 운영 in the event sidebar", () => {
    renderAt("/events/e1/field");
    expect(screen.getByRole("link", { name: "현장 운영" })).toHaveAttribute("href", "/events/e1/field");
    expect(screen.getByRole("link", { name: "현장 운영" })).toHaveAttribute("aria-current", "page");
  });
});

describe("sidebar collapse", () => {
  afterEach(() => localStorage.clear());

  it("collapses to icons, keeps menu names, and remembers the choice", () => {
    renderOrgAt("/events");
    const toggle = screen.getByRole("button", { name: "사이드바 접기" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "사이드바 펼치기" })).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".operator-shell")).toHaveClass("operator-shell--collapsed");
    expect(screen.getByRole("link", { name: "일정" })).toHaveAttribute("title", "일정");
    cleanup();

    renderOrgAt("/events");
    expect(screen.getByRole("button", { name: "사이드바 펼치기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "사이드바 펼치기" }));
    expect(screen.getByRole("button", { name: "사이드바 접기" })).toBeInTheDocument();
    expect(localStorage.getItem("scene.operatorSidebar.collapsed")).toBeNull();
  });

  it("starts expanded when storage cannot be read", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      renderOrgAt("/events");
      expect(screen.getByRole("button", { name: "사이드바 접기" })).toBeInTheDocument();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
