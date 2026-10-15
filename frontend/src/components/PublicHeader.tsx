import { Link } from "react-router";
import symbol from "../assets/scene-symbol-header.svg";
import "./Button.css";
import "./PublicHeader.css";

type PublicHeaderProps = {
  accountActions?: boolean;
  primaryStart?: boolean;
};

export function PublicHeader({ accountActions = false, primaryStart = false }: PublicHeaderProps) {
  return (
    <header
      className={`grid h-16 grid-cols-[1fr_auto_1fr] items-center bg-[var(--color-bg-surface)] px-6 text-[var(--color-text-primary)]${
        accountActions ? " public-header--account" : ""
      }`}
    >
      <span className="public-header__brand">
        <img src={symbol} alt="" width={35.712} height={35.712} aria-hidden="true" />
        <span className="scene-wordmark">SCENE</span>
      </span>
      <div className="public-header__nav">
        <span className="public-header__text">서비스</span>
        <span className="public-header__text">운영 방식</span>
        <span className="public-header__text">도움말</span>
      </div>
      {accountActions ? (
        <div className="public-header__actions">
          <Link className="public-header__login" to="/login">
            로그인
          </Link>
          <Link
            className={`scene-button scene-button--size-40 public-header__start ${
              primaryStart ? "scene-button--primary" : "scene-button--secondary"
            }`}
            to="/signup"
          >
            <span className="scene-button__label">시작하기</span>
          </Link>
        </div>
      ) : (
        <Link className="public-header__text col-start-3 justify-self-end no-underline" to="/login">
          로그인
        </Link>
      )}
    </header>
  );
}
