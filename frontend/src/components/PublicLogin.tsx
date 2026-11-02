import { lazy, Suspense, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import visual from "../assets/p01-02-auth-visual.svg";
import symbol from "../assets/scene-symbol-login.svg";
import eye from "../assets/icon-eye.svg";
import eyeOff from "../assets/icon-eye-off.svg";
import { Button } from "./Button";
import { queryKeys } from "../api/queryKeys";
import "./PublicLogin.css";

// Email login works only against the local seed accounts until real authentication exists.
// Both pieces load lazily in DEV so the seed users never reach the production bundle (DEC-067).
const loadLocalLogin = import.meta.env.DEV ? () => import("../localLogin") : null;
const LocalAccountsHint = import.meta.env.DEV
  ? lazy(() => import("./LocalAccountsHint").then((module) => ({ default: module.LocalAccountsHint })))
  : null;

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/events";
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function PublicLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [remember, setRemember] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const emailValue = email.trim();
  const emailInvalid = emailValue !== "" && !isEmailAddress(emailValue);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (emailInvalid || pending) {
      return;
    }
    if (!loadLocalLogin) {
      setNotice("이메일 로그인은 아직 준비 중이에요.");
      return;
    }
    if (emailValue === "") {
      setNotice("이메일을 입력해 주세요.");
      return;
    }
    setNotice("");
    setPending(true);
    try {
      const { loginWithLocalEmail, UnknownLocalAccount } = await loadLocalLogin();
      try {
        const session = await loginWithLocalEmail(emailValue);
        // A new account must not see the previous account's cached screens.
        queryClient.clear();
        queryClient.setQueryData(queryKeys.me, session);
        // Replace the login entry so Back from the operator screen does not land here again.
        navigate(safeNext(params.get("next")), { replace: true });
      } catch (caught) {
        setNotice(
          caught instanceof UnknownLocalAccount
            ? "로컬 계정이 아니에요. 아래 계정 이메일로 들어가 주세요."
            : "로그인하지 못했어요. 다시 시도해 주세요.",
        );
      }
    } finally {
      setPending(false);
    }
  }

  function google() {
    setNotice(
      loadLocalLogin
        ? "Google 로그인은 아직 준비 중이에요. 이메일로 들어가 주세요."
        : "Google 로그인은 아직 준비 중이에요.",
    );
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
          <form className="public-login__form" onSubmit={(event) => void submit(event)}>
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
            <Button type="submit" variant="primary" size={40} className="public-login__submit" loading={pending}>
              로그인
            </Button>
            <Button type="button" variant="secondary" size={40} className="public-login__submit" onClick={google}>
              Google로 로그인
            </Button>
            <p className="public-login__switch">
              계정이 없으신가요? <Link to="/signup">계정 만들기</Link>
            </p>
          </form>
          {notice ? (
            <p className="public-login__notice" role="status">
              {notice}
            </p>
          ) : null}
          {LocalAccountsHint ? (
            <Suspense fallback={null}>
              <LocalAccountsHint />
            </Suspense>
          ) : null}
        </div>
      </div>
    </main>
  );
}
