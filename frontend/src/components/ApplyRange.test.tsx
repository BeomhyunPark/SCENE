import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { RETREAT, RETREAT_SETUP, seedRetreat } from "../test/summarySeed";

const RANGE = { ...RETREAT_SETUP, attendance: { partial: true, worshipOnly: true, mode: "RANGE" as const } };

function open(formId: string) {
  return render(
    <MemoryRouter initialEntries={[`/apply/${RETREAT}/${formId}`]}>
      <App />
    </MemoryRouter>,
  );
}

describe("public form, arrival and departure (DEC-074)", () => {
  it("groups slots by day, blocks a reversed range before sending, and sums up what is included", async () => {
    const { formId } = seedRetreat(RANGE);
    open(formId);
    fireEvent.click(await screen.findByRole("radio", { name: "부분 참석" }, { timeout: 4000 }));
    const arrival = screen.getByRole("group", { name: /수련회장에 언제 도착하나요/ });
    expect(within(arrival).getByText("1월 22일 (금)")).toBeInTheDocument();
    expect(within(arrival).getAllByText("저녁부터")).toHaveLength(2);
    expect(within(arrival).getByText(/모두 참석하는 것으로 신청됩니다/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "1월 23일 (토) 저녁부터" }));
    // 출발 drops the slots before the arrival (#328), so the list is short and cannot be reversed.
    const departure = screen.getByRole("group", { name: /수련회장에서 언제 출발하나요/ });
    expect(within(departure).queryByRole("radio", { name: "1월 23일 (토) 아침까지" })).not.toBeInTheDocument();
    expect(within(departure).getByText("도착보다 앞선 칸은 빼고 보여 드려요.")).toBeInTheDocument();

    // Same slot is allowed: one slot.
    fireEvent.click(screen.getByRole("radio", { name: "1월 23일 (토) 저녁까지" }));
    expect(within(departure).queryByText(/출발은 도착보다 앞일 수 없어요/)).not.toBeInTheDocument();
    expect(within(departure).getByText("이 일정에 포함돼요")).toBeInTheDocument();
    expect(within(departure).getByText("저녁")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "1월 24일 (일) 점심까지" }));
    const covered = within(within(departure).getByRole("status"));
    expect(covered.getByText("저녁 · 집회")).toBeInTheDocument();
    expect(covered.getByText("아침 · 점심")).toBeInTheDocument();
  });

  it("shows the server's refusal of a reversed range on 출발", async () => {
    const { formId } = seedRetreat({
      ...RANGE,
      gender: false,
      transport: { groupBus: false, worshipShuttle: false, car: false, publicTransit: false, support: false, partialByTime: false },
    });
    open(formId);
    fireEvent.change(await screen.findByRole("textbox", { name: /이름/ }, { timeout: 4000 }), { target: { value: "김하나" } });
    fireEvent.change(screen.getByRole("textbox", { name: /전화/ }), { target: { value: "010-1234-5678" } });
    fireEvent.change(screen.getByRole("textbox", { name: /또래/ }), { target: { value: "94" } });
    fireEvent.click(screen.getByRole("radio", { name: "부분 참석" }));
    fireEvent.click(screen.getByRole("radio", { name: "1월 23일 (토) 아침부터" }));
    fireEvent.click(screen.getByRole("radio", { name: "1월 23일 (토) 점심까지" }));
    // Only the server knows (e.g. the operator reordered slots after the page loaded): a 400 lands on 출발.
    const { server } = await import("../mocks/server");
    const { http } = await import("msw");
    const { problem } = await import("../mocks/problem");
    server.use(http.post("/api/v1/public/events/:eventId/forms/:formId/applications", () => problem(400, "APPLICATION_VALIDATION_FAILED")));
    fireEvent.click(screen.getByRole("checkbox", { name: /동의/ }));
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    const departure = screen.getByRole("group", { name: /수련회장에서 언제 출발하나요/ });
    expect(await within(departure).findByText(/출발은 도착보다 앞일 수 없어요/)).toBeInTheDocument();
    expect(screen.getByText("입력 내용을 확인해 주세요.")).toBeInTheDocument();
    // Changing either end clears it.
    fireEvent.click(screen.getByRole("radio", { name: "1월 23일 (토) 저녁까지" }));
    expect(within(departure).queryByText(/출발은 도착보다 앞일 수 없어요/)).not.toBeInTheDocument();
  });
});
