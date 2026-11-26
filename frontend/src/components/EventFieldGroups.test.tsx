import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { checkInCodeFor, seedCheckIn, seededParticipants } from "../mocks/checkInStore";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { publish, readBoard, seedAssignment } from "../mocks/groupStore";
import { setLifecycle } from "../mocks/operatorStore";
import { problem } from "../mocks/problem";
import { server } from "../mocks/server";
import { revokePermissions } from "../mocks/taskStore";

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
const OWNER = localUsers[0].userId;
const WAIT = { timeout: 4000 };

function id(name: string): string {
  return seededParticipants().find((item) => item.name === name)!.participantId;
}

/**
 * 1조: 이수아(94, 조장)·최예린, both arrived. 2조: 김하늘(조장)·김하람·박서준, only 박서준 arrived.
 * 이수아(97)·정민호·한지우 are in no group.
 */
function seedPublished() {
  const one = { groupId: "00000000-0000-4000-8000-00000000a001", name: "1조" };
  const two = { groupId: "00000000-0000-4000-8000-00000000a002", name: "2조" };
  const suas = seededParticipants().filter((item) => item.name === "이수아");
  seedAssignment(EVENT, suas[0].participantId, { ...one, leader: true });
  seedAssignment(EVENT, id("최예린"), { ...one, leader: false });
  seedAssignment(EVENT, id("김하늘"), { ...two, leader: true });
  seedAssignment(EVENT, id("김하람"), { ...two, leader: false });
  seedAssignment(EVENT, id("박서준"), { ...two, leader: false });
  const board = readBoard(EVENT, OWNER) as { boardVersion: number };
  publish(EVENT, OWNER, { expectedBoardVersion: board.boardVersion, confirmUnassigned: true });
  seedCheckIn(EVENT, suas[0].participantId);
  seedCheckIn(EVENT, id("최예린"));
  seedCheckIn(EVENT, id("박서준"));
}

