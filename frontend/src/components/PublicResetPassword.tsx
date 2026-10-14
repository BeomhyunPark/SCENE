import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import pattern from "../assets/p01-04-hex-pattern.png";
import eye from "../assets/icon-eye.svg";
import { PublicHeader } from "./PublicHeader";
import { Button } from "./Button";
import "./PublicResetPassword.css";

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function initialEmail(state: unknown) {
  if (typeof state === "object" && state !== null && "email" in state) {
    const email = state.email;
    if (typeof email === "string") {
      return email;
    }
  }
  return "";
}

export function PublicResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => initialEmail(location.state));
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const emailValue = email.trim();
  const emailInvalid = emailValue !== "" && !isEmailAddress(emailValue);
  const passwordMismatch = passwordConfirm !== "" && password !== passwordConfirm;
  const ready =
    isEmailAddress(emailValue) &&
    code.trim() !== "" &&
    password !== "" &&
    passwordConfirm !== "" &&
    password === passwordConfirm;

  function hold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) {
      return;
    }
    navigate("/login");
  }

  return (
    <>
      <PublicHeader accountActions />
      <main className="public-reset">
        <div className="public-reset__pattern" aria-hidden="true">
          <img className="public-reset__hex public-reset__hex--1" src={pattern} alt="" />
          <img className="public-reset__hex public-reset__hex--2" src={pattern} alt="" />
          <img className="public-reset__hex public-reset__hex--3" src={pattern} alt="" />
          <img className="public-reset__hex public-reset__hex--4" src={pattern} alt="" />
        </div>
        <div className="public-reset__content">
          <h1 className="public-reset__title">새 비밀번호 설정</h1>
          <p className="public-reset__support">
            이메일로 받은 확인 코드와 새 비밀번호를 입력해 주세요.
          </p>
          <form className="public-reset__form" onSubmit={hold}>
            <div className="public-reset__field">
              <label className="public-reset__label" htmlFor="reset-email">
                이메일
              </label>
              <span
                className={`public-reset__control${emailInvalid ? " public-reset__control--invalid" : ""}`}
              >
                <input
                  id="reset-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="이메일을 입력해 주세요"
                  aria-invalid={emailInvalid || undefined}
                  aria-describedby={emailInvalid ? "reset-email-invalid" : undefined}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </span>
              {emailInvalid ? (
                <p id="reset-email-invalid" className="public-reset__error" role="alert">
                  이메일 형식을 확인해 주세요.
                </p>
              ) : null}
            </div>
            <div className="public-reset__field">
              <label className="public-reset__label" htmlFor="reset-code">
                확인 코드
              </label>
              <span className="public-reset__control">
                <input
                  id="reset-code"
                  type="text"
                  name="code"
                  autoComplete="one-time-code"
                  placeholder="확인 코드를 입력해 주세요"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </span>
            </div>
            <div className="public-reset__field">
              <label className="public-reset__label" htmlFor="reset-password">
                새 비밀번호
              </label>
              <span className="public-reset__control">
                <input
                  id="reset-password"
                  type={passwordVisible ? "text" : "password"}
                  name="password"
                  autoComplete="new-password"
                  placeholder="새 비밀번호를 입력해 주세요"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  className="public-reset__eye"
                  type="button"
                  tabIndex={-1}
                  aria-pressed={passwordVisible}
                  aria-label={passwordVisible ? "새 비밀번호 숨기기" : "새 비밀번호 보기"}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  <img src={eye} alt="" width={20} height={20} />
                </button>
              </span>
            </div>
            <div className="public-reset__field">
              <label className="public-reset__label" htmlFor="reset-password-confirm">
                새 비밀번호 확인
              </label>
              <span
                className={`public-reset__control${
                  passwordMismatch ? " public-reset__control--invalid" : ""
                }`}
              >
                <input
                  id="reset-password-confirm"
                  type={confirmVisible ? "text" : "password"}
                  name="passwordConfirm"
                  autoComplete="new-password"
                  placeholder="새 비밀번호를 다시 입력해 주세요"
                  value={passwordConfirm}
                  aria-invalid={passwordMismatch || undefined}
                  aria-describedby={passwordMismatch ? "reset-password-mismatch" : undefined}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                />
                <button
                  className="public-reset__eye"
                  type="button"
                  tabIndex={-1}
                  aria-pressed={confirmVisible}
                  aria-label={confirmVisible ? "새 비밀번호 확인 숨기기" : "새 비밀번호 확인 보기"}
                  onClick={() => setConfirmVisible((visible) => !visible)}
                >
                  <img src={eye} alt="" width={20} height={20} />
                </button>
              </span>
              {passwordMismatch ? (
                <p id="reset-password-mismatch" className="public-reset__error" role="alert">
                  비밀번호가 서로 달라요.
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              variant="primary"
              size={40}
              className="public-reset__submit"
              disabled={!ready}
            >
              비밀번호 변경
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
