import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { login } from "../../api/session";
import { localEvent, localUsers } from "../../mocks/fixtures/seed";
import { createOperatorNotice, editAsOtherOperator } from "../../mocks/noticeStore";
import { setLifecycle } from "../../mocks/operatorStore";
import { revokePermissions } from "../../mocks/taskStore";
import { splitLinks } from "./noticeLinks";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const WAIT = { timeout: 4000 };

async function open(path: string, userIndex = 0, status: "DRAFT" | "ACTIVE" | "ENDED" | "ARCHIVED" = "ACTIVE") {
  setLifecycle(EVENT, status, 4);
  await login({ userId: localUsers[userIndex].userId });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function seed(input: Partial<{ title: string; body: string; audience: string; pinned: boolean; important: boolean; publish: boolean }>) {
  const result = createOperatorNotice(EVENT, OWNER, {
    title: input.title ?? "공지",
    body: input.body ?? "본문",
    audience: [{ type: input.audience ?? "ALL" }],
    pinned: input.pinned ?? false,
    important: input.important ?? false,
    publish: input.publish ?? true,
  });
  if (!("notice" in result)) throw new Error("seed failed");
  return result.notice as { noticeId: string };
}

describe("operator notices", () => {
  it("writes and publishes in two taps after typing, then lists it", async () => {
    await open(`/events/${EVENT}/notices`);
    let taps = 0;
    const tap = (element: HTMLElement) => {
      taps += 1;
      fireEvent.click(element);
    };
    tap(await screen.findByRole("button", { name: "공지 쓰기" }, WAIT));
    fireEvent.change(await screen.findByLabelText("제목", {}, WAIT), { target: { value: "집회 장소 변경" } });
    fireEvent.change(screen.getByLabelText("내용"), { target: { value: "대강당으로 와 주세요.\n7시 50분까지" } });
    expect(screen.getByText("신청한 참가자 모두가 봐요.")).toBeInTheDocument();
    tap(screen.getByRole("button", { name: "발행" }));

    expect(await screen.findByRole("status", {}, WAIT)).toHaveTextContent("발행했어요.");
    expect(taps).toBeLessThanOrEqual(3);
    expect(screen.getByRole("heading", { name: "집회 장소 변경" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "공지 목록" }));
    expect(await screen.findByText("집회 장소 변경", {}, WAIT)).toBeInTheDocument();
  });

  it("tells who reads a leaders or staff notice and saves a draft", async () => {
    await open(`/events/${EVENT}/notices/new`);
    fireEvent.change(await screen.findByLabelText("제목", {}, WAIT), { target: { value: "조장 모임" } });
    fireEvent.change(screen.getByLabelText("내용"), { target: { value: "9시 소강당" } });
    fireEvent.click(screen.getByLabelText("조장"));
    expect(screen.getByText(/조장만 봐요/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("운영진"));
    expect(screen.getByText(/참가자에게는 보이지 않아요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "초안으로 저장" }));

    expect(await screen.findByRole("status", {}, WAIT)).toHaveTextContent("초안으로 저장했어요.");
    fireEvent.click(screen.getByRole("button", { name: "발행" }));
    expect(await screen.findByText(/발행했어요/, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "지우기" })).not.toBeInTheDocument();
  });

  it("marks only a leaders or staff audience on the list, not the default 전체 (#483)", async () => {
    seed({ title: "모두에게" });
    seed({ title: "조장에게", audience: "LEADERS" });
    await open(`/events/${EVENT}/notices`);
    const everyone = await screen.findByRole("link", { name: /^모두에게/ }, WAIT);
    const leaders = screen.getByRole("link", { name: /조장에게/ });
    expect(within(everyone).queryByText("전체")).not.toBeInTheDocument();
    expect(within(leaders).getByText("조장")).toBeInTheDocument();
  });

  it("deletes a draft after confirming", async () => {
    const draft = seed({ title: "지울 초안", publish: false });
    await open(`/events/${EVENT}/notices/${draft.noticeId}`);
    fireEvent.click(await screen.findByRole("button", { name: "지우기" }, WAIT));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "지우기" }));
    expect(await screen.findByText("저장한 초안이 없어요.", {}, WAIT)).toBeInTheDocument();
  });

  it("offers 다시 알림 only when a published notice's content changes, and lists it as 수정됨", async () => {
    const notice = seed({ title: "처음 제목" });
    await open(`/events/${EVENT}/notices/${notice.noticeId}/edit`);
    await screen.findByDisplayValue("처음 제목", {}, WAIT);
    expect(screen.getByText(/"수정됨"으로 보여요/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/다시 알림/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "고친 제목" } });
    const renotify = screen.getByRole("checkbox", { name: /다시 알림/ });
    expect(renotify).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("status", {}, WAIT)).toHaveTextContent("저장했어요.");
    expect(screen.getByText(/수정됨/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "공지 목록" }));
    expect(await screen.findByText("고친 제목", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText(/수정됨/)).toBeInTheDocument();
  });

  it("reloads the current notice on a concurrent edit and keeps my text to look at", async () => {
    const notice = seed({ title: "원래 제목" });
    await open(`/events/${EVENT}/notices/${notice.noticeId}/edit`);
    await screen.findByDisplayValue("원래 제목", {}, WAIT);
    editAsOtherOperator(EVENT, notice.noticeId, { title: "다른 사람이 고친 제목" });
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "내가 고친 제목" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("alert", {}, WAIT)).toHaveTextContent("Local manager님이 먼저 고쳤어요.");
    expect(await screen.findByDisplayValue("다른 사람이 고친 제목", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText("내가 고친 제목")).toBeInTheDocument();
  });

  it("refuses a fourth pin with the server's limit and names the pinned notices", async () => {
    seed({ title: "고정 하나", pinned: true });
    seed({ title: "고정 둘", pinned: true });
    seed({ title: "고정 셋", pinned: true });
    const fourth = seed({ title: "네 번째" });
    await open(`/events/${EVENT}/notices/${fourth.noticeId}`);
    fireEvent.click(await screen.findByRole("button", { name: "고정" }, WAIT));
    const alert = await screen.findByRole("alert", {}, WAIT);
    expect(alert).toHaveTextContent("고정은 3개까지예요. 다른 고정을 풀어 주세요.");
    expect(await within(alert).findByRole("link", { name: "고정 하나" }, WAIT)).toBeInTheDocument();
  });

  it("archives, hides from the published list, and unarchives", async () => {
    const notice = seed({ title: "보관할 공지" });
    await open(`/events/${EVENT}/notices/${notice.noticeId}`);
    fireEvent.click(await screen.findByRole("button", { name: "보관" }, WAIT));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "보관" }));
    expect(await screen.findByText(/보관했어요/, {}, WAIT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "보관 해제" }));
    expect(await screen.findByText("보관을 해제했어요.", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "고정" })).toBeInTheDocument();
  });

  it("lets STAFF read without write buttons", async () => {
    const notice = seed({ title: "읽기만" });
    await open(`/events/${EVENT}/notices/${notice.noticeId}`, 2);
    expect(await screen.findByRole("heading", { name: "읽기만" }, WAIT)).toBeInTheDocument();
    expect(await screen.findByText("공지를 쓸 권한이 없어 읽기만 할 수 있어요.", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "고치기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "보관" })).not.toBeInTheDocument();
  });

  it("hides 공지 쓰기 from a MANAGER whose NOTICE_WRITE is revoked", async () => {
    revokePermissions(EVENT, localUsers[1].userId, ["NOTICE_WRITE"]);
    await open(`/events/${EVENT}/notices`, 1);
    expect(await screen.findByText("공지를 쓸 권한이 없어 읽기만 할 수 있어요.", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공지 쓰기" })).not.toBeInTheDocument();
  });

  it("reads only on an archived event and still writes on an ended one", async () => {
    seed({ title: "보관 행사 공지" });
    const view = await open(`/events/${EVENT}/notices`, 0, "ARCHIVED");
    expect(await screen.findByText("보관 행사 공지", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText("보관된 행사라 공지를 읽기만 할 수 있어요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공지 쓰기" })).not.toBeInTheDocument();
    view.unmount();

    await open(`/events/${EVENT}/notices`, 0, "ENDED");
    expect(await screen.findByRole("button", { name: "공지 쓰기" }, WAIT)).toBeInTheDocument();
  });

  it("shows staff notices on the event home and opens one", async () => {
    seed({ title: "전체 공지" });
    seed({ title: "운영진 회의 10시", audience: "STAFF" });
    await open(`/events/${EVENT}`);
    const card = await screen.findByRole("region", { name: "운영진 공지" }, WAIT);
    expect(await within(card).findByText("운영진 회의 10시", {}, WAIT)).toBeInTheDocument();
    expect(within(card).queryByText("전체 공지")).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("link", { name: /운영진 회의 10시/ }));
    expect(await screen.findByRole("heading", { name: "운영진 회의 10시" }, WAIT)).toBeInTheDocument();
  });

  it("opens 공지 from the event menu", async () => {
    await open(`/events/${EVENT}`);
    const links = await screen.findAllByRole("link", { name: "공지" }, WAIT);
    expect(links[0]).toHaveAttribute("href", `/events/${EVENT}/notices`);
  });

  it("draws the body as text and links only http(s) addresses", async () => {
    const notice = seed({ body: "<script>alert(1)</script> <b>굵게</b>\njavascript:alert(1) 안내 https://example.com/a?b=1." });
    const view = await open(`/events/${EVENT}/notices/${notice.noticeId}`);
    expect(await screen.findByText(/<script>alert\(1\)<\/script>/, {}, WAIT)).toBeInTheDocument();
    expect(view.container.querySelector("script")).toBeNull();
    expect(view.container.querySelector(".notice-detail__body b")).toBeNull();
    const links = within(view.container.querySelector(".notice-detail__body") as HTMLElement).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://example.com/a?b=1");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(links[0]).toHaveAttribute("target", "_blank");
  });
});

describe("splitLinks", () => {
  it("keeps other schemes and trailing punctuation as text", () => {
    expect(splitLinks("javascript:alert(1) data:text/html,x")).toEqual([{ kind: "text", value: "javascript:alert(1) data:text/html,x" }]);
    expect(splitLinks("보세요 (http://a.kr/x).")).toEqual([
      { kind: "text", value: "보세요 (" },
      { kind: "link", value: "http://a.kr/x" },
      { kind: "text", value: ")." },
    ]);
  });
});

