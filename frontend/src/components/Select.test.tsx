import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Select, type SelectOption } from "./Select";

const CATEGORIES: SelectOption[] = [
  { value: "WORSHIP", label: "집회" },
  { value: "MEAL", label: "식사" },
  { value: "PROGRAM", label: "프로그램" },
  { value: "GROUP", label: "조 모임" },
  { value: "FREE", label: "자유 시간", disabled: true },
  { value: "MOVE", label: "이동" },
  { value: "ETC", label: "기타" },
];

function Harness({ onChange, initial = "MEAL", disabled }: { onChange?: (value: string) => void; initial?: string; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <form>
      <label htmlFor="category">분류</label>
      <Select
        id="category"
        name="category"
        value={value}
        options={CATEGORIES}
        disabled={disabled}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
      <button type="button">다음</button>
    </form>
  );
}

function open(trigger: HTMLElement) {
  fireEvent.click(trigger);
  return screen.getByRole("listbox");
}

function activeLabel(trigger: HTMLElement) {
  const id = trigger.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id)?.textContent : null;
}

describe("Select", () => {
  it("is a labelled select-only combobox that shows the value and a hidden form value", () => {
    const { container } = render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "분류" });
    expect(trigger).toHaveTextContent("식사");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(container.querySelector('input[type="hidden"][name="category"]')).toHaveValue("MEAL");
  });

  it("opens on click, marks the selected option with a check and picks with a click", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "분류" });
    const list = open(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(list).toHaveAttribute("aria-label", "분류");
    expect(screen.getByRole("option", { name: "식사" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "식사" }).querySelector(".scene-select__check")).not.toBeNull();
    expect(screen.getByRole("option", { name: "자유 시간" })).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(screen.getByRole("option", { name: "조 모임" }));
    expect(onChange).toHaveBeenCalledWith("GROUP");
    expect(trigger).toHaveTextContent("조 모임");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("ignores clicks on a disabled option", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    open(screen.getByRole("combobox", { name: "분류" }));
    fireEvent.click(screen.getByRole("option", { name: "자유 시간" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeVisible();
  });

  it("moves with arrows, skips disabled options, jumps with Home/End and picks with Enter", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "분류" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(activeLabel(trigger)).toBe("식사");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(activeLabel(trigger)).toBe("조 모임");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(activeLabel(trigger)).toBe("이동");
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(activeLabel(trigger)).toBe("조 모임");
    fireEvent.keyDown(trigger, { key: "End" });
    expect(activeLabel(trigger)).toBe("기타");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(activeLabel(trigger)).toBe("기타");
    fireEvent.keyDown(trigger, { key: "Home" });
    expect(activeLabel(trigger)).toBe("집회");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("WORSHIP");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-activedescendant");
  });

  it("opens with Space and picks with Space", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "분류" });
    fireEvent.keyDown(trigger, { key: " " });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    fireEvent.keyDown(trigger, { key: " " });
    expect(onChange).toHaveBeenCalledWith("WORSHIP");
  });

  it("closes without changing on Escape, Tab, blur and an outside press", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "분류" });

    open(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    open(trigger);
    fireEvent.keyDown(trigger, { key: "Tab" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    open(trigger);
    fireEvent.pointerDown(screen.getByRole("button", { name: "다음" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    open(trigger);
    fireEvent.blur(trigger, { relatedTarget: screen.getByRole("button", { name: "다음" }) });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveTextContent("식사");
  });

  it("toggles closed with a second click on the trigger", () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "분류" });
    open(trigger);
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("jumps to an option by typing its first letters", () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "분류" });
    fireEvent.keyDown(trigger, { key: "기" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(activeLabel(trigger)).toBe("기타");
    fireEvent.keyDown(trigger, { key: "타" });
    expect(activeLabel(trigger)).toBe("기타");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(trigger).toHaveTextContent("기타");
  });

  it("does not open while disabled", () => {
    render(<Harness disabled />);
    const trigger = screen.getByRole("combobox", { name: "분류" });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the placeholder when the value is not an option", () => {
    render(
      <Select aria-label="보낼 조" value="" placeholder="보낼 조 고르기" options={[{ value: "a", label: "1조" }]} onChange={() => undefined} />,
    );
    const trigger = screen.getByRole("combobox", { name: "보낼 조" });
    expect(trigger).toHaveTextContent("보낼 조 고르기");
    expect(trigger).toHaveClass("scene-select__trigger--empty");
  });

  it("keeps the wrapping label from reopening the list after a pick", () => {
    const onChange = vi.fn();
    render(
      <label>
        역할
        <Select value="STAFF" options={[{ value: "STAFF", label: "스태프" }, { value: "MANAGER", label: "매니저" }]} onChange={onChange} />
      </label>,
    );
    const trigger = screen.getByRole("combobox", { name: "역할" });
    open(trigger);
    fireEvent.click(screen.getByRole("option", { name: "매니저" }));
    expect(onChange).toHaveBeenCalledWith("MANAGER");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens upward when there is no room below the trigger", () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "분류" });
    const rect = { top: 700, bottom: 740, left: 20, right: 380, width: 360, height: 40, x: 20, y: 700, toJSON: () => ({}) };
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    const list = open(trigger);
    expect(list).toHaveClass("scene-select__panel--up");
    expect(list.style.bottom).toBe("72px");
  });
});
