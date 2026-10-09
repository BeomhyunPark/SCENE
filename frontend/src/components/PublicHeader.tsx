import { Link } from "react-router";
import symbol from "../assets/scene-symbol-header.svg";
import "./PublicHeader.css";

export function PublicHeader() {
  return (
    <header className="grid h-16 grid-cols-[1fr_auto_1fr] items-center bg-[var(--color-bg-surface)] px-6 text-[var(--color-text-primary)]">
      <span className="public-header__brand">
        <img src={symbol} alt="" width={35.712} height={35.712} aria-hidden="true" />
        <span className="scene-wordmark">SCENE</span>
      </span>
      <div className="public-header__nav">
        <span className="public-header__text">서비스</span>
        <span className="public-header__text">운영 방식</span>
        <span className="public-header__text">도움말</span>
      </div>
      <Link className="public-header__text justify-self-end no-underline" to="/login">
        로그인
      </Link>
    </header>
  );
}
