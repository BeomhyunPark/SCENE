import { useEffect, useRef, useState } from "react";
import "./OperationScene.css";

// A looping, decorative scene for the public home: an event "running" in SCENE.
// Everything here is sample data drawn in code, so it stays sharp and matches the
// app's words. Motion stops at the finished frame when the viewer asks for less motion.

const TASKS = [
  { title: "장소 계약", due: "D-40", doneAt: 1 },
  { title: "신청서 열기", due: "D-30", doneAt: 2 },
  { title: "차량 배정", due: "D-14", doneAt: 6 },
  { title: "조 편성", due: "D-7", doneAt: 10 },
];

const APPLICANTS = ["김은혜", "박요한", "이사랑", "정다니엘", "최하늘", "한소망", "윤믿음", "오주원"];
// Applicant count reached at each step of the loop.
const COUNT_AT = [0, 4, 9, 15, 22, 29, 35, 40, 44, 47, 48, 48, 48, 48];

const GROUPS = [
  { name: "1조", members: ["김은혜", "정다니엘", "윤믿음"] },
  { name: "2조", members: ["박요한", "최하늘", "오주원"] },
  { name: "3조", members: ["이사랑", "한소망"] },
];
const GROUP_START = 4;

const CHECK_IN_AT = 11;
const LAST_STEP = COUNT_AT.length - 1;
const CAPACITY = 60;
const STEP_MS = 900;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function useCountUp(target: number, still: boolean) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (still) return;
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const run = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(begin + (target - begin) * eased);
      from.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [target, still]);
  return still ? target : value;
}

export function OperationScene() {
  const [still] = useState(prefersReducedMotion);
  const [step, setStep] = useState(still ? LAST_STEP - 1 : 0);

  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setStep((s) => (s >= LAST_STEP ? 0 : s + 1)), STEP_MS);
    return () => window.clearInterval(id);
  }, [still]);

  const count = useCountUp(COUNT_AT[step], still);
  const done = TASKS.filter((task) => step >= task.doneAt).length;
  const shown = Math.min(APPLICANTS.length, Math.ceil(COUNT_AT[step] / 6));
  const recent = APPLICANTS.slice(Math.max(0, shown - 3), shown).reverse();
  const placed = still ? 99 : step - GROUP_START;
  let order = 0;

  return (
    <div className={`op-scene${step === 0 ? " op-scene--reset" : ""}`} aria-hidden="true">
      <div className="op-scene__bar">
        <span className="op-scene__event">2027 겨울 수련회</span>
        <span className="op-scene__live">
          <span className="op-scene__dot" />
          운영 중
        </span>
      </div>

      <div className="op-scene__grid">
        <section className="op-scene__panel">
          <header className="op-scene__head">
            <span>준비 할 일</span>
            <span className="op-scene__meta">
              {done}/{TASKS.length}
            </span>
          </header>
          <ul className="op-scene__tasks">
            {TASKS.map((task) => {
              const checked = step >= task.doneAt;
              return (
                <li key={task.title} className={`op-scene__task${checked ? " is-done" : ""}`}>
                  <span className="op-scene__check">
                    <svg viewBox="0 0 16 16" width="12" height="12">
                      <path d="M3.5 8.5l3 3 6-7" />
                    </svg>
                  </span>
                  <span className="op-scene__task-title">{task.title}</span>
                  <span className="op-scene__due">{task.due}</span>
                </li>
              );
            })}
          </ul>
          <div className="op-scene__progress">
            <span style={{ width: `${(done / TASKS.length) * 100}%` }} />
          </div>
        </section>

        <section className="op-scene__panel">
          <header className="op-scene__head">
            <span>참가 신청</span>
            <span className="op-scene__meta">정원 {CAPACITY}명</span>
          </header>
          <p className="op-scene__count">
            <strong>{count}</strong>명
          </p>
          <div className="op-scene__progress op-scene__progress--brand">
            <span style={{ width: `${(count / CAPACITY) * 100}%` }} />
          </div>
          <ul className="op-scene__recent">
            {recent.map((name) => (
              <li key={name} className="op-scene__person">
                <span className="op-scene__avatar">{name.slice(1, 2)}</span>
                <span>{name}</span>
                <span className="op-scene__new">신청</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="op-scene__panel op-scene__panel--groups">
          <header className="op-scene__head">
            <span>조 편성</span>
          </header>
          <div className="op-scene__groups">
            {GROUPS.map((group) => (
              <div key={group.name} className="op-scene__group">
                <span className="op-scene__group-name">{group.name}</span>
                <div className="op-scene__chips">
                  {group.members.map((member) => {
                    const visible = order++ < placed;
                    return (
                      <span key={member} className={`op-scene__chip${visible ? " is-in" : ""}`}>
                        {member}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={`op-scene__toast${step >= CHECK_IN_AT ? " is-in" : ""}`}>
        <span className="op-scene__toast-icon">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        </span>
        QR 체크인 · 박요한 도착
      </div>
    </div>
  );
}
