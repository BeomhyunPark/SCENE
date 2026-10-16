import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FieldPrivacyChecker } from "../ai/fieldPrivacy";
import { Button } from "./Button";
import { FieldPrivacyWarning } from "./FieldPrivacyWarning";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("field privacy warning", () => {
  it("shows the warning after the debounce and keeps 추가 enabled", async () => {
    vi.useFakeTimers();
    render(
      <>
        <FieldPrivacyWarning label="주민번호" />
        <Button type="button">추가</Button>
      </>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByRole("status")).toHaveTextContent("고유식별정보예요");
    expect(screen.getByRole("status")).toHaveTextContent("주의");
    expect(screen.getByRole("button", { name: "추가" })).toBeEnabled();
  });

  it("shows nothing when the checker fails", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const checker: FieldPrivacyChecker = {
      checkFieldPrivacy: () => Promise.reject(new Error("down")),
    };
    render(<FieldPrivacyWarning label="주민번호" checker={checker} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });
});
