import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { login } from "../../api/session";
import { seedDemoRoster } from "../../mocks/fixtures/demoRoster";
import { localEvent, localUsers } from "../../mocks/fixtures/seed";
import { tableApplications } from "../../mocks/participantStore";
import { tableGroupOf } from "../../mocks/tableGroupStore";

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

describe("참가 현황 table at retreat size", () => {
  it("shows 200 applicants 50 at a time with the design's columns", async () => {
    seedDemoRoster(200);
    await login({ userId: OWNER });
    openApp();

    const table = await screen.findByRole("table", { name: "신청자 명단" });
    expect(summary()).toBe("200명");
    expect(within(table).getAllByRole("row")).toHaveLength(52);
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent?.replace(/[↕▲▼\d]/g, "").trim())).toEqual([
      "참가자",
      "소속",
      "연락처",
      "현재 상태",
      "조 배정",
      "참석 범위",
      "작업",
    ]);
    expect(screen.getByText("1–50 / 200")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("51–100 / 200")).toBeInTheDocument();
  });

  it("filters two questions together, including 응답 없음, and keeps choices in the address", async () => {
    const { fields } = seedDemoRoster(200);
    const { field, options } = genderField(fields);
    await login({ userId: OWNER });
    openApp();
    await screen.findByRole("table", { name: "신청자 명단" });

    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    fireEvent.change(screen.getByRole("combobox", { name: "조건 더하기" }), { target: { value: field.fieldId } });
    const gender = screen.getByRole("group", { name: /성별/ });
    fireEvent.click(within(gender).getByRole("checkbox", { name: new RegExp(`^${options[0].label}`) }));
    const male = countGender(options[0].optionId);
    expect(summary()).toBe(`${male}명`);

    const shirt = fields.find((item) => item.label === "티셔츠 크기")!;
    fireEvent.change(screen.getByRole("combobox", { name: "조건 더하기" }), { target: { value: shirt.fieldId } });
    const shirtBox = screen.getByRole("group", { name: /티셔츠 크기/ });
    fireEvent.click(within(shirtBox).getByRole("checkbox", { name: /^응답 없음/ }));
    const expected = tableApplications(EVENT).filter(
      (row) => row.answers[field.fieldId]?.optionId === options[0].optionId && !row.answers[shirt.fieldId],
    ).length;
    expect(summary()).toBe(`${expected}명`);
    expect(screen.getByRole("list", { name: "걸린 조건" })).toHaveTextContent("티셔츠 크기: 응답 없음");
  });

  it("restores a filter, sort and columns from the address after a reload", async () => {
    const { fields } = seedDemoRoster(200);
    const { field, options } = genderField(fields);
    const shirt = fields.find((item) => item.label === "티셔츠 크기")!;
    await login({ userId: OWNER });
    openApp(`${PATH}?f.${field.fieldId}=${options[1].optionId}&sort=person:desc&cols=status,${shirt.fieldId}`);

    const table = await screen.findByRole("table", { name: "신청자 명단" });
    expect(summary()).toBe(`${countGender(options[1].optionId)}명`);
    expect(within(table).getByRole("columnheader", { name: /참가자/ })).toHaveAttribute("aria-sort", "descending");
    expect(within(table).getByRole("columnheader", { name: /티셔츠 크기/ })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: /연락처/ })).not.toBeInTheDocument();
  });

  it("sorts by a header and narrows with the status chips", async () => {
    seedDemoRoster(200);
    await login({ userId: OWNER });
    openApp();
    const table = await screen.findByRole("table", { name: "신청자 명단" });

    const header = within(table).getByRole("columnheader", { name: /조 배정/ });
    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    // Numeric order: 1조, 2조, … 10조, then 미배정 last.
    expect(within(within(table).getAllByRole("row")[1]).getAllByRole("cell")[4].textContent).toMatch(/^1조/);

    const unassigned = tableApplications(EVENT).filter((row) => !tableGroupOf(EVENT, row.participantId)).length;
    const chip = screen.getByRole("button", { name: new RegExp(`미배정 ${unassigned}`) });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(summary()).toBe(`${unassigned}명`);
  });

  it("turns question columns on and off", async () => {
    seedDemoRoster(40);
    await login({ userId: OWNER });
    openApp();
    const table = await screen.findByRole("table", { name: "신청자 명단" });

    fireEvent.click(screen.getByRole("button", { name: "+ 열 보기" }));
    const panel = screen.getByRole("group", { name: "열 보기" });
    fireEvent.click(within(panel).getByRole("checkbox", { name: "티셔츠 크기" }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "연락처" }));
    expect(within(table).getByRole("columnheader", { name: /티셔츠 크기/ })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: /연락처/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole("checkbox", { name: "옛 질문 (숨김)" })).not.toBeChecked();
  });

  it("counts one question per option and crosses two, then opens the people behind a cell", async () => {
    const { fields } = seedDemoRoster(200);
    const { field, options } = genderField(fields);
    const serve = fields.find((item) => item.label === "섬기고 싶은 곳")!;
    await login({ userId: OWNER });
    openApp(`${PATH}?view=count`);

    fireEvent.change(await screen.findByRole("combobox", { name: "세는 항목" }), { target: { value: field.fieldId } });
    const pivot = screen.getByRole("table", { name: "성별 보기별 인원" });
    const male = countGender(options[0].optionId);
    expect(within(pivot).getByRole("button", { name: `${options[0].label} ${male}명 명단 보기` })).toHaveTextContent(String(male));

    fireEvent.change(screen.getByRole("combobox", { name: "세는 항목" }), { target: { value: serve.fieldId } });
    const multi = screen.getByRole("table", { name: "섬기고 싶은 곳 보기별 인원" });
    const perOption = serve.config.options!.map(
      (option) => tableApplications(EVENT).filter((row) => (row.answers[serve.fieldId]?.optionIds as string[] | undefined)?.includes(option.optionId)).length,
    );
    expect(within(multi).getByRole("button", { name: `찬양 ${perOption[0]}명 명단 보기` })).toBeInTheDocument();
    expect(perOption.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(200);
    expect(screen.getByText(/고른 보기마다 한 번씩 세요/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "세는 항목" }), { target: { value: field.fieldId } });
    const cohort = fields.find((item) => item.systemKey === "COHORT")!;
    fireEvent.change(screen.getByRole("combobox", { name: /나눠 보기/ }), { target: { value: cohort.fieldId } });
    const cross = screen.getByRole("table", { name: "성별 × 또래" });
    const cellCount = tableApplications(EVENT).filter(
      (row) => row.answers[field.fieldId]?.optionId === options[0].optionId && row.answers[cohort.fieldId]?.text === "94",
    ).length;
    fireEvent.click(within(cross).getByRole("button", { name: `${options[0].label} · 94 ${cellCount}명 명단 보기` }));

    expect(await screen.findByRole("table", { name: "신청자 명단" })).toBeInTheDocument();
    expect(summary()).toBe(`${cellCount}명`);
  });

  it("searches by name and phone digits without putting the words in the address", async () => {
    seedDemoRoster(60);
    await login({ userId: OWNER });
    openApp();
    await screen.findByRole("table", { name: "신청자 명단" });
    const target = tableApplications(EVENT)[5];
    const phone = Object.values(target.answers).find((value) => typeof value.text === "string" && value.text.startsWith("010"))!;
    fireEvent.change(screen.getByRole("searchbox", { name: "이름, 연락처, 소속 검색" }), {
      target: { value: String(phone.text).slice(-4) },
    });
    expect(Number(summary()?.replace("명", ""))).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("table", { name: "신청자 명단" })).toHaveTextContent(String(phone.text));
  });
});
