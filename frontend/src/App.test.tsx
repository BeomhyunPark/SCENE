import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

    const logins = screen.getAllByRole("link", { name: "로그인" });
    expect(logins).toHaveLength(2);
    for (const login of logins) {
      expect(login).toHaveAttribute("href", "/login");
    }

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
    const recover = screen.getByRole("link", { name: "비밀번호 찾기" });
    expect(recover).toHaveAttribute("href", "/forgot-password");

    expect(screen.getByRole("button", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "비밀번호 보기" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Google로 로그인" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "계정 만들기" })).toHaveAttribute("href", "/signup");

    expect(screen.queryByText("서비스")).toBeNull();
    expect(screen.queryByRole("link", { name: "로그인" })).toBeNull();
    expect(document.body.textContent).not.toContain("운영은 더 단순하게");
    expect(document.body.textContent).not.toContain("Search");
    expect(document.body.textContent).not.toContain("Notes");

    const showPassword = screen.getByRole("button", { name: "비밀번호 보기" });
    const hiddenEye = showPassword.querySelector("img")?.getAttribute("src");
    fireEvent.click(showPassword);
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "비밀번호 숨기기" }).querySelector("img")).not.toHaveAttribute(
      "src",
      hiddenEye,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "로그인 유지" }));
    expect(screen.getByRole("checkbox", { name: "로그인 유지" })).toBeChecked();
    fireEvent.change(screen.getByRole("textbox", { name: "이메일" }), {
      target: { value: "not-email" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("이메일 형식을 확인해 주세요.");
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(screen.getByRole("heading", { name: "다시 만나서 반가워요" })).toBeInTheDocument();
    fireEvent.click(recover);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "비밀번호를 잊으셨나요?" })).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("renders a short not-found line for an unmatched path", () => {
    renderAt("/missing");

    expect(screen.getByText("페이지를 찾을 수 없어요.")).toBeInTheDocument();
    expect(screen.queryByText("SCENE")).toBeInTheDocument();
  });

  it("renders the account form on /signup without calling the server", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAt("/signup");

    expect(screen.getByRole("heading", { name: "계정 만들기" })).toBeInTheDocument();
    expect(screen.getByText("SCENE과 함께 행사 운영을 시작해요")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "이름" })).toHaveAttribute(
      "placeholder",
      "이름을 입력해 주세요",
    );
    expect(screen.getByRole("textbox", { name: "이메일" })).toHaveAttribute(
      "placeholder",
      "이메일을 입력해 주세요",
    );
    const password = screen.getByLabelText("비밀번호");
    const confirm = screen.getByLabelText("비밀번호 확인");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("placeholder", "비밀번호");
    expect(confirm).toHaveAttribute("type", "password");
    expect(confirm).toHaveAttribute("placeholder", "다시 입력");

    const showPassword = screen.getByRole("button", { name: "비밀번호 보기" });
    const showConfirm = screen.getByRole("button", { name: "비밀번호 확인 보기" });
    expect(showPassword).toHaveAttribute("tabindex", "-1");
    expect(showConfirm).toHaveAttribute("tabindex", "-1");

    expect(screen.getByRole("checkbox", { name: "이용약관 동의 (필수)" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "개인정보 수집·이용 동의 (필수)" })).not.toBeChecked();
    const views = screen.getAllByRole("button", { name: "보기" });
    expect(views).toHaveLength(2);
    views[0].focus();
    fireEvent.click(views[0]);
    expect(screen.getByRole("dialog", { name: "약관 확인" })).toBeInTheDocument();
    const closeButtons = screen.getAllByRole("button", { name: "닫기" });
    closeButtons[1].focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButtons[0]).toHaveFocus();
    expect(screen.getByRole("link", { name: "로그인" })).not.toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(closeButtons[1]).toHaveFocus();
    expect(screen.getByRole("heading", { name: "이용약관" })).toBeInTheDocument();
    expect(
      screen.getByText("서비스 이용과 계정 관리, 이용 제한, 탈퇴 및 책임 범위를 확인했어요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "개인정보 수집·이용" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "닫기" }).find((button) => button.textContent === "닫기")!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(views[0]).toHaveFocus();
    expect(screen.getByRole("checkbox", { name: "이용약관 동의 (필수)" })).not.toBeChecked();
    fireEvent.click(views[1]);
    const dialog = screen.getByRole("dialog", { name: "약관 확인" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    const submit = screen.getByRole("button", { name: "계정 만들기" });
    expect(submit).toBeDisabled();
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(document.querySelector(".public-header")).toBeNull();
    expect(screen.queryByText("서비스")).toBeNull();
    expect(document.body.textContent).not.toContain("행사를 함께 운영할");
    expect(document.body.textContent).not.toContain("Search");
    expect(document.body.textContent).not.toContain("Dashboard");

    fireEvent.change(screen.getByRole("textbox", { name: "이름" }), { target: { value: "   " } });
    fireEvent.change(screen.getByRole("textbox", { name: "이메일" }), {
      target: { value: "ada@scene.test" },
    });
    fireEvent.change(password, { target: { value: "secret" } });
    fireEvent.change(confirm, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "이용약관 동의 (필수)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "개인정보 수집·이용 동의 (필수)" }));
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "이름" }), { target: { value: "아다" } });
    fireEvent.change(screen.getByRole("textbox", { name: "이메일" }), { target: { value: "   " } });
    expect(screen.queryByText("이메일 형식을 확인해 주세요.")).toBeNull();
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "이메일" }), {
      target: { value: "ada@scene.test" },
    });
    expect(submit).toBeEnabled();
    expect(screen.queryByText("비밀번호가 서로 달라요.")).toBeNull();
    fireEvent.change(confirm, { target: { value: "secret2" } });
    expect(screen.getByText("비밀번호가 서로 달라요.")).toBeInTheDocument();
    expect(confirm).toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeDisabled();
    fireEvent.change(confirm, { target: { value: "" } });
    expect(screen.queryByText("비밀번호가 서로 달라요.")).toBeNull();
    expect(submit).toBeDisabled();
    fireEvent.change(confirm, { target: { value: "secret" } });
    expect(screen.queryByText("비밀번호가 서로 달라요.")).toBeNull();
    expect(submit).toBeEnabled();
    const email = screen.getByRole("textbox", { name: "이메일" });
    fireEvent.change(email, { target: { value: "ada" } });
    expect(screen.getByText("이메일 형식을 확인해 주세요.")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeDisabled();
    fireEvent.change(email, { target: { value: "ada@scene.test" } });
    expect(screen.queryByText("이메일 형식을 확인해 주세요.")).toBeNull();
    expect(submit).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "이용약관 동의 (필수)" }));
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "이용약관 동의 (필수)" }));
    expect(submit).toBeEnabled();

    const hiddenEye = showPassword.querySelector("img")?.getAttribute("src");
    fireEvent.click(showPassword);
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("비밀번호 확인")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "비밀번호 숨기기" }).querySelector("img")).not.toHaveAttribute(
      "src",
      hiddenEye,
    );
    expect(showConfirm.querySelector("img")).toHaveAttribute("src", hiddenEye);
    fireEvent.click(showConfirm);
    expect(screen.getByLabelText("비밀번호 확인")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "비밀번호 확인 숨기기" }).querySelector("img")).not.toHaveAttribute(
      "src",
      hiddenEye,
    );

    fireEvent.click(submit);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "이메일을 확인해 주세요" })).toBeInTheDocument();
    expect(screen.getByText("ada@scene.test으로 확인 코드를 보냈어요.")).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("renders the email check on /verify-email without calling the server", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAt("/verify-email");

    expect(screen.getByRole("heading", { name: "이메일을 확인해 주세요" })).toBeInTheDocument();
    expect(screen.getByText("example@email.com으로 확인 코드를 보냈어요.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "확인 코드" })).toHaveAttribute(
      "placeholder",
      "6자리 확인 코드를 입력해 주세요",
    );
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "시작하기" })).toHaveAttribute("href", "/signup");
    for (const label of ["서비스", "운영 방식", "도움말"]) {
      const text = screen.getByText(label);
      expect(text.tagName).not.toBe("A");
      expect(text.closest("a")).toBeNull();
    }
    const again = screen.getByText("다시 보내기");
    expect(again.tagName).not.toBe("A");
    expect(again.closest("a")).toBeNull();
    expect(again.closest("button")).toBeNull();

    fireEvent.click(again);
    expect(screen.getByRole("heading", { name: "이메일을 확인해 주세요" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "소속 교회나 단체를 찾아주세요" })).toBeInTheDocument();
    cleanup();
    renderAt("/verify-email");
    fireEvent.click(screen.getByRole("button", { name: "나중에 하기" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "소속 교회나 단체를 찾아주세요" })).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("does not call fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAt("/");
    renderAt("/login");
    renderAt("/signup");
    renderAt("/verify-email");
    renderAt("/find-organization");
    renderAt("/register-organization");
    renderAt("/forgot-password");
    renderAt("/reset-password");
    renderAt("/missing");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("renders organization search without calling the server", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAt("/find-organization");

    expect(screen.getByRole("heading", { name: "소속 교회나 단체를 찾아주세요" })).toBeInTheDocument();
    expect(screen.getByText("가입할 교회·단체를 검색하고 요청을 보낼 수 있어요.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "교회·단체 검색" })).toHaveAttribute(
      "placeholder",
      "이름 또는 지역을 입력해 주세요",
    );
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    const start = screen.getByRole("link", { name: "시작하기" });
    expect(start).toHaveAttribute("href", "/signup");
    expect(start).toHaveClass("scene-button--primary");
    for (const label of ["서비스", "운영 방식", "도움말"]) {
      const text = screen.getByText(label);
      expect(text.tagName).not.toBe("A");
      expect(text.closest("a")).toBeNull();
    }

    expect(screen.getByRole("button", { name: /드림공동체/ })).toBeInTheDocument();
    const register = screen.getByRole("link", { name: "새로 등록하기" });
    expect(register).toHaveAttribute("href", "/register-organization");

    fireEvent.change(screen.getByRole("textbox", { name: "교회·단체 검색" }), {
      target: { value: "부산" },
    });
    expect(screen.queryByText("드림공동체")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "교회·단체 검색" }), {
      target: { value: "서울" },
    });
    expect(screen.getByText("드림공동체")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /가입 요청/ }));
    expect(screen.getByRole("dialog", { name: "이 교회·단체에 가입을 요청할까요?" })).toBeInTheDocument();
    expect(screen.getByText("드림공동체에 운영자 가입 요청을 보내요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /가입 요청/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "가입 요청" }));
    expect(screen.getByRole("dialog", { name: "가입 요청을 보냈어요" })).toBeInTheDocument();
    expect(screen.getByText("승인 대기")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "가입 승인을 기다리고 있어요" })).toBeInTheDocument();
    expect(screen.getByText(/드림공동체에 가입 요청을 보냈어요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "상태 다시 확인" }));
    expect(screen.getByRole("heading", { name: "아직 승인 대기 중이에요" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "대기 화면으로" }));
    expect(screen.getByRole("heading", { name: "가입 승인을 기다리고 있어요" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "요청 취소" }));
    expect(screen.getByRole("heading", { name: "가입 요청을 취소할까요?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "계속 대기" }));
    expect(screen.getByRole("heading", { name: "가입 승인을 기다리고 있어요" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "요청 취소" }));
    fireEvent.click(screen.getByRole("button", { name: "요청 취소" }));
    expect(screen.getByRole("heading", { name: "가입 요청을 취소했어요" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "가입 안내" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "소속 교회나 단체를 찾아주세요" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "새로 등록하기" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "새 교회·단체 등록" })).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("renders organization registration without calling the server", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAt("/register-organization");

    expect(screen.getByRole("heading", { name: "새 교회·단체 등록" })).toBeInTheDocument();
    expect(screen.getByText("조직을 만들면 이 계정이 첫 Owner가 돼요.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "교회·단체명" })).toHaveAttribute(
      "placeholder",
      "교회·단체명을 입력해 주세요",
    );
    expect(screen.getByRole("textbox", { name: "지역" })).toHaveAttribute(
      "placeholder",
      "지역을 입력해 주세요",
    );
    expect(screen.getByRole("textbox", { name: "대표 연락처" })).toHaveAttribute(
      "placeholder",
      "연락처를 입력해 주세요",
    );
    expect(screen.getByRole("textbox", { name: "대표자 또는 담당 목회자 성명" })).toHaveAttribute(
      "placeholder",
      "성명을 입력해 주세요",
    );
    expect(screen.getByText("이미 등록된 교회일 수 있어요")).toBeInTheDocument();
    expect(screen.getByText("사랑교회")).toBeInTheDocument();
    expect(screen.getByText("서울 서초구 · 김성민 목사")).toBeInTheDocument();
    const start = screen.getByRole("link", { name: "시작하기" });
    expect(start).toHaveAttribute("href", "/signup");
    expect(start).toHaveClass("scene-button--secondary");

    const submit = screen.getByRole("button", { name: "교회·단체 만들기" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "교회·단체명" }), {
      target: { value: "드림" },
    });
    expect(screen.queryByText("사랑교회")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "교회·단체명" }), {
      target: { value: "   " },
    });
    expect(screen.getByText("사랑교회")).toBeInTheDocument();
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "가입 요청" }));
    expect(screen.getByRole("dialog", { name: "이 교회·단체에 가입을 요청할까요?" })).toBeInTheDocument();
    expect(screen.getByText("사랑교회에 운영자 가입 요청을 보내요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "교회·단체명" }), {
      target: { value: "새빛교회" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "지역" }), { target: { value: "부산" } });
    fireEvent.change(screen.getByRole("textbox", { name: "대표 연락처" }), {
      target: { value: "010-0000-0000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "대표자 또는 담당 목회자 성명" }), {
      target: { value: "이하나" },
    });
    expect(screen.queryByText("사랑교회")).toBeNull();
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    const authority = screen.getByRole("dialog", { name: "조직을 만들 권한이 있나요?" });
    expect(authority).toBeInTheDocument();
    expect(screen.getByText("새빛교회")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "등록 화면으로" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(submit);
    fireEvent.click(screen.getByRole("button", { name: "권한이 있어요" }));
    expect(screen.getByRole("dialog", { name: "대표·운영 권한이 있다고 알려 주셨어요" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 선택" }));
    expect(screen.getByRole("dialog", { name: "조직을 만들 권한이 있나요?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "권한이 있어요" }));
    fireEvent.click(screen.getByRole("button", { name: "조직 만들기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "새 교회·단체 등록" })).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("renders password recovery without calling the server", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAt("/forgot-password");

    expect(screen.getByRole("heading", { name: "비밀번호를 잊으셨나요?" })).toBeInTheDocument();
    expect(screen.getByText("가입한 이메일로 재설정 코드를 보내드려요.")).toBeInTheDocument();
    const email = screen.getByRole("textbox", { name: "이메일" });
    expect(email).toHaveAttribute("placeholder", "가입한 이메일을 입력해 주세요");
    expect(screen.getByRole("link", { name: /^로그인$/ })).toHaveAttribute("href", "/login");
    const start = screen.getByRole("link", { name: "시작하기" });
    expect(start).toHaveAttribute("href", "/signup");
    expect(start).toHaveClass("scene-button--secondary");
    const back = screen.getByRole("link", { name: "로그인으로 돌아가기" });
    expect(back).toHaveAttribute("href", "/login");

    const submit = screen.getByRole("button", { name: "재설정 코드 보내기" });
    expect(submit).toBeDisabled();
    fireEvent.change(email, { target: { value: "   " } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit).toBeDisabled();
    fireEvent.change(email, { target: { value: "ada" } });
    expect(screen.getByRole("alert")).toHaveTextContent("이메일 형식을 확인해 주세요.");
    expect(submit).toBeDisabled();
    fireEvent.change(email, { target: { value: "ada@scene.test" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit).toBeEnabled();
    fireEvent.click(back);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "다시 만나서 반가워요" })).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("opens a new password from recovery and returns to login without calling the server", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAt("/forgot-password");
    fireEvent.change(screen.getByRole("textbox", { name: "이메일" }), {
      target: { value: " ada@scene.test " },
    });
    fireEvent.click(screen.getByRole("button", { name: "재설정 코드 보내기" }));
    expect(screen.getByRole("heading", { name: "새 비밀번호 설정" })).toBeInTheDocument();
    expect(
      screen.getByText("이메일로 받은 확인 코드와 새 비밀번호를 입력해 주세요."),
    ).toBeInTheDocument();

    const email = screen.getByRole("textbox", { name: "이메일" });
    expect(email).toHaveValue("ada@scene.test");
    expect(email).toHaveAttribute("placeholder", "이메일을 입력해 주세요");
    const code = screen.getByRole("textbox", { name: "확인 코드" });
    expect(code).toHaveAttribute("placeholder", "확인 코드를 입력해 주세요");
    const password = screen.getByLabelText("새 비밀번호", { exact: true, selector: "input" });
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("placeholder", "새 비밀번호를 입력해 주세요");
    const confirm = screen.getByLabelText("새 비밀번호 확인", { exact: true, selector: "input" });
    expect(confirm).toHaveAttribute("placeholder", "새 비밀번호를 다시 입력해 주세요");
    const start = screen.getByRole("link", { name: "시작하기" });
    expect(start).toHaveAttribute("href", "/signup");
    expect(start).toHaveClass("scene-button--secondary");

    const submit = screen.getByRole("button", { name: "비밀번호 변경" });
    expect(submit).toBeDisabled();
    fireEvent.change(code, { target: { value: "   " } });
    expect(submit).toBeDisabled();
    fireEvent.change(email, { target: { value: "ada" } });
    expect(screen.getByRole("alert")).toHaveTextContent("이메일 형식을 확인해 주세요.");
    fireEvent.change(email, { target: { value: "ada@scene.test" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.change(password, { target: { value: "scene-pass" } });
    fireEvent.change(confirm, { target: { value: "other-pass" } });
    expect(screen.getByRole("alert")).toHaveTextContent("비밀번호가 서로 달라요.");
    expect(submit).toBeDisabled();
    fireEvent.change(confirm, { target: { value: "" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit).toBeDisabled();
    fireEvent.change(confirm, { target: { value: "scene-pass" } });
    expect(submit).toBeEnabled();
    const showNewPassword = screen.getByRole("button", { name: "새 비밀번호 보기" });
    const hiddenEye = showNewPassword.querySelector("img")?.getAttribute("src");
    fireEvent.click(showNewPassword);
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "새 비밀번호 숨기기" }).querySelector("img")).not.toHaveAttribute(
      "src",
      hiddenEye,
    );
    fireEvent.click(submit);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "다시 만나서 반가워요" })).toBeInTheDocument();
    fetchSpy.mockRestore();
  });
});
