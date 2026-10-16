import type { PrivacyCategory, PrivacyFinding } from "./types";

type Rule = {
  category: PrivacyCategory;
  keywords: readonly string[];
  message: string;
  suggestion: string;
};

const RULES: readonly Rule[] = [
  {
    category: "UNIQUE_ID",
    keywords: ["주민등록번호", "주민번호", "외국인등록번호", "여권번호", "운전면허번호"],
    message: "고유식별정보예요. 법령 근거나 별도 동의 없이 받을 수 없어요.",
    suggestion: "생년월일이나 나이로 충분한지 확인해 주세요.",
  },
  {
    category: "SENSITIVE",
    keywords: [
      "건강",
      "질병",
      "병력",
      "지병",
      "복용약",
      "약복용",
      "약물",
      "알레르기",
      "장애",
      "정신",
      "임신",
      "종교",
      "신앙",
      "정치",
      "정당",
      "노조",
      "성생활",
      "성적지향",
      "범죄",
      "전과",
    ],
    message: "민감정보일 수 있어요. 별도 동의가 필요하고 행사 후 바로 지워야 해요.",
    suggestion: "행사 운영에 꼭 필요한 내용만 물어봐 주세요. (예: 알레르기 있음/없음)",
  },
  {
    category: "FINANCIAL",
    keywords: ["계좌", "계좌번호", "카드번호", "신용카드"],
    message: "금융 정보예요. 꼭 필요한지 확인해 주세요.",
    suggestion: "회비 확인이 목적이면 입금자명만 받아도 되는지 확인해 주세요.",
  },
  {
    category: "ID_DOCUMENT",
    keywords: ["신분증", "신분증사본", "여권사본"],
    message: "신분증 사본은 받지 않는 것이 좋아요.",
    suggestion: "본인 확인이 꼭 필요한지 먼저 확인해 주세요.",
  },
];

export function findingsFor(label: string): PrivacyFinding[] {
  const normalized = normalizeLabel(label);
  if (normalized.length === 0) return [];
  const findings: PrivacyFinding[] = [];
  for (const rule of RULES) {
    const hits = rule.keywords.filter((keyword) => normalized.includes(normalizeLabel(keyword)));
    if (hits.length === 0) continue;
    const matched = hits.reduce((best, keyword) => (keyword.length > best.length ? keyword : best));
    findings.push({
      category: rule.category,
      matched,
      message: rule.message,
      suggestion: rule.suggestion,
    });
  }
  return findings;
}

function normalizeLabel(value: string): string {
  return value.normalize("NFC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}