async function openField(userIndex = 2) {
  setLifecycle(EVENT, "ACTIVE", 2);
  await login({ userId: localUsers[userIndex].userId });
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/field`]}>
      <App />
    </MemoryRouter>,
  );
}

async function showGroups() {
  fireEvent.click(await screen.findByRole("button", { name: "조별 명단" }, WAIT));
}

async function groupCard(name: string): Promise<HTMLElement> {
  let found: HTMLElement | undefined;
  await waitFor(() => {
    const list = screen.getByRole("list", { name: "조별 체크인 현황" });
    found = within(list)
      .getAllByRole("listitem")
      .find((item) => item.querySelector(".field-groups__name")?.textContent === name);
    expect(found).toBeDefined();
  }, WAIT);
  return found!;
}

function groupOrder(): string[] {
  return [...document.querySelectorAll(".field-groups__name")].map((item) => item.textContent ?? "");
}

beforeEach(() => {
  camera.read = () => {};
});

describe("field check-in by group", () => {
  it("counts arrivals per published group, names leaders and missing people, and puts groups with missing first", async () => {
    seedPublished();
    await openField();
    await showGroups();

    const two = await groupCard("2조");
    expect(within(two).getByText("도착 1 / 3")).toBeInTheDocument();
    expect(within(two).getByText("조장 94 김하늘")).toBeInTheDocument();
    expect(within(two).getByText("미도착 94 김하늘, 95 김하람")).toBeInTheDocument();

    const one = await groupCard("1조");
    expect(within(one).getByText("도착 2 / 2")).toBeInTheDocument();
    expect(within(one).getByText("조장 94 이수아")).toBeInTheDocument();
    expect(within(one).getByText("모두 도착했어요")).toBeInTheDocument();

    const none = await groupCard("조 없음");
    expect(within(none).getByText("도착 0 / 3")).toBeInTheDocument();
    expect(within(none).getByText("미도착 97 이수아, 정민호, 95 한지우")).toBeInTheDocument();

    expect(groupOrder()).toEqual(["2조", "1조", "조 없음"]);
    expect(screen.getByText("2개 조 중 1개 조에 미도착이 있어요.")).toBeInTheDocument();
    // Phone numbers and other contact details are not on the cards.
    expect(two).not.toHaveTextContent("끝자리");
  });

  it("checks in and cancels from an opened group, and the group count follows", async () => {
    seedPublished();
    await openField();
    await showGroups();

    const two = await groupCard("2조");
    fireEvent.click(within(two).getByRole("button", { expanded: false }));
    const members = await within(two).findByRole("list", { name: "2조 조원" });
    expect(within(members).getByText("조장 · 끝자리 1234")).toBeInTheDocument();

    fireEvent.click(within(members).getByRole("button", { name: "95 김하람 체크인" }));
    expect(await screen.findByText("95 김하람 님을 체크인했어요.", {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(within(two).getByText("도착 2 / 3")).toBeInTheDocument(), WAIT);
    expect(within(two).getByText("미도착 94 김하늘")).toBeInTheDocument();

    fireEvent.click(within(members).getByRole("button", { name: "96 박서준 체크인 취소" }));
    const dialog = await screen.findByRole("dialog", {}, WAIT);
    fireEvent.click(within(dialog).getByRole("button", { name: "취소하기" }));
    expect(await screen.findByText("96 박서준 님의 체크인을 취소했어요.", {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(within(two).getByText("도착 1 / 3")).toBeInTheDocument(), WAIT);
  });

  it("shows the group on 전체 rows once published", async () => {
    seedPublished();
    await openField();
    const list = await screen.findByRole("list", { name: "체크인 명단" }, WAIT);
    await waitFor(() => expect(within(list).getByText("2조 · 끝자리 5678")).toBeInTheDocument(), WAIT);
    expect(within(list).getByText("조 없음 · 끝자리 9090")).toBeInTheDocument();
  });

  it("says nothing is published yet and keeps the 전체 view working", async () => {
    await openField();
    await showGroups();
    expect(await screen.findByText(/아직 공개된 조 편성이 없어요/, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByLabelText("이름 또는 전화 끝 4자리")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "전체 명단" }));
    const list = await screen.findByRole("list", { name: "체크인 명단" }, WAIT);
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(8), WAIT);
  });

  it("is read-only without CHECKIN_WRITE", async () => {
    seedPublished();
    revokePermissions(EVENT, localUsers[2].userId, ["CHECKIN_WRITE"]);
    await openField();
    await showGroups();
    const two = await groupCard("2조");
    expect(within(two).getByText("도착 1 / 3")).toBeInTheDocument();
    fireEvent.click(within(two).getByRole("button", { expanded: false }));
    const members = await within(two).findByRole("list", { name: "2조 조원" });
    await waitFor(() => expect(within(members).getByRole("button", { name: "95 김하람 체크인" })).toBeDisabled(), WAIT);
    expect(within(members).getByRole("button", { name: "96 박서준 체크인 취소" })).toBeDisabled();
  });

  it("explains when the published groups cannot be read", async () => {
    server.use(http.get("/api/v1/operator/events/:eventId/groups/published", () => problem(403, "FORBIDDEN")));
    await openField();
    await showGroups();
    expect(await screen.findByText(/조 편성을 볼 권한이 없어요/, {}, WAIT)).toBeInTheDocument();
  });

  it("names the published group on a QR result", async () => {
    seedPublished();
    await openField();
    const scan = await screen.findByRole("button", { name: "QR 스캔" }, WAIT);
    await waitFor(() => expect(scan).toBeEnabled(), WAIT);
    // The publication has to be loaded before the read for the name to show.
    await waitFor(() => expect(screen.getAllByText(/2조 · 끝자리/).length).toBeGreaterThan(0), WAIT);
    fireEvent.click(scan);
    await screen.findByText("참가자의 체크인 QR을 네모 안에 맞춰 주세요.", {}, WAIT);

    act(() => camera.read(checkInCodeFor(EVENT, id("김하람"))));
    const result = await screen.findByText("95 김하람", { selector: ".event-field__scan-name" }, WAIT);
    const box = result.closest(".event-field__scan-result") as HTMLElement;
    expect(within(box).getByText("2조", { exact: false, selector: ".event-field__scan-group" })).toHaveTextContent(
      "조 2조",
    );

    fireEvent.click(within(box).getByRole("button", { name: "다음 스캔" }));
    act(() => camera.read(checkInCodeFor(EVENT, id("정민호"))));
    const other = await screen.findByText("정민호", { selector: ".event-field__scan-name" }, WAIT);
    expect(other.closest(".event-field__scan-result")).toHaveTextContent("조 조 없음");
  });
});
