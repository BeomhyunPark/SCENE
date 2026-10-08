import { Link } from "react-router";
import "./PublicHeader.css";

export function PublicHeader() {
  return (
    <header className="grid h-16 grid-cols-[1fr_auto_1fr] items-center bg-[var(--color-bg-surface)] px-6 text-[var(--color-text-primary)]">
      <span className="scene-wordmark justify-self-start">SCENE</span>
      <div className="flex items-center gap-6">
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
