/**
 * 이름 뒤에 붙는 조사를 받침에 맞게 고른다(#523). "95 테스트가" + 을/를 → "95 테스트가를",
 * "301호" + 을/를 → "301호를", "2층 강당" + 으로/로 → "2층 강당으로", "본관" + 으로/로 → "본관으로",
 * "1층 홀" + 으로/로 → "1층 홀로"(ㄹ 받침은 로).
 *
 * 끝 글자가 한글이면 받침으로, 숫자면 읽는 소리(1 일, 10 십, 100 백 …)로, 영문 약어는 글자 이름(M 엠, R 알)으로,
 * 영문 단어는 흔히 읽는 끝소리로 고른다. 끝소리를 알 수 없으면 "을(를)"처럼 두 형태를 함께 적는다.
 * 끝의 괄호·따옴표·마침표는 건너뛰고 그 앞 글자를 본다: "김OO(94)" → 94.
 */

export type Josa = "을/를" | "이/가" | "은/는" | "과/와" | "으로/로";

/** 받침 있음 / 받침 없음 / ㄹ 받침 / 알 수 없음. */
type Ending = "consonant" | "vowel" | "rieul" | "unknown";

const FORMS: Record<Josa, { consonant: string; vowel: string }> = {
  "을/를": { consonant: "을", vowel: "를" },
  "이/가": { consonant: "이", vowel: "가" },
  "은/는": { consonant: "은", vowel: "는" },
  "과/와": { consonant: "과", vowel: "와" },
  "으로/로": { consonant: "으로", vowel: "로" },
};

/** `word`에 받침에 맞는 조사를 붙여 돌려준다. */
export function withJosa(word: string, josa: Josa): string {
  return `${word}${pickJosa(word, josa)}`;
}

/** `word` 뒤에 올 조사만 돌려준다. 끝소리를 알 수 없으면 "을(를)", "(으)로"처럼 함께 적는다. */
export function pickJosa(word: string, josa: Josa): string {
  const { consonant, vowel } = FORMS[josa];
  const ending = endingOf(word);
  if (ending === "vowel") return vowel;
  if (ending === "rieul") return josa === "으로/로" ? vowel : consonant;
  if (ending === "consonant") return consonant;
  return josa === "으로/로" ? "(으)로" : `${consonant}(${vowel})`;
}

const SKIP = /[\s)\]}>"'’”」』.,!?·…~-]/;

function endingOf(word: string): Ending {
  let end = word.length;
  while (end > 0 && SKIP.test(word[end - 1])) end--;
  const text = word.slice(0, end);
  if (text === "") return "unknown";
  const last = text[text.length - 1];
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    if (jong === 0) return "vowel";
    return jong === 8 ? "rieul" : "consonant";
  }
  if (/[0-9]/.test(last)) return numberEnding(text.match(/[0-9]+$/)![0]);
  if (/[A-Za-z]/.test(last)) return latinEnding(text.match(/[A-Za-z]+$/)![0]);
  return "unknown";
}

// 영(ㅇ) 일(ㄹ) 이 삼(ㅁ) 사 오 육(ㄱ) 칠(ㄹ) 팔(ㄹ) 구
const DIGIT: Ending[] = ["consonant", "rieul", "vowel", "consonant", "vowel", "vowel", "consonant", "rieul", "rieul", "vowel"];

function numberEnding(digits: string): Ending {
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  const zeros = trimmed.match(/0*$/)![0].length;
  if (trimmed === "0") return "consonant"; // 영
  if (zeros === 0) return DIGIT[Number(trimmed[trimmed.length - 1])];
  // 십(ㅂ) 백(ㄱ) 천(ㄴ) 만(ㄴ) … 억(ㄱ) … 조(받침 없음)
  return zeros < 12 ? "consonant" : "vowel";
}

// 글자 이름의 끝소리: L 엘, M 엠, N 엔, R 알만 받침이 있다.
const LETTER: Record<string, Ending> = { L: "rieul", M: "consonant", N: "consonant", R: "rieul" };

function latinEnding(letters: string): Ending {
  // 약어(DJ, QR, PPT)나 한 글자는 글자 이름으로 읽는다.
  if (letters.length === 1 || letters === letters.toUpperCase()) return LETTER[letters[letters.length - 1].toUpperCase()] ?? "vowel";
  const lower = letters.toLowerCase();
  if (lower.endsWith("l")) return "rieul"; // hall 홀, email 이메일
  if (/(m|n|ng)$/.test(lower)) return "consonant"; // room 룸, kitchen 키친, king 킹
  // 모음, r(Owner 오너), y, w, f(Staff 스태프), s·x(bus 버스, box 박스), d·g·z 등은 보통 받침 없이 읽는다.
  if (/[aeiouyrwfsxdgzhjqv]$/.test(lower)) return "vowel";
  // b·c·k·p·t는 book 북 / cake 케이크처럼 단어마다 다르다.
  return "unknown";
}
