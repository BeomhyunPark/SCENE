import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import pattern from "../assets/p01-04-hex-pattern.png";
import { PublicHeader } from "./PublicHeader";
import { Button } from "./Button";
import "./PublicVerifyEmail.css";

const sampleEmail = "example@email.com";

function shownEmail(state: unknown) {
  if (typeof state === "object" && state !== null && "email" in state) {
    const email = state.email;
    if (typeof email === "string" && email.trim() !== "") {
      return email.trim();
    }
  }
  return sampleEmail;
}

export function PublicVerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = shownEmail(location.state);
  const [code, setCode] = useState("");

  function continueToOrganization() {
    navigate("/find-organization");
  }

  function hold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    continueToOrganization();
  }

  return (
    <>
      <PublicHeader accountActions />
      <main className="public-verify">
        <div className="public-verify__pattern" aria-hidden="true">
          <img className="public-verify__hex public-verify__hex--1" src={pattern} alt="" />
          <img className="public-verify__hex public-verify__hex--2" src={pattern} alt="" />
          <img className="public-verify__hex public-verify__hex--3" src={pattern} alt="" />
          <img className="public-verify__hex public-verify__hex--4" src={pattern} alt="" />
        </div>
        <div className="public-verify__content">
          <h1 className="public-verify__title">이메일을 확인해 주세요</h1>
          <p className="public-verify__support">{email}으로 확인 코드를 보냈어요.</p>
          <form className="public-verify__form" onSubmit={hold}>
            <div className="public-verify__field">
              <label className="public-verify__label" htmlFor="verify-code">
                확인 코드
              </label>
              <span className="public-verify__control">
                <input
                  id="verify-code"
                  type="text"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6자리 확인 코드를 입력해 주세요"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </span>
            </div>
            <div className="public-verify__actions">
              <Button
                type="button"
                variant="secondary"
                size={40}
                className="public-verify__action"
                onClick={continueToOrganization}
              >
                나중에 하기
              </Button>
              <Button type="submit" variant="primary" size={40} className="public-verify__action">
                확인
              </Button>
            </div>
            <div className="public-verify__resend">
              <span>코드를 받지 못했나요?</span>
              <span className="public-verify__again">다시 보내기</span>
            </div>
          </form>
        </div>
      </main>
    </>
  );
}
