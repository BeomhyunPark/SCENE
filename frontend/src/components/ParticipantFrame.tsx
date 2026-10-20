import type { ReactNode } from "react";
import { Link } from "react-router";
import symbol from "../assets/scene-symbol-header.svg";
import "./ParticipantGate.css";

export function ParticipantFrame({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="participant-gate">
      <header className="participant-gate__header">
        <Link className="participant-gate__brand" to="/">
          <img src={symbol} alt="" width={36} height={36} aria-hidden="true" />
          <span className="scene-wordmark">SCENE</span>
        </Link>
      </header>
      <main className="participant-gate__main">
        <section className="participant-gate__panel">
          <h1 className="participant-gate__title">{title}</h1>
          {children}
        </section>
      </main>
    </div>
  );
}
