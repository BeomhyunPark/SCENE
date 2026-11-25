import { useSearchParams } from "react-router";
import { PublicHeader } from "./PublicHeader";
import "./PublicPrivacy.css";

/**
 * Public privacy policy (#455). Linked from the Google OAuth consent screen, so it must open without
 * login. Korean by default; `?lang=en` shows English so that link can be shared on its own.
 */

type Lang = "ko" | "en";

type Policy = {
  title: string;
  lead: string;
  updated: string;
  sections: { title: string; items: string[] }[];
};

const POLICY: Record<Lang, Policy> = {
  ko: {
    title: "개인정보처리방침",
    lead: "SCENE은 행사 운영에 꼭 필요한 정보만 받고, 그 목적에만 써요.",
    updated: "시행일: 2026년 11월 24일",
    sections: [
      {
        title: "1. 수집하는 정보",
        items: [
          "운영자: Google 로그인으로 받는 이름, 이메일 주소, Google 계정 식별자",
          "행사 참가자: 신청서에 직접 적은 이름, 전화번호, 또래와 운영진이 신청서에 넣은 질문의 답",
          "행사 운영 기록: 체크인 시각, 조 편성, 운영자가 남긴 작업 기록",
          "서비스 운영에 필요한 접속 기록: 로그인 상태를 유지하는 쿠키, 오류 확인용 서버 기록",
        ],
      },
      {
        title: "2. 이용 목적",
        items: [
          "운영자 로그인과 본인 확인, 초대받은 조직·행사에 대한 권한 확인",
          "행사 신청 접수, 명단 관리, 조 편성, 체크인, 공지 전달",
          "서비스 오류 확인과 부정 이용 방지",
        ],
      },
      {
        title: "3. 보관 기간과 삭제",
        items: [
          "행사 정보와 신청 정보는 행사가 끝나고 1년 안에 삭제해요.",
          "운영자 계정 정보는 탈퇴를 요청하면 지체 없이 삭제해요.",
          "장애 대비용 백업은 암호화해서 보관하고, 위 기간이 지난 백업도 함께 지워요.",
          "법령에 따라 보관해야 하는 정보는 그 기간 동안만 보관해요.",
        ],
      },
      {
        title: "4. 제3자 제공",
        items: [
          "수집한 정보를 광고나 마케팅을 위해 다른 곳에 제공하거나 판매하지 않아요.",
          "신청 정보는 그 행사를 운영하는 운영진에게만 보여요.",
        ],
      },
      {
        title: "5. 처리를 맡기는 곳",
        items: [
          "Google: 운영자 로그인(Google 계정 인증)",
          "Cloudflare: 접속 연결과 보안(HTTPS), 암호화된 백업 파일 보관",
          "이 업체들은 해외에 서버를 둘 수 있어요. 백업은 서비스에서 암호화한 뒤 보내서 업체가 내용을 볼 수 없어요.",
        ],
      },
      {
        title: "6. 이용자의 권리",
        items: [
          "자기 정보를 보거나 고치거나 지워 달라고 요청할 수 있어요.",
          "행사 신청 정보는 신청한 행사의 운영진에게, 그 밖의 요청은 아래 문의처로 연락해 주세요.",
        ],
      },
      {
        title: "7. 문의",
        items: ["개인정보 관련 문의는 신청한 행사의 운영진이나 SCENE 관리자에게 연락해 주세요."],
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    lead: "SCENE collects only the information needed to run events, and uses it only for that purpose.",
    updated: "Effective date: November 24, 2026",
    sections: [
      {
        title: "1. Information we collect",
        items: [
          "Operators: name, email address, and Google account identifier received through Google sign-in",
          "Event participants: name, phone number, and age group entered on the registration form, plus answers to questions the organizers added",
          "Event records: check-in times, group assignments, and task records left by operators",
          "Service records: cookies that keep you signed in, and server logs used to diagnose errors",
        ],
      },
      {
        title: "2. How we use it",
        items: [
          "Signing operators in, verifying identity, and checking access to the organizations and events they were invited to",
          "Accepting registrations, managing rosters, assigning groups, check-in, and sending notices",
          "Diagnosing errors and preventing misuse",
        ],
      },
      {
        title: "3. Retention and deletion",
        items: [
          "Event and registration data is deleted within one year after the event ends.",
          "Operator account data is deleted without delay when deletion is requested.",
          "Backups are encrypted, and backups past the period above are deleted as well.",
          "Information that the law requires us to keep is kept only for the required period.",
        ],
      },
      {
        title: "4. Sharing with third parties",
        items: [
          "We do not sell or share your information for advertising or marketing.",
          "Registration data is visible only to the organizers of that event.",
        ],
      },
      {
        title: "5. Service providers",
        items: [
          "Google: operator sign-in (Google account authentication)",
          "Cloudflare: network connection and security (HTTPS), storage of encrypted backup files",
          "These providers may operate servers outside Korea. Backups are encrypted by SCENE before upload, so providers cannot read their contents.",
        ],
      },
      {
        title: "6. Your rights",
        items: [
          "You can ask to view, correct, or delete your information.",
          "For registration data, contact the organizers of the event you registered for. For other requests, use the contact below.",
        ],
      },
      {
        title: "7. Contact",
        items: [
          "For privacy questions, contact the organizers of the event you registered for or the SCENE administrator.",
        ],
      },
    ],
  },
};

const LANGS: { lang: Lang; label: string; name: string }[] = [
  { lang: "ko", label: "KOR", name: "한국어" },
  { lang: "en", label: "ENG", name: "English" },
];

export function PublicPrivacy() {
  const [params, setParams] = useSearchParams();
  const lang: Lang = params.get("lang") === "en" ? "en" : "ko";
  const policy = POLICY[lang];

  function choose(next: Lang) {
    setParams(next === "en" ? { lang: "en" } : {}, { replace: true });
  }

  return (
    <>
      <PublicHeader />
      <main className="public-privacy">
        <article className="public-privacy__card" lang={lang}>
          <div className="public-privacy__langs" role="group" aria-label="Language">
            {LANGS.map((option) => (
              <button
                key={option.lang}
                type="button"
                className="public-privacy__lang"
                aria-pressed={lang === option.lang}
                aria-label={option.name}
                onClick={() => choose(option.lang)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <h1 className="public-privacy__title">{policy.title}</h1>
          <p className="public-privacy__lead">{policy.lead}</p>
          {policy.sections.map((section) => (
            <section className="public-privacy__section" key={section.title}>
              <h2 className="public-privacy__heading">{section.title}</h2>
              <ul className="public-privacy__list">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
          <p className="public-privacy__updated">{policy.updated}</p>
        </article>
      </main>
    </>
  );
}
