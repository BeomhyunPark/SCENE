import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import "./Button.css";
import "./PublicHome.css";
import { OperationScene } from "./OperationScene";
import { ScrollTopButton } from "./ScrollTopButton";

const TITLE = ["행사 준비에 필요한 일을", "SCENE이 알려드려요."];

const SERVICE = [
  {
    tag: "할 일 추천",
    title: "행사를 잘 몰라도 운영할 수 있어요",
    body: "행사 종류와 기간에 맞춰 준비할 일과 체크리스트를 추천해요. 무엇부터 할지 몰라도 '지금 시작할 일'부터 따라가면 돼요.",
  },
  {
    tag: "골라 쓰기",
    title: "필요한 기능만 골라 써요",
    body: "작은 모임은 준비 업무만 써도 충분해요. 규모가 커지면 참가자 받기나 일정 정리를 그때 더하면 돼요.",
  },
  {
    tag: "명단과 업무",
    title: "명단과 업무를 SCENE에서 같이 관리해요",
    body: "명단, 준비 업무, 운영자, 회고를 행사별로 모아 둬요. 엑셀, 단톡방, 개인 메모를 오가며 맞춰 보지 않아도 돼요.",
  },
  {
    tag: "회고",
    title: "끝난 행사는 회고로 남겨요",
    body: "잘된 점과 아쉬운 점을 적어 두면 담당자가 바뀌어도 다음 해에 그대로 참고할 수 있어요.",
  },
];

const SIZES = [
  {
    title: "작은 모임",
    example: "리더 모임, 하루 행사",
    uses: ["준비 업무"],
  },
  {
    title: "중간 규모 행사",
    example: "성경학교, 워크숍",
    uses: ["준비 업무", "참가자 받기"],
  },
  {
    title: "큰 행사",
    example: "수련회, 비전트립",
    uses: ["준비 업무", "참가자 받기", "일정 정리", "운영자 초대"],
  },
];

const STEPS = [
  { title: "행사 만들기", body: "행사 종류와 날짜만 정하면 시작할 수 있어요." },
  { title: "필요한 기능 고르기", body: "행사 크기에 맞춰 필요한 것만 골라 시작하고, 나머지는 필요해질 때 더해요." },
  { title: "추천대로 준비하기", body: "추천받은 업무를 담당자와 나누고, 체크리스트로 빠진 일이 없는지 확인해요." },
  { title: "회고 남기기", body: "잘된 점과 아쉬운 점을 적어 두고 다음 행사 때 다시 꺼내 봐요." },
];

const FAQ = [
  {
    q: "행사를 처음 맡았는데 쓸 수 있을까요?",
    a: "네. 행사 종류와 기간에 맞는 준비 업무를 추천하고, 지금 해야 할 일부터 차례로 안내해요.",
  },
  {
    q: "작은 모임에도 쓸 만한가요?",
    a: "네. 작은 행사는 준비 업무만 써도 돼요. 다른 기능은 필요할 때 켜면 돼요.",
  },
  { q: "참여자도 가입해야 하나요?", a: "아니요. 운영자가 공유한 신청 링크에서 바로 신청할 수 있어요." },
  { q: "운영자 계정은 어떻게 만드나요?", a: "Google 계정으로 처음 로그인하면 SCENE 계정이 만들어져요." },
];

