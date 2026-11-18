import type { ReactNode } from "react";
import "./LaunchStage.css";

/**
 * The dark stage SCENE "starts up" on: home 시작하기 → login → back from Google → into the app.
 * The symbol draws itself, then the content rises under it.
 */
export function LaunchStage({ children, leaving = false }: { children: ReactNode; leaving?: boolean }) {
  return (
    <main className={`launch-stage${leaving ? " launch-stage--leaving" : ""}`}>
      <div className="launch-stage__glow" aria-hidden="true" />
      <div className="launch-stage__center">
        <svg className="launch-stage__symbol" viewBox="0 0 35.712 35.712" width="56" height="56" aria-hidden="true">
          <path d="M7.2 24.2784V13.2672C7.2 11.184 8.3904 9.9936 10.4736 9.3984L26.8416 3.744" />
          <path d="M28.3296 12.0768V22.4928C28.3296 24.576 27.1392 25.7664 25.3536 26.3616L9.5808 31.7184" />
        </svg>
        <div className="launch-stage__content">{children}</div>
      </div>
    </main>
  );
}
