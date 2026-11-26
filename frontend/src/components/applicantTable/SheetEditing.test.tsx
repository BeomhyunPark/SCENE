import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { login } from "../../api/session";
import { seedDemoRoster } from "../../mocks/fixtures/demoRoster";
import { localEvent, localUsers } from "../../mocks/fixtures/seed";
import { readRosterSheet } from "../../mocks/rosterSheetStore";
import { tableApplications } from "../../mocks/participantStore";

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

function cellAt(grid: HTMLElement, r: number, c: number): HTMLElement {
  return grid.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)!;
}

function headers(grid: HTMLElement): string[] {
  return within(grid)
    .getAllByRole("columnheader")
    .map((cell) => cell.querySelector(".roster__label")?.textContent ?? "");
}

function type(grid: HTMLElement, r: number, c: number, text: string) {
  const cell = cellAt(grid, r, c);
  fireEvent.mouseDown(cell);
  fireEvent.keyDown(cell, { key: "Enter" });
  const editor = within(grid).getByRole("textbox");
  fireEvent.change(editor, { target: { value: text } });
  fireEvent.keyDown(editor, { key: "Enter" });
}

function sheetDoc() {
  const sheet = readRosterSheet(EVENT, OWNER);
  if ("code" in sheet) throw new Error(sheet.code);
  return sheet.doc;
}

