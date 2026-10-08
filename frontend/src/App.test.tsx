import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("public shell", () => {
  it("renders the wordmark, center text, and a login link on /", () => {
    renderAt("/");

    const wordmark = screen.getByText("SCENE");
    expect(wordmark.tagName).toBe("SPAN");
    expect(wordmark).toHaveClass("scene-wordmark");

    for (const label of ["서비스", "운영 방식", "도움말"]) {
      const text = screen.getByText(label);
      expect(text.tagName).not.toBe("A");
      expect(text.closest("a")).toBeNull();
    }

    const login = screen.getByRole("link", { name: "로그인" });
    expect(login).toHaveAttribute("href", "/login");

    const main = document.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.textContent).toBe("");
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelector("[data-theme]")).toBeNull();
  });

  it("renders the same header and an empty main on /login", () => {
    renderAt("/login");

    expect(screen.getByText("SCENE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(document.querySelector("main")?.textContent).toBe("");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders a short not-found line for an unmatched path", () => {
    renderAt("/missing");

    expect(screen.getByText("페이지를 찾을 수 없어요.")).toBeInTheDocument();
    expect(screen.queryByText("SCENE")).toBeInTheDocument();
  });

  it("does not call fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAt("/");
    renderAt("/login");
    renderAt("/missing");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
