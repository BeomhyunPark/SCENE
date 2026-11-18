import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { getMe } from "../api/session";
import { rememberLoginNext, startGoogleSignIn } from "../api/googleSignIn";
import { LaunchStage } from "./LaunchStage";
import "./PublicLogin.css";

const DevLoginPanel = import.meta.env.DEV
  ? lazy(() => import("./DevLoginPanel").then((module) => ({ default: module.DevLoginPanel })))
  : null;

/** How long "Google로 이동하는 중이에요" shows before the browser leaves. */
const LEAVE_MS = 700;

function googleErrorCopy(code: string | null): string | null {
  if (code === "google_unverified") return "Google에서 이메일이 확인된 계정만 로그인할 수 있어요.";
  if (code === "google") return "Google 로그인을 마치지 못했어요. 다시 시도해 주세요.";
  return null;
}

export function PublicLogin() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const launched = (location.state as { launched?: boolean } | null)?.launched === true;
  const [going, setGoing] = useState(false);
  const next = params.get("next");
  const googleError = googleErrorCopy(params.get("error"));

  // Coming from 시작하기, someone already signed in skips the card and starts up straight away.
  // A direct visit (an invitation or a sign-in link) stays a public page and does not call the server.
  useEffect(() => {
    if (!launched) return;
    let live = true;
    getMe().then(
      () => {
        if (!live) return;
        rememberLoginNext(next);
        navigate("/login/done", { replace: true });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [launched, navigate, next]);

  // DEC-069: an account is made on the first Google sign-in, so one button covers both.
  function continueWithGoogle() {
    setGoing(true);
    window.setTimeout(async () => {
      if (import.meta.env.VITE_API_MOCK === "1") {
        const { mockGoogleSignIn } = await import("../mocks/mockGoogleSignIn");
        await mockGoogleSignIn();
        rememberLoginNext(next);
        navigate("/login/done", { replace: true });
      } else {
        startGoogleSignIn(next);
      }
    }, LEAVE_MS);
  }

  return (
    <LaunchStage>
      {going ? (
        <div className="launch-card launch-card__swap public-login__going" role="status">
          <span className="public-login__orbit" aria-hidden="true" />
          <p className="public-login__going-text">Google로 이동하는 중이에요</p>
        </div>
      ) : (
        <div className="launch-card">
          <h1 className="launch-card__title">SCENE 시작하기</h1>
          <p className="launch-card__support">Google 계정으로 로그인해요. 처음이면 이때 계정이 만들어져요.</p>
          <button type="button" className="public-login__google" onClick={continueWithGoogle}>
            <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.4-.4-3.5z"
              />
            </svg>
            Google 계정으로 계속하기
          </button>
          <div className="public-login__status" role="status">
            {googleError ? <p className="public-login__notice">{googleError}</p> : null}
          </div>
          <Link className="public-login__back" to="/">
            처음 화면으로
          </Link>
        </div>
      )}
      {DevLoginPanel && !going ? (
        <div className="public-login__dev">
          <div className="public-login__status" role="status">
            {next ? <p className="public-login__dev-hint">개발 중에는 아래 개발용 로그인으로 들어가요.</p> : null}
          </div>
          <Suspense fallback={null}>
            <DevLoginPanel />
          </Suspense>
        </div>
      ) : null}
    </LaunchStage>
  );
}
