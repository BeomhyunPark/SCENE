import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollTopButton } from "./ScrollTopButton";

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

describe("ScrollTopButton", () => {
  afterEach(() => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    vi.restoreAllMocks();
  });

  it("appears after scrolling down and scrolls back to the top", () => {
    const spy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<ScrollTopButton />);
    expect(screen.queryByRole("button", { name: "맨 위로" })).toBeNull();

    scrollTo(800);
    fireEvent.click(screen.getByRole("button", { name: "맨 위로" }));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));

    scrollTo(0);
    expect(screen.queryByRole("button", { name: "맨 위로" })).toBeNull();
  });
});
