import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import visual from "../assets/p01-02-auth-visual.png";
import symbol from "../assets/scene-symbol-login.svg";
import eye from "../assets/icon-eye.svg";
import { Button } from "./Button";
import "./PublicLogin.css";

export function PublicLogin() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [remember, setRemember] = useState(false);

  function hold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
              <span className="public-login__control">
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="이메일을 입력해 주세요"
                />
              </span>
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
                  aria-pressed={passwordVisible}
                  aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  <img src={eye} alt="" width={20} height={20} />
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
              <span className="public-login__recover">비밀번호 찾기</span>
            </div>
            <Button type="submit" variant="primary" size={40} className="public-login__submit">
              로그인
            </Button>
            <Button type="button" variant="secondary" size={40} className="public-login__submit">
              Google로 로그인
            </Button>
            <p className="public-login__switch">
              계정이 없으신가요? <Link to="/signup">계정 만들기</Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
