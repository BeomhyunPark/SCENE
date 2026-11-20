import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
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
  ["멤버", "/members"],
  ["기록", "/history"],
  ["안내", "/guides"],
  ["일정", "/schedule"],
  ["연동", "/integrations"],
  ["설정", "/settings"],
] as const;

/** Event operation menus live only inside an event (#376). */
const eventOnlyMenus = ["행사 운영", "준비 업무", "현장 운영", "참가 현황", "운영 멤버", "조 편성"] as const;

/** The sidebar menu; the phone bottom bar repeats a few links, and jsdom shows both. */
function sidebar() {
  return within(screen.getByRole("navigation", { name: "운영 메뉴" }));
}

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
    expect(sidebar().getByRole("link", { name: "참가 현황" })).toHaveAttribute("aria-current", "page");
    expect(sidebar().getByRole("link", { name: "Local event" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the participants item current on the setup page", () => {
    renderAt("/events/e1/participants/setup");
    expect(sidebar().getByRole("link", { name: "참가 현황" })).toHaveAttribute("aria-current", "page");
  });

  it("highlights the event on its home and tasks on the task list", () => {
    renderAt("/events/e1");
    expect(sidebar().getByRole("link", { name: "Local event" })).toHaveAttribute("aria-current", "page");
    cleanup();
    renderAt("/events/e1/tasks/task-1");
    expect(sidebar().getByRole("link", { name: "준비 업무" })).toHaveAttribute("aria-current", "page");
  });

  it("links every organization menu to its own address", () => {
    renderOrgAt("/events");
    for (const [label, href] of orgMenus) {
      expect(sidebar().getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
    expect(sidebar().getAllByRole("link")).toHaveLength(orgMenus.length);
  });

  it("shows no event operation menu outside an event (#376)", () => {
    renderOrgAt("/members");
    for (const label of eventOnlyMenus) {
      expect(sidebar().queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("marks only the menu for the current address", () => {
    for (const [label, href] of orgMenus) {
      renderOrgAt(href);
      const current = sidebar()
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent);
      expect(current).toEqual([label]);
      cleanup();
    }
  });

  it("links the event sidebar's 다른 기능 시작 and 설정 to this event", () => {
    renderAt("/events/e1");
    expect(sidebar().getByRole("link", { name: "다른 기능 시작" })).toHaveAttribute("href", "/events/e1/areas");
    expect(sidebar().getByRole("link", { name: "설정" })).toHaveAttribute("href", "/events/e1/settings");
    cleanup();
    renderAt("/events/e1/settings");
    expect(sidebar().getByRole("link", { name: "설정" })).toHaveAttribute("aria-current", "page");
    expect(sidebar().getByRole("link", { name: "Local event" })).not.toHaveAttribute("aria-current");
    cleanup();
    renderAt("/events/e1/areas");
    expect(sidebar().getByRole("link", { name: "다른 기능 시작" })).toHaveAttribute("aria-current", "page");
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
    expect(sidebar().getByRole("link", { name: "현장 운영" })).toHaveAttribute("href", "/events/e1/field");
    expect(sidebar().getByRole("link", { name: "현장 운영" })).toHaveAttribute("aria-current", "page");
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
    expect(sidebar().getByRole("link", { name: "일정" })).toHaveAttribute("title", "일정");
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

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderDrawerAt(path: string, event = false) {
  return renderRoutes(
    path,
    <Routes>
      <Route
        path="*"
        element={
          event ? (
            <OperatorShell
              title="Local event"
              spaceName="Local space"
              eventName="Local event"
              eventHref="/events/e1"
              eventAreas={["participants", "tasks"]}
              participantsHref="/events/e1/participants"
              tasksHref="/events/e1/tasks"
            >
              <Where />
            </OperatorShell>
          ) : (
            <OperatorShell title="조직" spaceName="Local space">
              <Where />
            </OperatorShell>
          )
        }
      />
    </Routes>,
  );
}

function openDrawer() {
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  return screen.getByRole("dialog", { name: "운영 메뉴" });
}

describe("phone menu drawer (#368)", () => {
  afterEach(() => localStorage.clear());

  it("opens from the header button with the sidebar's organization menus and current page", () => {
    renderDrawerAt("/events");
    const button = screen.getByRole("button", { name: "메뉴 열기" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const dialog = openDrawer();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button.getAttribute("aria-controls")).toBe(dialog.id);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    for (const [label, href] of orgMenus) {
      expect(within(dialog).getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
    for (const label of eventOnlyMenus) {
      expect(within(dialog).queryByText(label)).not.toBeInTheDocument();
    }
    expect(within(dialog).getByRole("link", { name: "행사" })).toHaveAttribute("aria-current", "page");
    expect(within(dialog).getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(within(dialog).getByText("Local space")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "메뉴 닫기" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("navigates on a menu tap, closes, and gives focus back to the menu button", () => {
    renderDrawerAt("/events");
    fireEvent.click(within(openDrawer()).getByRole("link", { name: "설정" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/settings");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "메뉴 열기" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "메뉴 열기" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes on Esc, the backdrop, and the close button", () => {
    renderDrawerAt("/events");
    const button = screen.getByRole("button", { name: "메뉴 열기" });

    openDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    openDrawer();
    fireEvent.click(document.querySelector(".operator-drawer__backdrop")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(within(openDrawer()).getByRole("button", { name: "메뉴 닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(screen.getByTestId("where")).toHaveTextContent("/events");
  });

  it("keeps Tab inside the drawer and makes the page behind inert", () => {
    renderDrawerAt("/events");
    const dialog = openDrawer();
    expect(document.querySelector(".operator-shell__main")).toHaveAttribute("inert");
    expect(document.querySelector(".operator-shell__sidebar")).toHaveAttribute("inert");
    const close = within(dialog).getByRole("button", { name: "메뉴 닫기" });
    const signOutButton = within(dialog).getByRole("button", { name: "로그아웃" });
    signOutButton.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(signOutButton).toHaveFocus();
  });

  it("shows the event menus inside an event and opens 운영 멤버", () => {
    renderDrawerAt("/events/e1", true);
    const dialog = openDrawer();
    expect(within(dialog).getByRole("link", { name: "Local event" })).toHaveAttribute("aria-current", "page");
    for (const label of ["준비 업무", "참가 현황", "현장 운영", "조 편성", "운영 멤버", "다른 기능 시작", "설정"]) {
      expect(within(dialog).getByRole("link", { name: label })).toBeInTheDocument();
    }
    fireEvent.click(within(dialog).getByRole("link", { name: "운영 멤버" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/events/e1/operators");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const again = openDrawer();
    expect(within(again).getByRole("link", { name: "운영 멤버" })).toHaveAttribute("aria-current", "page");
    expect(within(again).getByRole("link", { name: "Local event" })).not.toHaveAttribute("aria-current");
  });

  it("renders the drawer outside the collapsible sidebar, so collapse never applies to it", () => {
    localStorage.setItem("scene.operatorSidebar.collapsed", "1");
    renderDrawerAt("/events");
    const dialog = openDrawer();
    expect(dialog.closest(".operator-shell__sidebar")).toBeNull();
    expect(within(dialog).getByRole("link", { name: "일정" })).toBeVisible();
  });
});

describe("phone bottom bar (#368)", () => {
  const bar = () => within(screen.getByRole("navigation", { name: "주요 메뉴" }));
  const barLinks = () => bar().getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);

  it("offers only 행사·알림·멤버 and 전체 메뉴 outside an event (#376)", () => {
    renderDrawerAt("/events");
    expect(barLinks()).toEqual([
      ["행사", "/events"],
      ["알림", "/notifications"],
      ["멤버", "/members"],
    ]);
    expect(bar().getByRole("link", { name: "행사" })).toHaveAttribute("aria-current", "page");
    expect(bar().getByRole("button", { name: "전체 메뉴" })).toHaveAttribute("aria-expanded", "false");
    cleanup();
    renderDrawerAt("/settings");
    expect(bar().queryAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toEqual([]);
  });

  it("offers 홈·현장 운영·참가 현황·알림 inside an event and marks the current one", () => {
    renderDrawerAt("/events/e1/field", true);
    expect(barLinks()).toEqual([
      ["홈", "/events/e1"],
      ["현장 운영", "/events/e1/field"],
      ["참가 현황", "/events/e1/participants"],
      ["알림", "/events/e1/notifications"],
    ]);
    expect(bar().getByRole("link", { name: "현장 운영" })).toHaveAttribute("aria-current", "page");
    expect(bar().getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
  });

  it("leaves 조 편성 to 전체 메뉴 and skips 참가 현황 when the event has not turned it on", () => {
    renderRoutes(
      "/events/e1/groups",
      <Routes>
        <Route
          path="*"
          element={
            <OperatorShell title="조 편성" spaceName="Local space" eventName="Local event" eventHref="/events/e1">
              <p>본문</p>
            </OperatorShell>
          }
        />
      </Routes>,
    );
    expect(barLinks()).toEqual([
      ["홈", "/events/e1"],
      ["현장 운영", "/events/e1/field"],
      ["알림", "/events/e1/notifications"],
    ]);
    expect(bar().queryAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toEqual([]);
  });

  it("marks 알림 on the notifications page and 멤버 on the members page", () => {
    renderDrawerAt("/notifications");
    expect(bar().getByRole("link", { name: "알림" })).toHaveAttribute("aria-current", "page");
    cleanup();
    renderDrawerAt("/members");
    expect(bar().getByRole("link", { name: "멤버" })).toHaveAttribute("aria-current", "page");
  });

  it("opens the same drawer from 전체 메뉴 and gives focus back to it", () => {
    renderDrawerAt("/events");
    const all = bar().getByRole("button", { name: "전체 메뉴" });
    fireEvent.click(all);
    const dialog = screen.getByRole("dialog", { name: "운영 메뉴" });
    expect(all).toHaveAttribute("aria-expanded", "true");
    expect(all.getAttribute("aria-controls")).toBe(dialog.id);
    expect(screen.getByRole("button", { name: "메뉴 열기", hidden: true }).getAttribute("aria-controls")).toBe(dialog.id);
    expect(document.querySelector(".operator-bottom-nav")).toHaveAttribute("inert");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(all).toHaveFocus();
  });
});
