import { fireEvent, render, screen } from "@testing-library/react";
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

    expect(
      screen.getByRole("heading", {
        name: /함께하는 순간에,\s*더 집중할 수 있도록\./,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("교회와 공동체를 위한 행사 운영, SCENE.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "시작하기" })).toHaveAttribute("href", "/signup");

    const images = [...document.querySelectorAll("img")];
    expect(images).toHaveLength(2);
    const logo = document.querySelector(".public-header__brand img");
    expect(logo).toHaveAttribute("aria-hidden", "true");
    expect(logo).toHaveAttribute("alt", "");
    expect(logo).toHaveAttribute("width", "35.712");
    const preview = images.find((image) => image !== logo);
    expect(preview).toHaveAttribute("aria-hidden", "true");
    expect(preview).toHaveAttribute("alt", "");
    expect(document.body.textContent).not.toContain("2026 가을 공동체 행사");
    expect(document.body.textContent).not.toContain("2026년 10월 24일");
    expect(document.body.textContent).not.toContain("드림공동체");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelector("[data-theme]")).toBeNull();
  });

  it("renders the public login form on /login without calling the server", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAt("/login");

    expect(screen.getByRole("heading", { name: "다시 만나서 반가워요" })).toBeInTheDocument();
    expect(screen.getByText("로그인하고 운영을 이어가요")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "이메일" })).toHaveAttribute(
      "placeholder",
      "이메일을 입력해 주세요",
    );
    const password = screen.getByLabelText("비밀번호");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("placeholder", "비밀번호를 입력해 주세요");

    expect(screen.getByRole("checkbox", { name: "로그인 유지" })).not.toBeChecked();
    const recover = screen.getByText("비밀번호 찾기");
    expect(recover.tagName).not.toBe("A");
    expect(recover.closest("a")).toBeNull();
    expect(recover.closest("button")).toBeNull();

    expect(screen.getByRole("button", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google로 로그인" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "계정 만들기" })).toHaveAttribute("href", "/signup");

    expect(screen.queryByText("서비스")).toBeNull();
    expect(screen.queryByRole("link", { name: "로그인" })).toBeNull();
    expect(document.body.textContent).not.toContain("운영은 더 단순하게");
    expect(document.body.textContent).not.toContain("Search");
    expect(document.body.textContent).not.toContain("Notes");

    fireEvent.click(screen.getByRole("button", { name: "비밀번호 보기" }));
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("checkbox", { name: "로그인 유지" }));
    expect(screen.getByRole("checkbox", { name: "로그인 유지" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    fireEvent.click(screen.getByRole("button", { name: "Google로 로그인" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "다시 만나서 반가워요" })).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("renders a short not-found line for an unmatched path", () => {
    renderAt("/missing");

    expect(screen.getByText("페이지를 찾을 수 없어요.")).toBeInTheDocument();
    expect(screen.queryByText("SCENE")).toBeInTheDocument();
  });

  it("renders the same header and an empty main on /signup", () => {
    renderAt("/signup");

    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(document.querySelector("main")?.textContent).toBe("");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector("main img")).toBeNull();
  });

  it("does not call fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAt("/");
    renderAt("/login");
    renderAt("/signup");
    renderAt("/missing");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
