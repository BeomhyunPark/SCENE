import { PublicHeader } from "./PublicHeader";
import "./PublicPrivacy.css";

/** Public privacy policy (#455). Linked from the Google OAuth consent screen, so it must open without login. */

export const PRIVACY_UPDATED = "2026년 11월 24일";

const SECTIONS: { title: string; items: string[] }[] = [
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
];

export function PublicPrivacy() {
  return (
    <>
      <PublicHeader />
      <main className="public-privacy">
        <article className="public-privacy__card">
          <h1 className="public-privacy__title">개인정보처리방침</h1>
          <p className="public-privacy__lead">
            SCENE은 행사 운영에 꼭 필요한 정보만 받고, 그 목적에만 써요.
          </p>
          {SECTIONS.map((section) => (
            <section className="public-privacy__section" key={section.title}>
              <h2 className="public-privacy__heading">{section.title}</h2>
              <ul className="public-privacy__list">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
          <p className="public-privacy__updated">시행일: {PRIVACY_UPDATED}</p>
        </article>
      </main>
    </>
  );
}
