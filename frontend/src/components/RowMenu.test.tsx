import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RowMenu } from "./RowMenu";

function setup() {
  const choose = vi.fn();
  render(
    <RowMenu
      label="Local staff 메뉴"
      items={[
        { label: "권한", onSelect: () => choose("권한") },
        { label: "Manager로 변경", onSelect: () => choose("role") },
        { label: "빼기", danger: true, onSelect: () => choose("remove") },
      ]}
    />,
  );
  return { choose, trigger: screen.getByRole("button", { name: "Local staff 메뉴" }) };
}

describe("row menu (SCENE DS Menu 37:47, #494)", () => {
  it("opens from the trigger, focuses the first item, and moves with the arrow keys", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Local staff 메뉴" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", menu.id);
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["권한", "Manager로 변경", "빼기"]);
    expect(items[0]).toHaveFocus();
    expect(screen.getByRole("separator")).toBeInTheDocument();

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(items[2]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(items[2]).toHaveFocus();
  });

  it("closes on Escape and gives focus back to the trigger", () => {
    const { trigger, choose } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(choose).not.toHaveBeenCalled();
  });

  it("runs the chosen item with focus back on the trigger, and closes on an outside press", () => {
    const { trigger, choose } = setup();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("menuitem", { name: "빼기" }));
    expect(choose).toHaveBeenCalledWith("remove");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
