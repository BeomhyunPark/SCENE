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
          <Link
            className="scene-button scene-button--primary scene-button--size-40 public-home__start"
            to="/signup"
          >
            <span className="scene-button__label">시작하기</span>
          </Link>
        </div>
        <MarketingPreview />
      </div>
    </main>
  );
}
