import { useState } from "react";
import { Link } from "react-router";
import "./Button.css";
import "./PublicHome.css";
import { MarketingPreview } from "./MarketingPreview";
import { startGoogleSignIn } from "../api/googleSignIn";

const SERVICE = [
  { title: "준비하는 사람에게", body: "행사 정보와 준비 상황, 할 일을 함께 살펴볼 수 있어요." },
  { title: "현장을 맡은 사람에게", body: "바뀐 상황을 바로 확인하고 다음 행동을 이어갈 수 있어요." },
  { title: "참여하는 사람에게", body: "일정과 안내를 필요한 순간에 휴대폰에서 찾을 수 있어요." },
];

const STEPS = [
  { title: "행사 만들기", body: "행사 이름과 일정을 정하고 함께 준비할 운영자를 초대해요." },
  { title: "신청 받기", body: "행사에 맞는 신청서를 만들고 링크 하나로 신청을 받아요." },
  { title: "함께 준비하기", body: "신청 명단을 확인하고 할 일을 나눠 맡아 진행 상황을 공유해요." },
  { title: "마무리하기", body: "행사가 끝나면 회고를 남겨 다음 행사의 출발점으로 삼아요." },
];

const FAQ = [
  { q: "계정은 어떻게 만드나요?", a: "Google 계정으로 처음 로그인하면 SCENE 계정이 만들어져요." },
  { q: "참여자도 가입해야 하나요?", a: "아니요. 운영자가 공유한 신청 링크에서 바로 신청할 수 있어요." },
  { q: "다른 운영자와 함께 준비할 수 있나요?", a: "네. 행사의 운영자 화면에서 초대 링크를 보내 함께 운영할 수 있어요." },
  { q: "개인정보는 안전한가요?", a: "개인정보 보호를 기본 원칙으로 두고, 신청서에는 운영에 꼭 필요한 정보만 받도록 안내해요." },
];

export function PublicHome() {
  const [googleMock, setGoogleMock] = useState(false);

  // DEC-069: an account is made on the first Google sign-in.
  function createAccount() {
    if (import.meta.env.VITE_API_MOCK === "1") setGoogleMock(true);
    else startGoogleSignIn(null);
  }

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
          <div className="public-home__actions">
            <Link className="scene-button scene-button--primary scene-button--size-40" to="/login">
              <span className="scene-button__label">로그인</span>
            </Link>
            <p className="public-home__signup">
              계정이 없으신가요?{" "}
              <button type="button" className="public-home__create" onClick={createAccount}>
                계정 만들기
              </button>
            </p>
            <p className="public-home__notice" role="status">
              {googleMock ? "목업 화면에서는 Google 로그인을 쓸 수 없어요." : null}
            </p>
          </div>
        </div>
        <MarketingPreview />
      </div>

      <section id="service" className="public-home__section" aria-labelledby="service-title">
        <h2 id="service-title" className="public-home__section-title">
          흩어진 행사 정보를 한곳에
        </h2>
        <p className="public-home__section-lead">
          신청 명단은 스프레드시트에, 변경 공지는 단체 대화방에, 현장 사정은 담당자의 기억에.
          <br />
          SCENE은 정보를 확인하고 다시 전달하는 수고를 줄여 사람에게 집중할 시간을 만들어요.
        </p>
        <ul className="public-home__cards">
          {SERVICE.map((item) => (
            <li key={item.title} className="public-home__card">
              <h3 className="public-home__card-title">{item.title}</h3>
              <p className="public-home__card-body">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="how" className="public-home__section" aria-labelledby="how-title">
        <h2 id="how-title" className="public-home__section-title">
          준비부터 마무리까지, 하나의 흐름으로
        </h2>
        <p className="public-home__section-lead">
          수련회, 아웃리치, 비전트립, 성경학교. 행사의 크기보다 실제로 필요한 일에 맞춰 운영해요.
        </p>
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
    </main>
  );
}
