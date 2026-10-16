import { Link } from "react-router";
import "./Button.css";
import "./PublicHome.css";
import { MarketingPreview } from "./MarketingPreview";

export function PublicHome() {
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
            <Link className="scene-button scene-button--secondary scene-button--size-40" to="/login">
              <span className="scene-button__label">로그인</span>
            </Link>
            <Link className="scene-button scene-button--primary scene-button--size-40" to="/signup">
              <span className="scene-button__label">시작하기</span>
            </Link>
          </div>
        </div>
        <MarketingPreview />
      </div>
    </main>
  );
}
