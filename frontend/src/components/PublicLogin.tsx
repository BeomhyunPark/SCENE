import { lazy, Suspense, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import visual from "../assets/p01-02-auth-visual.svg";
import symbol from "../assets/scene-symbol-login.svg";
import eye from "../assets/icon-eye.svg";
import eyeOff from "../assets/icon-eye-off.svg";
import { Button } from "./Button";
import "./PublicLogin.css";
import { startGoogleSignIn } from "../api/googleSignIn";

const DevLoginPanel = import.meta.env.DEV
  ? lazy(() => import("./DevLoginPanel").then((module) => ({ default: module.DevLoginPanel })))
  : null;

function googleErrorCopy(code: string | null): string | null {
  if (code === "google_unverified") return "Google에서 이메일이 확인된 계정만 로그인할 수 있어요.";
  if (code === "google") return "Google 로그인을 마치지 못했어요. 다시 시도해 주세요.";
  return null;
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function PublicLogin() {
  const [params] = useSearchParams();
  const [notReady, setNotReady] = useState(false);
  const [googleMock, setGoogleMock] = useState(false);
  const [email, setEmail] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [remember, setRemember] = useState(false);
  const emailValue = email.trim();
  const emailInvalid = emailValue !== "" && !isEmailAddress(emailValue);

  const googleError = googleErrorCopy(params.get("error"));

  // DEC-069: an account is made on the first Google sign-in, so 계정 만들기 starts the same sign-in.
  function signInWithGoogle() {
    if (import.meta.env.VITE_API_MOCK === "1") setGoogleMock(true);
    else startGoogleSignIn(params.get("next"));
  }

  // Email login has no server yet. Going to /events from here only looked like a
  // login while a dev session was alive; without one the operator guard sends the
  // browser straight back to /login.
  function hold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotReady(!emailInvalid);
  }

  return (
    <main className="public-login">
      <img
        className="public-login__visual"
        src={visual}
        alt=""
        width={720}
        height={960}
        aria-hidden="true"
      />
      <div className="public-login__pane">
        <div className="public-login__column">
          <div className="public-login__brand">
            <img src={symbol} alt="" width={40.3023} height={40.3023} aria-hidden="true" />
            <span className="public-login__wordmark">SCENE</span>
          </div>
          <h1 className="public-login__title">다시 만나서 반가워요</h1>
          <p className="public-login__support">로그인하고 운영을 이어가요</p>
          <form className="public-login__form" onSubmit={hold}>
            <div className="public-login__field">
              <label className="public-login__label" htmlFor="login-email">
                이메일
              </label>
              <span
                className={`public-login__control${emailInvalid ? " public-login__control--invalid" : ""}`}
              >
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="이메일을 입력해 주세요"
                  aria-invalid={emailInvalid || undefined}
                  aria-describedby={emailInvalid ? "login-email-invalid" : undefined}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </span>
              {emailInvalid ? (
                <p id="login-email-invalid" className="public-login__error" role="alert">
                  이메일 형식을 확인해 주세요.
                </p>
              ) : null}
            </div>
            <div className="public-login__field">
              <label className="public-login__label" htmlFor="login-password">
                비밀번호
              </label>
              <span className="public-login__control">
                <input
                  id="login-password"
                  type={passwordVisible ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  placeholder="비밀번호를 입력해 주세요"
                />
                <button
                  className="public-login__eye"
                  type="button"
                  tabIndex={-1}
                  aria-pressed={passwordVisible}
                  aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  <img src={passwordVisible ? eyeOff : eye} alt="" width={20} height={20} />
                </button>
              </span>
            </div>
            <div className="public-login__options">
              <label className="public-login__remember">
                <input
                  type="checkbox"
                  name="remember"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                로그인 유지
              </label>
              <Link className="public-login__recover" to="/forgot-password">
                비밀번호 찾기
              </Link>
            </div>
            <Button type="submit" variant="primary" size={40} className="public-login__submit">
              로그인
            </Button>
            <Button type="button" variant="secondary" size={40} className="public-login__submit" onClick={signInWithGoogle}>
              Google로 로그인
            </Button>
            <p className="public-login__switch">
              계정이 없으신가요?{" "}
              <button type="button" className="public-login__create" onClick={signInWithGoogle}>
                계정 만들기
              </button>
            </p>
          </form>
          <div className="public-login__status" role="status">
            {notReady ? (
              <p className="public-login__notice">이메일 로그인은 아직 준비 중이에요. Google로 로그인해 주세요.</p>
            ) : null}
            {googleMock ? <p className="public-login__notice">목업 화면에서는 Google 로그인을 쓸 수 없어요.</p> : null}
            {googleError && !notReady && !googleMock ? <p className="public-login__notice">{googleError}</p> : null}
          </div>
          {DevLoginPanel ? (
            <>
              <div className="public-login__status" role="status">
                {notReady || googleMock || params.get("next") ? (
                  <p className="public-login__dev-hint">개발 중에는 아래 개발용 로그인으로 들어가요.</p>
                ) : null}
              </div>
              <Suspense fallback={null}>
                <DevLoginPanel />
              </Suspense>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
