import { useState } from "react";
import { Link } from "react-router";
import "./Button.css";
import "./PublicHome.css";
import { MarketingPreview } from "./MarketingPreview";
import { startGoogleSignIn } from "../api/googleSignIn";

export function PublicHome() {
  const [googleMock, setGoogleMock] = useState(false);

  // DEC-069: an account is made on the first Google sign-in.
  function createAccount() {
    if (import.meta.env.VITE_API_MOCK === "1") setGoogleMock(true);
    else startGoogleSignIn(null);
  }

  return (
    <main className="public-home">
      <div className="public-home__stack">
        <div className="public-home__copy">
          <h1 className="public-home__title">
            함께하는 순간에,
            <br />
            더 집중할 수 있도록.
          </h1>
          <p className="public-home__support">교회와 공동체를 위한 행사 운영, SCENE.</p>
          <div className="public-home__actions">
            <Link className="scene-button scene-button--primary scene-button--size-40" to="/login">
              <span className="scene-button__label">로그인</span>
            </Link>
            <p className="public-home__signup">
              계정이 없으신가요?{" "}
              <button type="button" className="public-home__create" onClick={createAccount}>
                계정 만들기
              </button>
            </p>
            <p className="public-home__notice" role="status">
              {googleMock ? "목업 화면에서는 Google 로그인을 쓸 수 없어요." : null}
            </p>
          </div>
        </div>
        <MarketingPreview />
      </div>
    </main>
  );
}
