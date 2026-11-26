import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { login } from "../../api/session";
import { seedDemoRoster } from "../../mocks/fixtures/demoRoster";
import { localEvent, localUsers } from "../../mocks/fixtures/seed";
import { tableApplications } from "../../mocks/participantStore";
import { workingGroupOf } from "../../mocks/groupStore";
import { chooseOption } from "../../test/select";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const PATH = `/events/${EVENT}/participants`;

function openApp(path = PATH) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function summary() {
  return document.querySelector(".roster__summary strong")?.textContent;
}

function genderField(fields: ReturnType<typeof seedDemoRoster>["fields"]) {
  const field = fields.find((item) => item.presetKey === "GENDER")!;
  return { field, options: field.config.options! };
}

/** People whose answer to a single-choice question is this option. */
function countGender(optionId: string): number {
  return tableApplications(EVENT).filter((row) => Object.values(row.answers).some((value) => value.optionId === optionId)).length;
}

function cellAt(grid: HTMLElement, r: number, c: number): HTMLElement {
  return grid.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)!;
}

describe("참가 현황 table at retreat size", () => {
  it("shows all 200 applicants in one scrolling sheet with the design's columns and a summary line", async () => {
    seedDemoRoster(200);
    await login({ userId: OWNER });
    openApp();

    const grid = await screen.findByRole("grid", { name: "신청자 명단" });
    expect(summary()).toBe("200명");
    // header + 200 rows + summary line, no pages
    expect(within(grid).getAllByRole("row")).toHaveLength(202);
    expect(screen.queryByRole("navigation", { name: "쪽" })).not.toBeInTheDocument();
    expect(within(grid).getAllByRole("columnheader").map((cell) => cell.querySelector(".roster__label")?.textContent ?? cell.textContent)).toEqual([
      "참가자",
      "소속",
      "연락처",
      "현재 상태",
      "조 배정",
      "참석 범위",
      "참석 일정",
    ]);
    const totals = within(grid).getAllByRole("row").at(-1)!;
    expect(totals).toHaveTextContent("200명");
    expect(totals).toHaveTextContent(/도착 \d+ · 전 \d+/);
    expect(totals).toHaveTextContent(/응답 \d+ · 고유 \d+/);
  });

  it("filters two questions together, including 응답 없음, and keeps choices in the address", async () => {
    const { fields } = seedDemoRoster(200);
    const { field, options } = genderField(fields);
    await login({ userId: OWNER });
    openApp();
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });

    // The column menu opens the filter (the 필터 button above the table is gone).
    fireEvent.click(within(grid).getByRole("button", { name: "현재 상태 열 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "필터" }));
    chooseOption(screen.getByRole("combobox", { name: "조건 더하기" }), field.fieldId);
    const gender = screen.getByRole("group", { name: /성별/ });
    fireEvent.click(within(gender).getByRole("checkbox", { name: new RegExp(`^${options[0].label}`) }));
    const male = countGender(options[0].optionId);
    expect(summary()).toBe(`${male}명`);

    const shirt = fields.find((item) => item.label === "티셔츠 크기")!;
    chooseOption(screen.getByRole("combobox", { name: "조건 더하기" }), shirt.fieldId);
    const shirtBox = screen.getByRole("group", { name: /티셔츠 크기/ });
    fireEvent.click(within(shirtBox).getByRole("checkbox", { name: /^응답 없음/ }));
    const expected = tableApplications(EVENT).filter(
      (row) => row.answers[field.fieldId]?.optionId === options[0].optionId && !row.answers[shirt.fieldId],
    ).length;
    expect(summary()).toBe(`${expected}명`);
    expect(screen.getByRole("list", { name: "걸린 조건" })).toHaveTextContent("티셔츠 크기: 응답 없음");
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("group", { name: "필터" })).not.toBeInTheDocument();
  });

  it("marks a filtered or sorted header and takes either off from the column menu", async () => {
    const { fields } = seedDemoRoster(40);
    const { field, options } = genderField(fields);
    await login({ userId: OWNER });
    openApp(`${PATH}?f.${field.fieldId}=${options[0].optionId}&sort=status:asc&cols=status,${field.fieldId}`);
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });
    const gender = within(grid).getByRole("columnheader", { name: /성별/ });
    expect(within(gender).getByRole("img", { name: "필터 걸림" })).toBeInTheDocument();
    expect(summary()).toBe(`${countGender(options[0].optionId)}명`);

    fireEvent.click(within(grid).getByRole("button", { name: "성별 열 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "필터 해제" }));
    expect(summary()).toBe("40명");
    expect(within(gender).queryByRole("img", { name: "필터 걸림" })).not.toBeInTheDocument();

    const status = within(grid).getByRole("columnheader", { name: /현재 상태/ });
    expect(status).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(within(grid).getByRole("button", { name: "현재 상태 열 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "정렬 해제" }));
    expect(status).toHaveAttribute("aria-sort", "none");
  });

  it("restores a filter, sort and columns from the address after a reload", async () => {
    const { fields } = seedDemoRoster(200);
    const { field, options } = genderField(fields);
    const shirt = fields.find((item) => item.label === "티셔츠 크기")!;
    await login({ userId: OWNER });
    openApp(`${PATH}?f.${field.fieldId}=${options[1].optionId}&sort=person:desc&cols=status,${shirt.fieldId}`);

    const table = await screen.findByRole("grid", { name: "신청자 명단" });
    expect(summary()).toBe(`${countGender(options[1].optionId)}명`);
    expect(within(table).getByRole("columnheader", { name: /참가자/ })).toHaveAttribute("aria-sort", "descending");
    expect(within(table).getByRole("columnheader", { name: /티셔츠 크기/ })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: /연락처/ })).not.toBeInTheDocument();
  });

  it("sorts by a header and narrows with the status chips", async () => {
    seedDemoRoster(200);
    await login({ userId: OWNER });
    openApp();
    const table = await screen.findByRole("grid", { name: "신청자 명단" });

    const header = within(table).getByRole("columnheader", { name: /조 배정/ });
    fireEvent.click(header.querySelector<HTMLElement>(".roster__sort")!);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    // Numeric order: 1조, 2조, … 10조, then 미배정 last.
    expect(within(within(table).getAllByRole("row")[1]).getAllByRole("cell")[4].textContent).toMatch(/^1조/);

    const unassigned = tableApplications(EVENT).filter((row) => !workingGroupOf(EVENT, row.participantId)).length;
    const chip = screen.getByRole("button", { name: new RegExp(`미배정 ${unassigned}`) });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(summary()).toBe(`${unassigned}명`);
  });

  it("hides a column and shows hidden ones again from the column menu", async () => {
    seedDemoRoster(40);
    await login({ userId: OWNER });
    openApp();
    const table = await screen.findByRole("grid", { name: "신청자 명단" });

    fireEvent.click(within(table).getByRole("button", { name: "연락처 열 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "열 숨기기" }));
    expect(within(table).queryByRole("columnheader", { name: /연락처/ })).not.toBeInTheDocument();

    fireEvent.click(within(table).getByRole("button", { name: "현재 상태 열 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^숨긴 열 보이기/ }));
    const hidden = screen.getByRole("group", { name: "숨긴 열" });
    expect(within(hidden).getByRole("menuitem", { name: "연락처" })).toBeInTheDocument();
    expect(within(hidden).getByRole("menuitem", { name: "옛 질문 (숨김)" })).toBeInTheDocument();
    fireEvent.click(within(hidden).getByRole("menuitem", { name: "티셔츠 크기" }));
    const headers = within(table).getAllByRole("columnheader").map((cell) => cell.querySelector(".roster__label")?.textContent);
    // It comes back right of the column whose menu was used.
    expect(headers.indexOf("티셔츠 크기")).toBe(headers.indexOf("현재 상태") + 1);
  });

  it("counts one question per option and crosses two, then opens the people behind a cell", async () => {
    const { fields } = seedDemoRoster(200);
    const { field, options } = genderField(fields);
    const serve = fields.find((item) => item.label === "섬기고 싶은 곳")!;
    await login({ userId: OWNER });
    openApp(`${PATH}?view=count`);

    chooseOption(await screen.findByRole("combobox", { name: "세는 항목" }), field.fieldId);
    const pivot = screen.getByRole("table", { name: "성별 보기별 인원" });
    const male = countGender(options[0].optionId);
    expect(within(pivot).getByRole("button", { name: `${options[0].label} ${male}명 명단 보기` })).toHaveTextContent(String(male));

    chooseOption(screen.getByRole("combobox", { name: "세는 항목" }), serve.fieldId);
    const multi = screen.getByRole("table", { name: "섬기고 싶은 곳 보기별 인원" });
    const perOption = serve.config.options!.map(
      (option) => tableApplications(EVENT).filter((row) => (row.answers[serve.fieldId]?.optionIds as string[] | undefined)?.includes(option.optionId)).length,
    );
    expect(within(multi).getByRole("button", { name: `찬양 ${perOption[0]}명 명단 보기` })).toBeInTheDocument();
    expect(perOption.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(200);
    expect(screen.getByText(/고른 보기마다 한 번씩 세요/)).toBeInTheDocument();

    chooseOption(screen.getByRole("combobox", { name: "세는 항목" }), field.fieldId);
    const cohort = fields.find((item) => item.systemKey === "COHORT")!;
    chooseOption(screen.getByRole("combobox", { name: /나눠 보기/ }), cohort.fieldId);
    const cross = screen.getByRole("table", { name: "성별 × 또래" });
    const cellCount = tableApplications(EVENT).filter(
      (row) => row.answers[field.fieldId]?.optionId === options[0].optionId && row.answers[cohort.fieldId]?.text === "94",
    ).length;
    fireEvent.click(within(cross).getByRole("button", { name: `${options[0].label} · 94 ${cellCount}명 명단 보기` }));

    expect(await screen.findByRole("grid", { name: "신청자 명단" })).toBeInTheDocument();
    expect(summary()).toBe(`${cellCount}명`);
  });

  it("searches by name and phone digits without putting the words in the address", async () => {
    seedDemoRoster(60);
    await login({ userId: OWNER });
    openApp();
    await screen.findByRole("grid", { name: "신청자 명단" });
    const target = tableApplications(EVENT)[5];
    const phone = Object.values(target.answers).find((value) => typeof value.text === "string" && value.text.startsWith("010"))!;
    fireEvent.change(screen.getByRole("searchbox", { name: "이름, 연락처, 소속, 메모 검색" }), {
      target: { value: String(phone.text).slice(-4) },
    });
    expect(Number(summary()?.replace("명", ""))).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("grid", { name: "신청자 명단" })).toHaveTextContent(String(phone.text));
  });

  it("moves between cells with the keyboard and copies a range as tab-separated text", async () => {
    seedDemoRoster(30);
    const writes: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (text: string) => (writes.push(text), Promise.resolve()) },
    });
    await login({ userId: OWNER });
    openApp(`${PATH}?sort=person:asc`);
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });

    const start = cellAt(grid, 0, 0);
    fireEvent.mouseDown(start);
    expect(start).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(start, { key: "ArrowDown" });
    expect(cellAt(grid, 1, 0)).toHaveAttribute("tabindex", "0");
    expect(cellAt(grid, 1, 0)).toHaveFocus();
    fireEvent.keyDown(cellAt(grid, 1, 0), { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(cellAt(grid, 1, 1), { key: "ArrowDown", shiftKey: true });
    expect(cellAt(grid, 2, 1)).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(cellAt(grid, 2, 1), { key: "c", ctrlKey: true });

    await screen.findByText("2행 2열을 복사했어요.");
    const lines = writes[0].split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].split("\t")).toEqual([cellAt(grid, 1, 0).textContent?.slice(1), cellAt(grid, 1, 1).textContent]);
  });

  it("copies no phone numbers for an operator without contact access", async () => {
    seedDemoRoster(10);
    const writes: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (text: string) => (writes.push(text), Promise.resolve()) },
    });
    await login({ userId: localUsers[2].userId });
    openApp();
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });
    fireEvent.mouseDown(cellAt(grid, 0, 0));
    fireEvent.keyDown(cellAt(grid, 0, 0), { key: "a", ctrlKey: true });
    fireEvent.keyDown(cellAt(grid, 0, 0), { key: "c", ctrlKey: true });
    await screen.findByText(/행 \d+열을 복사했어요/);
    expect(writes[0].split("\n")).toHaveLength(10);
    expect(writes[0]).not.toMatch(/010-/);
  });

  it("opens the application with Enter on a cell", async () => {
    seedDemoRoster(5);
    await login({ userId: OWNER });
    openApp();
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });
    fireEvent.mouseDown(cellAt(grid, 0, 1));
    fireEvent.keyDown(cellAt(grid, 0, 1), { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "신청 내용" })).toBeInTheDocument();
  });

  it("groups rows by a column with counts, and folds a group", async () => {
    seedDemoRoster(200);
    await login({ userId: OWNER });
    openApp();
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });

    chooseOption(screen.getByRole("combobox", { name: "묶어 보기" }), "group");
    const unassigned = tableApplications(EVENT).filter((row) => !workingGroupOf(EVENT, row.participantId)).length;
    const toggle = within(grid).getByRole("button", { name: new RegExp(`조 배정: 미배정\\s*${unassigned}명`) });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const before = within(grid).getAllByRole("row").length;
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(grid).getAllByRole("row")).toHaveLength(before - unassigned);
  });

  it("switches density, resizes a column from the keyboard and reorders columns", async () => {
    seedDemoRoster(20);
    await login({ userId: OWNER });
    openApp();
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });

    fireEvent.click(screen.getByRole("radio", { name: "촘촘하게" }));
    expect(grid).toHaveClass("roster__table--compact");

    const handle = within(grid).getByRole("separator", { name: "소속 열 너비" });
    const width = Number(handle.getAttribute("aria-valuenow"));
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(Number(within(grid).getByRole("separator", { name: "소속 열 너비" }).getAttribute("aria-valuenow"))).toBe(width + 16);

    // Drag the 참석 범위 header onto 조 배정 (the column list panel is gone).
    const dataTransfer = { setData: () => undefined, effectAllowed: "" };
    const header = (label: string) => within(grid).getByRole("columnheader", { name: new RegExp(label) });
    fireEvent.dragStart(header("참석 범위"), { dataTransfer });
    fireEvent.dragOver(header("조 배정"), { dataTransfer });
    fireEvent.drop(header("조 배정"), { dataTransfer });
    const headers = within(grid).getAllByRole("columnheader").map((cell) => cell.querySelector(".roster__label")?.textContent);
    expect(headers.indexOf("참석 범위")).toBeLessThan(headers.indexOf("조 배정"));
  });
});
