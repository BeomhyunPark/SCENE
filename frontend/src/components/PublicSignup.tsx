import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import visual from "../assets/p01-03-auth-visual.svg";
import symbol from "../assets/scene-symbol-login.svg";
import eye from "../assets/icon-eye.svg";
import { Button } from "./Button";
import { PublicTermsDialog } from "./PublicTermsDialog";
import "./PublicSignup.css";

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function PublicSignup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const navigate = useNavigate();

  const emailValue = email.trim();
  const emailInvalid = emailValue !== "" && !isEmailAddress(emailValue);
  const passwordMismatch = passwordConfirm !== "" && password !== passwordConfirm;
  const ready =
    name.trim() !== "" &&
    isEmailAddress(emailValue) &&
    password !== "" &&
    passwordConfirm !== "" &&
    password === passwordConfirm &&
    terms &&
    privacy;

  function hold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) {
      return;
    }
    navigate("/verify-email", { state: { email: email.trim() } });
  }

  return (
    <main className="public-signup">
      <img
        className="public-signup__visual"
        src={visual}
        alt=""
        width={720}
        height={960}
        aria-hidden="true"
      />
      <div className="public-signup__pane">
        <div className="public-signup__column">
          <div className="public-signup__brand">
            <img src={symbol} alt="" width={40.3023} height={40.3023} aria-hidden="true" />
            <span className="public-signup__wordmark">SCENE</span>
          </div>
          <h1 className="public-signup__title">계정 만들기</h1>
          <p className="public-signup__support">SCENE과 함께 행사 운영을 시작해요</p>
          <form className="public-signup__form" onSubmit={hold}>
            <div className="public-signup__field">
              <label className="public-signup__label" htmlFor="signup-name">
                이름
              </label>
              <span className="public-signup__control">
                <input
                  id="signup-name"
                  type="text"
                  name="name"
                  autoComplete="name"
                  placeholder="이름을 입력해 주세요"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </span>
            </div>
            <div className="public-signup__field">
              <label className="public-signup__label" htmlFor="signup-email">
                이메일
              </label>
              <span
                className={`public-signup__control${
                  emailInvalid ? " public-signup__control--invalid" : ""
                }`}
              >
                <input
                  id="signup-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="이메일을 입력해 주세요"
                  value={email}
                  aria-invalid={emailInvalid}
                  aria-describedby={emailInvalid ? "signup-email-invalid" : undefined}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </span>
              {emailInvalid ? (
                <p id="signup-email-invalid" className="public-signup__error" role="alert">
                  이메일 형식을 확인해 주세요.
                </p>
              ) : null}
            </div>
            <div className="public-signup__passwords">
              <div className="public-signup__field">
                <label className="public-signup__label" htmlFor="signup-password">
                  비밀번호
                </label>
                <span className="public-signup__control">
                  <input
                    id="signup-password"
                    type={passwordVisible ? "text" : "password"}
                    name="password"
                    autoComplete="new-password"
                    placeholder="비밀번호"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    className="public-signup__eye"
                    type="button"
                    tabIndex={-1}
                    aria-pressed={passwordVisible}
                    aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
                    onClick={() => setPasswordVisible((visible) => !visible)}
                  >
                    <img src={eye} alt="" width={20} height={20} />
                  </button>
                </span>
              </div>
              <div className="public-signup__field">
                <label className="public-signup__label" htmlFor="signup-password-confirm">
                  비밀번호 확인
                </label>
                <span
                  className={`public-signup__control${
                    passwordMismatch ? " public-signup__control--invalid" : ""
                  }`}
                >
                  <input
                    id="signup-password-confirm"
                    type={confirmVisible ? "text" : "password"}
                    name="passwordConfirm"
                    autoComplete="new-password"
                    placeholder="다시 입력"
                    value={passwordConfirm}
                    aria-invalid={passwordMismatch}
                    aria-describedby={passwordMismatch ? "signup-password-mismatch" : undefined}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                  />
                  <button
                    className="public-signup__eye"
                    type="button"
                    tabIndex={-1}
                    aria-pressed={confirmVisible}
                    aria-label={confirmVisible ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"}
                    onClick={() => setConfirmVisible((visible) => !visible)}
                  >
                    <img src={eye} alt="" width={20} height={20} />
                  </button>
                </span>
              </div>
              {passwordMismatch ? (
                <p
                  id="signup-password-mismatch"
                  className="public-signup__error public-signup__mismatch"
                  role="alert"
                >
                  비밀번호가 서로 달라요.
                </p>
              ) : null}
            </div>
            <div className="public-signup__agreement">
              <label className="public-signup__agree">
                <input
                  type="checkbox"
                  name="terms"
                  checked={terms}
                  onChange={(event) => setTerms(event.target.checked)}
                />
                이용약관 동의 (필수)
              </label>
              <button className="public-signup__view" type="button" onClick={() => setTermsOpen(true)}>
                보기
              </button>
            </div>
            <div className="public-signup__agreement">
              <label className="public-signup__agree">
                <input
                  type="checkbox"
                  name="privacy"
                  checked={privacy}
                  onChange={(event) => setPrivacy(event.target.checked)}
                />
                개인정보 수집·이용 동의 (필수)
              </label>
              <button className="public-signup__view" type="button" onClick={() => setTermsOpen(true)}>
                보기
              </button>
            </div>
            {termsOpen ? <PublicTermsDialog onClose={() => setTermsOpen(false)} /> : null}
            <Button
              type="submit"
              variant="primary"
              size={40}
              className="public-signup__submit"
              disabled={!ready}
            >
              계정 만들기
            </Button>
            <p className="public-signup__switch">
              이미 계정이 있나요? <Link to="/login">로그인</Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