describe("참가 현황 as a spreadsheet (#509)", () => {
  it("adds an operator column, types into it, and counts it from an operator row with a formula", async () => {
    seedDemoRoster(5);
    await login({ userId: OWNER });
    openApp();
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });

    fireEvent.click(screen.getByRole("button", { name: "+ 열" }));
    await waitFor(() => expect(headers(grid)).toContain("새 열"));
    const c = headers(grid).indexOf("새 열");
    type(grid, 0, c, "입금");
    type(grid, 2, c, "입금");
    expect(cellAt(grid, 0, c)).toHaveTextContent("입금");
    await waitFor(() => expect(Object.values(sheetDoc().cells).filter((cell) => cell.v === "입금")).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "+ 행" }));
    await waitFor(() => expect(grid.querySelector(".sheet-row--operator")).not.toBeNull());
    const letter = String.fromCharCode(65 + c);
    type(grid, 5, c, `=COUNTIF(${letter}:${letter},"입금")&"명"`);
    expect(cellAt(grid, 5, c)).toHaveTextContent("2명");
    // The operator row is numbered after the five participants.
    expect(grid.querySelector(".sheet-row--operator th")).toHaveTextContent("6");
    await waitFor(() => expect(Object.values(sheetDoc().cells).some((cell) => cell.v?.startsWith("=COUNTIF([["))).toBe(true));
  });

  it("edits a participant's answer in place as an operator revision, and undoes it", async () => {
    const { fields } = seedDemoRoster(3);
    const age = fields.find((field) => field.label === "나이")!;
    await login({ userId: OWNER });
    openApp(`${PATH}?cols=${age.fieldId}`);
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });
    const c = headers(grid).indexOf("나이");
    const person = tableApplications(EVENT)[0];

    type(grid, 0, c, "33");
    await waitFor(() => expect(tableApplications(EVENT)[0].answers[age.fieldId]).toEqual({ number: 33 }));
    expect(tableApplications(EVENT)[0].revision).toBe(person.revision + 1);
    await waitFor(() => expect(cellAt(grid, 0, c)).toHaveTextContent("33 세"));

    fireEvent.keyDown(cellAt(grid, 1, c), { key: "z", ctrlKey: true });
    await waitFor(() => expect(tableApplications(EVENT)[0].answers[age.fieldId]).toEqual(person.answers[age.fieldId]));
  });

  it("refuses a choice that is not an option and offers the options while typing", async () => {
    const { fields } = seedDemoRoster(2);
    const size = fields.find((field) => field.label === "티셔츠 크기")!;
    await login({ userId: OWNER });
    openApp(`${PATH}?cols=${size.fieldId}`);
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });
    const c = headers(grid).indexOf("티셔츠 크기");

    fireEvent.mouseDown(cellAt(grid, 0, c));
    fireEvent.keyDown(cellAt(grid, 0, c), { key: "Enter" });
    expect(within(grid).getByRole("listbox", { name: "보기" })).toHaveTextContent("SMLXL");
    fireEvent.change(within(grid).getByRole("textbox"), { target: { value: "XXL" } });
    fireEvent.keyDown(within(grid).getByRole("textbox"), { key: "Enter" });
    expect(await screen.findByText(/보기 중에서 골라 주세요/)).toBeInTheDocument();
  });

  it("leaves 조건부 서식, 서식 지우기, 틀 고정 and 행 추가 to the toolbar, and the toolbar still does them (DEC-091 Follow-up)", async () => {
    seedDemoRoster(3);
    await login({ userId: OWNER });
    openApp();
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });

    // Column menu: no 조건부 서식 and no 고정.
    fireEvent.click(within(grid).getByRole("button", { name: "현재 상태 열 메뉴" }));
    let menu = screen.getByRole("menu", { name: "칸 메뉴" });
    expect(within(menu).queryByRole("menuitem", { name: "조건부 서식" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /고정/ })).not.toBeInTheDocument();
    fireEvent.keyDown(menu, { key: "Escape" });
    // Cell menu: no 서식 지우기, no 운영 줄 추가, no 고정; 신청 상세 보기 stays.
    fireEvent.contextMenu(cellAt(grid, 0, 0));
    menu = screen.getByRole("menu", { name: "칸 메뉴" });
    expect(within(menu).queryByRole("menuitem", { name: "서식 지우기" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /운영 줄 추가/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /고정/ })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "신청 상세 보기" })).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: "Escape" });
    // No row-count box under the sheet.
    expect(screen.queryByLabelText("더할 행 수")).not.toBeInTheDocument();

    // The toolbar: 굵게, then 서식 지우기.
    const key = `p:${tableApplications(EVENT)[0].participantId}|person`;
    fireEvent.mouseDown(cellAt(grid, 0, 0));
    fireEvent.click(screen.getByRole("button", { name: "굵게 (Ctrl+B)" }));
    await waitFor(() => expect(sheetDoc().cells[key]?.f?.b).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "서식 지우기" }));
    await waitFor(() => expect(sheetDoc().cells[key]?.f?.b).toBeFalsy());
    // 틀 고정 from the toolbar.
    fireEvent.click(screen.getByRole("button", { name: "틀 고정" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "틀 고정" })).getByRole("menuitem", { name: "열 2개" }));
    expect(within(grid).getAllByRole("columnheader")[1]).toHaveClass("roster__sticky");
    // 조건부 서식 from the toolbar.
    fireEvent.click(screen.getByRole("button", { name: "조건부 서식" }));
    expect(screen.getByRole("group", { name: "조건부 서식" })).toBeInTheDocument();
    // + 행 adds one operator row.
    fireEvent.click(screen.getByRole("button", { name: "+ 행" }));
    await waitFor(() => expect(sheetDoc().rows).toHaveLength(1));
  });

  it("keeps cells read-only for an operator who cannot change participants", async () => {
    seedDemoRoster(3);
    await login({ userId: localUsers[2].userId });
    openApp();
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });
    expect(screen.queryByRole("button", { name: "+ 열" })).not.toBeInTheDocument();
    fireEvent.mouseDown(cellAt(grid, 0, 0));
    fireEvent.keyDown(cellAt(grid, 0, 0), { key: "가" });
    expect(within(grid).queryByRole("textbox")).not.toBeInTheDocument();
    expect(await screen.findByText("운영 정보를 고칠 권한이 없어요.")).toBeInTheDocument();
  });

  it("formats a selected range and stores it for the other operators", async () => {
    seedDemoRoster(3);
    await login({ userId: OWNER });
    openApp();
    const grid = await screen.findByRole("grid", { name: "신청자 명단" });
    fireEvent.mouseDown(cellAt(grid, 0, 1));
    fireEvent.mouseDown(cellAt(grid, 1, 1), { shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "굵게 (Ctrl+B)" }));
    await waitFor(() => expect(Object.values(sheetDoc().cells).filter((cell) => cell.f?.b)).toHaveLength(2));
    expect(cellAt(grid, 1, 1)).toHaveStyle({ fontWeight: "700" });
  });
});
