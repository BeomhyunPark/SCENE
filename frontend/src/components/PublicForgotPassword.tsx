import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import pattern from "../assets/p01-04-hex-pattern.png";
import { PublicHeader } from "./PublicHeader";
import { Button } from "./Button";
import "./PublicForgotPassword.css";

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function PublicForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const emailValue = email.trim();
  const emailInvalid = emailValue !== "" && !isEmailAddress(emailValue);
  const ready = isEmailAddress(emailValue);

  function hold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) {
      return;
    }
    navigate("/reset-password", { state: { email: emailValue } });
  }

  return (
    <>
      <PublicHeader accountActions />
      <main className="public-forgot">
        <div className="public-forgot__pattern" aria-hidden="true">
          <img className="public-forgot__hex public-forgot__hex--1" src={pattern} alt="" />
          <img className="public-forgot__hex public-forgot__hex--2" src={pattern} alt="" />
          <img className="public-forgot__hex public-forgot__hex--3" src={pattern} alt="" />
          <img className="public-forgot__hex public-forgot__hex--4" src={pattern} alt="" />
        </div>
        <div className="public-forgot__content">
          <h1 className="public-forgot__title">비밀번호를 잊으셨나요?</h1>
          <p className="public-forgot__support">가입한 이메일로 재설정 코드를 보내드려요.</p>
          <form className="public-forgot__form" onSubmit={hold}>
            <div className="public-forgot__field">
              <label className="public-forgot__label" htmlFor="forgot-email">
                이메일
              </label>
              <span
                className={`public-forgot__control${emailInvalid ? " public-forgot__control--invalid" : ""}`}
              >
                <input
                  id="forgot-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="가입한 이메일을 입력해 주세요"
                  aria-invalid={emailInvalid || undefined}
                  aria-describedby={emailInvalid ? "forgot-email-invalid" : undefined}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </span>
              {emailInvalid ? (
                <p id="forgot-email-invalid" className="public-forgot__error" role="alert">
                  이메일 형식을 확인해 주세요.
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              variant="primary"
              size={40}
              className="public-forgot__submit"
              disabled={!ready}
            >
              재설정 코드 보내기
            </Button>
            <Link className="public-forgot__back" to="/login">
              로그인으로 돌아가기
            </Link>
          </form>
        </div>
      </main>
    </>
  );
}
