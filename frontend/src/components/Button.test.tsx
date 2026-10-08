import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

const buttonCss = readFileSync(join(process.cwd(), "src/components/Button.css"), "utf8");

describe("Button", () => {
  it("uses the primary and disabled tokens from the handoff", () => {
    render(<Button>저장</Button>);
    const button = screen.getByRole("button", { name: "저장" });
    expect(button).toHaveClass("scene-button--primary");
    expect(button).toHaveClass("scene-button--size-40");
    expect(button).not.toHaveAttribute("aria-busy");

    expect(buttonCss).toMatch(
      /\.scene-button--primary\s*\{[^}]*background:\s*var\(--color-action-primary-bg\);[^}]*color:\s*var\(--color-text-on-accent\);/,
    );
    expect(buttonCss).toMatch(
      /\.scene-button--primary:disabled\s*\{[^}]*background:\s*var\(--color-action-primary-bg-disabled\);[^}]*color:\s*var\(--color-action-primary-on-disabled\);/,
    );
    expect(buttonCss).toContain("outline: 2px solid var(--color-focus-ring)");
    expect(buttonCss).toContain("outline-offset: 2px");
    expect(buttonCss).toContain("border-radius: 8px");
  });

  it("keeps the label and sets aria-busy while loading", () => {
    render(<Button loading>저장</Button>);
    const button = screen.getByRole("button", { name: "저장" });
    expect(button).toHaveAttribute("aria-busy", "true");
    const label = button.querySelector(".scene-button__label");
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe("저장");
    expect(buttonCss).toMatch(/\.scene-button__label\s*\{[^}]*white-space:\s*nowrap;/);
    expect(button.querySelector(".scene-button__spinner")).not.toBeNull();
  });

  it("uses disabled tokens when disabled", () => {
    render(<Button disabled>저장</Button>);
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });
});
