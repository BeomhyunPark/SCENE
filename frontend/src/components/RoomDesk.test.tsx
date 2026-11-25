import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { checkInCodeFor, seededParticipants } from "../mocks/checkInStore";
import { publishDeskRooms, resetDeskRooms, setDeskLodging } from "../mocks/deskRooms";
import { seedDemoRoster } from "../mocks/fixtures/demoRoster";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { setLifecycle } from "../mocks/operatorStore";
import { tableApplications } from "../mocks/participantStore";

/** The camera is replaced: tests push decoded values through `read`, as the decoder would. */
const camera = vi.hoisted(() => ({ read: (() => {}) as (code: string) => void }));

vi.mock("./qrCamera", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./qrCamera")>();
  return {
    ...actual,
    startQrCamera: async (_video: HTMLVideoElement, onCode: (code: string) => void) => {
      camera.read = onCode;
      return { stop: () => {} };
    },
  };
});

const EVENT = localEvent.eventId;
const WAIT = { timeout: 4000 };
const ROOM_301 = { roomId: "r301", name: "301호", locationNote: "본관 3층" };

function participant(name: string) {
  return seededParticipants().find((item) => item.name === name)!;
}

async function openField() {
  setLifecycle(EVENT, "ACTIVE", 2);
  await login({ userId: localUsers[2].userId });
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/field`]}>
      <App />
    </MemoryRouter>,
  );
}

async function rosterRow(name: string): Promise<HTMLElement> {
  let found: HTMLElement | undefined;
  await waitFor(() => {
    const list = screen.getByRole("list", { name: "체크인 명단" });
    found = within(list)
      .getAllByRole("listitem")
      .find((row) => within(row).queryByText(name, { selector: ".event-field__name" }));
    expect(found).toBeDefined();
  }, WAIT);
  return found!;
}

afterEach(() => {
  resetDeskRooms();
});

describe("현장 운영 방 (G5 #460)", () => {
  it("shows nothing before the room publication, so the rows read as before", async () => {
    await openField();
    const row = await rosterRow("94 김하늘");
    expect(row.querySelector(".field-room")).toBeNull();
  });

  it("shows the published room on the row and 숙박 안 함 for someone who sleeps no night", async () => {
    publishDeskRooms(EVENT, { [participant("김하늘").participantId]: ROOM_301 });
    setDeskLodging(EVENT, { [participant("박서준").participantId]: "NOT_LODGING" });
    await openField();

    const row = await rosterRow("94 김하늘");
    expect(row.querySelector(".field-room")).toHaveTextContent("방301호 · 본관 3층");
    const away = await rosterRow("96 박서준");
    expect(away.querySelector(".field-room")).toHaveTextContent("숙박 안 함");
    expect(away.querySelector(".field-room__label")).toBeNull();
  });

  it("tells the room right after a manual check-in", async () => {
    publishDeskRooms(EVENT, { [participant("김하늘").participantId]: ROOM_301 });
    await openField();
    const row = await rosterRow("94 김하늘");
    fireEvent.click(within(row).getByRole("button", { name: "94 김하늘 체크인" }));
    expect(await screen.findByRole("status", {}, WAIT)).toHaveTextContent(
      "94 김하늘 님을 체크인했어요. 방: 301호 · 본관 3층",
    );
  });

  it("shows the room under the name on the QR result", async () => {
    publishDeskRooms(EVENT, { [participant("김하늘").participantId]: { ...ROOM_301, locationNote: null } });
    await openField();
    const button = await screen.findByRole("button", { name: "QR 스캔" }, WAIT);
    await waitFor(() => expect(button).toBeEnabled(), WAIT);
    fireEvent.click(button);
    const region = await screen.findByRole("region", { name: "QR 스캔" }, WAIT);
    await within(region).findByText("참가자의 체크인 QR을 네모 안에 맞춰 주세요.", {}, WAIT);
    act(() => camera.read(checkInCodeFor(EVENT, participant("김하늘").participantId)));
    await within(region).findByText("체크인됨", {}, WAIT);
    expect(within(region).getByText("301호", { exact: false })).toHaveClass("event-field__scan-group");
  });
});

describe("참가 현황 방 (G5 #460)", () => {
  it("adds the 방 column once rooms are published, and filters 숙박 안 함", async () => {
    seedDemoRoster(20);
    const rows = tableApplications(EVENT);
    publishDeskRooms(EVENT, {
      [rows[0].participantId]: ROOM_301,
      [rows[1].participantId]: ROOM_301,
    });
    setDeskLodging(EVENT, { [rows[2].participantId]: "NOT_LODGING" });
    await login({ userId: localUsers[0].userId });
    render(
      <MemoryRouter initialEntries={[`/events/${EVENT}/participants`]}>
        <App />
      </MemoryRouter>,
    );
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });
    const headers = within(grid)
      .getAllByRole("columnheader")
      .map((cell) => cell.querySelector(".roster__label")?.textContent ?? cell.textContent);
    expect(headers).toContain("방");
    expect(headers.indexOf("방")).toBe(headers.indexOf("조 배정") + 1);
    expect(within(grid).getAllByText("301호")).toHaveLength(2);
    expect(within(grid).getAllByRole("row").at(-1)).toHaveTextContent("배정 2 · 1개 방 · 숙박 안 함 1");

    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    fireEvent.change(screen.getByRole("combobox", { name: "조건 더하기" }), { target: { value: "room" } });
    const room = screen.getByRole("group", { name: /방/ });
    fireEvent.click(within(room).getByRole("checkbox", { name: /^숙박 안 함/ }));
    expect(document.querySelector(".roster__summary strong")?.textContent).toBe("1명");
  });
});