export function PublicHome() {
  const navigate = useNavigate();
  const [launch, setLaunch] = useState<{ x: number; y: number } | null>(null);
  const launched = useRef(false);

  function toLogin() {
    if (launched.current) return;
    launched.current = true;
    navigate("/login", { state: { launched: true } });
  }

  // The curtain's animationend moves on; the timer covers browsers that skip the animation.
  useEffect(() => {
    if (!launch) return;
    const id = window.setTimeout(toLogin, 750);
    return () => window.clearTimeout(id);
  });

  // 시작하기 covers both: a new operator gets an account on the first Google sign-in (DEC-069).
  function start(event: MouseEvent<HTMLButtonElement>) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      navigate("/login", { state: { launched: true } });
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    setLaunch({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  }

  return (
    <main className="public-home">
      <div className="public-home__stack">
        <div className="public-home__copy">
          <svg className="public-home__symbol" viewBox="0 0 35.712 35.712" width="48" height="48" aria-hidden="true">
            <path d="M7.2 24.2784V13.2672C7.2 11.184 8.3904 9.9936 10.4736 9.3984L26.8416 3.744" />
            <path d="M28.3296 12.0768V22.4928C28.3296 24.576 27.1392 25.7664 25.3536 26.3616L9.5808 31.7184" />
          </svg>
          <h1 className="public-home__title" aria-label={TITLE.join(" ")}>
            {TITLE.map((line, lineIndex) => (
              <span key={line} className="public-home__title-line">
                {line.split(" ").map((word, wordIndex, words) => (
                  <span key={word}>
                    <span
                      className="public-home__word"
                      style={{ animationDelay: `${450 + (lineIndex * 3 + wordIndex) * 70}ms` }}
                    >
                      {word}
                    </span>
                    {wordIndex < words.length - 1 ? " " : null}
                  </span>
                ))}
                {lineIndex < TITLE.length - 1 ? <br /> : null}
              </span>
            ))}
          </h1>
          <p className="public-home__support public-home__enter" style={{ animationDelay: "850ms" }}>SCENE은 교회 공동체의 행사 준비와 운영을 돕는 서비스예요.</p>
          <div className="public-home__actions public-home__enter" style={{ animationDelay: "950ms" }}>
            <button type="button" className="public-home__start" onClick={start} disabled={launch !== null}>
              시작하기
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" />
              </svg>
            </button>
          </div>
        </div>
        <div className="public-home__scene public-home__enter" style={{ animationDelay: "1100ms" }}>
          <OperationScene />
        </div>
      </div>

      <section id="service" className="public-home__section" aria-labelledby="service-title">
        <h2 id="service-title" className="public-home__section-title">
          행사를 처음 운영해도 어려움 없이
        </h2>
        <p className="public-home__section-lead">
          무엇부터 해야 할지 SCENE이 알려드려요. 명단과 업무도 SCENE에서 같이 관리해요.
        </p>
        <ul className="public-home__cards">
          {SERVICE.map((item) => (
            <li key={item.title} className="public-home__card">
              <span className="public-home__tag">{item.tag}</span>
              <h3 className="public-home__card-title">{item.title}</h3>
              <p className="public-home__card-body">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="how" className="public-home__section" aria-labelledby="how-title">
        <h2 id="how-title" className="public-home__section-title">
          행사 규모만큼 필요한 기능만
        </h2>
        <p className="public-home__section-lead">모든 기능을 다 쓰지 않아도 돼요. 행사에 필요한 것만 골라 시작하세요.</p>
        <ul className="public-home__sizes">
          {SIZES.map((size) => (
            <li key={size.title} className="public-home__size">
              <h3 className="public-home__card-title">{size.title}</h3>
              <p className="public-home__card-body">{size.example}</p>
              <ul className="public-home__uses" aria-label={`${size.title}에서 쓰는 기능`}>
                {size.uses.map((use) => (
                  <li key={use} className="public-home__tag">
                    {use}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <ol className="public-home__steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="public-home__step">
              <span className="public-home__step-number" aria-hidden="true">
                {index + 1}
              </span>
              <h3 className="public-home__card-title">{step.title}</h3>
              <p className="public-home__card-body">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="help" className="public-home__section" aria-labelledby="help-title">
        <h2 id="help-title" className="public-home__section-title">
          자주 묻는 질문
        </h2>
        <dl className="public-home__faq">
          {FAQ.map((item) => (
            <div key={item.q} className="public-home__faq-item">
              <dt className="public-home__card-title">{item.q}</dt>
              <dd className="public-home__card-body">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
      <ScrollTopButton />
      {launch ? (
        <div
          className="public-home__launch"
          aria-hidden="true"
          style={{ "--launch-x": `${launch.x}px`, "--launch-y": `${launch.y}px` } as CSSProperties}
          onAnimationEnd={toLogin}
        />
      ) : null}
    </main>
  );
}
