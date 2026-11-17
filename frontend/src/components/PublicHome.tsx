import { useState } from "react";
import { Link } from "react-router";
import "./Button.css";
import "./PublicHome.css";
import { MarketingPreview } from "./MarketingPreview";
import { ScrollTopButton } from "./ScrollTopButton";
import { startGoogleSignIn } from "../api/googleSignIn";

const SERVICE = [
  {
    tag: "처음이어도",
    title: "행사를 잘 몰라도 운영할 수 있어요",
    body: "행사 종류와 기간에 맞춰 준비할 일과 체크리스트를 추천해요. 무엇부터 할지 몰라도 '지금 시작할 일'부터 따라가면 돼요.",
  },
  {
    tag: "필요한 만큼만",
    title: "행사 크기에 맞게 골라서 운영해요",
    body: "작은 모임은 준비 업무만으로 충분해요. 규모가 커지면 참가자 받기, 일정 정리처럼 필요한 운영을 그때 더하면 돼요.",
  },
  {
    tag: "한곳에",
    title: "흩어진 정보와 불필요한 문서를 줄여요",
    body: "명단, 준비 업무, 운영자, 회고가 행사 하나에 모여요. 엑셀과 단체 대화방, 개인 메모를 오가며 맞춰 볼 필요가 없어요.",
  },
  {
    tag: "다음 행사로",
    title: "매년 반복하는 실수를 남기지 않아요",
    body: "행사가 끝나면 회고를 함께 남겨요. 담당자가 바뀌어도 올해의 경험이 다음 행사의 출발점이 돼요.",
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
  { title: "필요한 운영 고르기", body: "행사 크기에 맞춰 필요한 것만 골라 시작하고, 나머지는 필요해질 때 더해요." },
  { title: "추천대로 준비하기", body: "추천받은 업무를 담당자와 나누고, 체크리스트로 빠진 일이 없는지 확인해요." },
  { title: "회고 남기기", body: "잘된 점과 아쉬운 점을 남겨 다음 행사가 같은 실수를 반복하지 않게 해요." },
];

const FAQ = [
  {
    q: "행사를 처음 맡았는데 쓸 수 있을까요?",
    a: "네. 행사 종류와 기간에 맞는 준비 업무를 추천하고, 지금 해야 할 일부터 차례로 안내해요.",
  },
  {
    q: "작은 모임에도 쓸 만한가요?",
    a: "작은 행사는 준비 업무만으로 시작해도 괜찮아요. 쓰지 않는 운영은 시작하지 않으면 그만이에요.",
  },
  { q: "참여자도 가입해야 하나요?", a: "아니요. 운영자가 공유한 신청 링크에서 바로 신청할 수 있어요." },
  { q: "운영자 계정은 어떻게 만드나요?", a: "Google 계정으로 처음 로그인하면 SCENE 계정이 만들어져요." },
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
          <p className="public-home__support">교회 공동체를 위한 행사 운영 플랫폼, SCENE.</p>
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
          행사를 처음 맡아도, 운영할 수 있도록
        </h2>
        <p className="public-home__section-lead">
          불필요한 문서는 줄이고, 흩어진 정보는 한곳에 모으고, 매년 반복되는 실수는 남기지 않아요.
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
          행사 크기만큼만, 필요한 운영만
        </h2>
        <p className="public-home__section-lead">모든 기능을 다 쓸 필요는 없어요. 행사에 맞게 골라 시작해요.</p>
        <ul className="public-home__sizes">
          {SIZES.map((size) => (
            <li key={size.title} className="public-home__size">
              <h3 className="public-home__card-title">{size.title}</h3>
              <p className="public-home__card-body">{size.example}</p>
              <ul className="public-home__uses" aria-label={`${size.title}에서 쓰는 운영`}>
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
    </main>
  );
}
