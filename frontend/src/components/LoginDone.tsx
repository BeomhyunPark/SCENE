import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { takeLoginNext } from "../api/googleSignIn";
import { queryKeys } from "../api/queryKeys";
import { getMe, type OperatorSession } from "../api/session";
import { LaunchStage } from "./LaunchStage";
import "./PublicLogin.css";
import "./LoginDone.css";

const FIRST_STEPS = ["계정 만들기", "운영 화면 준비", "행사 화면 열기"];
const STEP_MS = 420;

function seenKey(userId: string) {
  return `scene.welcomed.${userId}`;
}

/** First visit on this browser for this account. The server has no "new account" flag yet. */
function firstVisit(userId: string): boolean {
  try {
    if (localStorage.getItem(seenKey(userId))) return false;
    localStorage.setItem(seenKey(userId), "1");
    return true;
  } catch {
    return false;
  }
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Where the server lands a finished Google sign-in. It greets the operator on the launch stage,
 * then hands over to the app, which finishes the start-up. Replaces itself so Back skips it.
 */
export function LoginDone() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [me, setMe] = useState<OperatorSession | null>(null);
  const [first, setFirst] = useState(false);
  const [done, setDone] = useState(0);
  const [leaving, setLeaving] = useState(false);
  // Refs survive StrictMode's second effect run, so the saved page and the welcome are read once.
  const nextRef = useRef<string | null>(null);
  const firstRef = useRef<boolean | null>(null);

  useEffect(() => {
    let live = true;
    const timers: number[] = [];
    nextRef.current ??= takeLoginNext();
    const next = nextRef.current;
    queryClient.clear();
    queryClient
      .fetchQuery({ queryKey: queryKeys.me, queryFn: getMe })
      .then((session) => {
        if (!live) return;
        firstRef.current ??= firstVisit(session.userId);
        const isFirst = firstRef.current;
        setMe(session);
        setFirst(isFirst);
        if (reducedMotion()) {
          navigate(next, { replace: true });
          return;
        }
        const steps = isFirst ? FIRST_STEPS.length : 2;
        for (let i = 1; i <= steps; i += 1) {
          timers.push(window.setTimeout(() => setDone(i), 1100 + i * STEP_MS));
        }
        const total = 1100 + steps * STEP_MS + 450;
        timers.push(window.setTimeout(() => setLeaving(true), total));
        timers.push(window.setTimeout(() => navigate(next, { replace: true, state: { boot: true } }), total + 420));
      })
      .catch(() => {
        if (live) navigate(next, { replace: true });
      });
    return () => {
      live = false;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [navigate, queryClient]);

  return (
    <LaunchStage leaving={leaving}>
      <div className="login-done" role="status">
        {me ? (
          <>
            <h1 className="launch-card__title">
              {first ? `환영해요, ${me.displayName}님` : `다시 오셨네요, ${me.displayName}님`}
            </h1>
            {first ? (
              <ol className="login-done__steps">
                {FIRST_STEPS.map((step, index) => (
                  <li key={step} className={index < done ? "is-done" : index === done ? "is-now" : undefined}>
                    <span className="login-done__mark" aria-hidden="true">
                      <svg viewBox="0 0 16 16" width="12" height="12">
                        <path d="M3.5 8.5l3 3 6-7" />
                      </svg>
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="login-done__bar" aria-hidden="true">
                <span style={{ width: `${(done / 2) * 100}%` }} />
              </div>
            )}
          </>
        ) : (
          <p className="launch-card__support">로그인하는 중이에요.</p>
        )}
      </div>
    </LaunchStage>
  );
}
