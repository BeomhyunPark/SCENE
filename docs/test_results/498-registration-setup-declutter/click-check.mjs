// 목업 서버에서 실제로 눌러 본다: 질문 만들기(설정 저장), 설명 펼치기, 질문 추가, 순서 바꾸기, 신청 열기/닫기, 미리보기.
// Usage: node click-check.mjs  (VITE_API_MOCK=1 pnpm dev 위에서)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const APP = "http://localhost:5173";
const SPACE = "00000000-0000-4000-8000-000000000010";
const OWNER = "00000000-0000-4000-8000-000000000001";
const log = (...a) => console.log(...a);
const browser = await chromium.launch();
for (const [size, opts] of [["1440", { viewport: { width: 1440, height: 900 } }], ["390", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext({ ...opts, locale: "ko-KR" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock?.operator && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  const ids = await page.evaluate(async ({ SPACE, OWNER }) => {
    const h = { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" };
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
    const event = await (await fetch(`/api/v1/operator/spaces/${SPACE}/events`, { method: "POST", headers: h, body: JSON.stringify({ name: "클릭 확인", startDate: "2027-01-22", endDate: "2027-01-24" }) })).json();
    return { eventId: event.eventId };
  }, { SPACE, OWNER });
  await page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, `/events/${ids.eventId}/participants/setup`);
  const list = page.getByRole("region", { name: "받을 정보" });
  await page.getByRole("button", { name: "신청서 만들기" }).click();
  await page.getByRole("button", { name: "질문 만들기" }).click();
  await list.getByText("성별").first().waitFor();
  log(size, "질문 만들기(설정 저장): 성별 질문 생김 OK");
  await page.getByRole("checkbox", { name: /^셀/ }).click();
  await page.getByRole("button", { name: "설정 저장" }).click();
  await list.getByText("셀", { exact: true }).first().waitFor();
  log(size, "설정 저장: 셀 질문 생김 OK");
  const help = page.getByRole("button", { name: "운영하는 이동 수단 설명" });
  const box = await help.boundingBox();
  await help.click();
  await page.getByText(/가는 길과 오는 길을 따로 물어요/).waitFor();
  log(size, `설명 펼침 OK (aria-expanded=${await help.getAttribute("aria-expanded")}, 높이 ${box.height}px)`);
  await page.getByRole("button", { name: "직접 질문 추가" }).click();
  await page.getByRole("textbox", { name: "질문" }).fill("티셔츠 크기");
  await page.getByRole("button", { name: "질문 추가" }).click();
  await list.getByText("티셔츠 크기").waitFor();
  log(size, "직접 질문 추가 OK");
  const first = list.getByRole("button", { name: "이름 위로" });
  log(size, `첫 칸 위로 버튼 개수: ${await first.count()}`);
  await list.getByRole("button", { name: "티셔츠 크기 위로" }).click();
  await page.waitForTimeout(500);
  const labels = await list.locator(".registration-setup__label").allInnerTexts();
  log(size, `순서 바꾸기 OK: 끝 두 칸 = ${labels.slice(-2).join(" / ")}`);
  log(size, `끝 칸 아래로 버튼 개수: ${await list.getByRole("button", { name: `${labels.at(-1)} 아래로` }).count()}`);
  await page.getByRole("button", { name: "신청 열기" }).click();
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("heading", { name: "신청 받는 중" }).waitFor();
  log(size, `신청 열기 OK: 제목 "신청 받는 중", 설정 중 배지 ${await page.getByText("설정 중").count()}개`);
  const preview = page.getByRole("region", { name: "참가자 화면 미리보기" });
  await preview.getByRole("radio", { name: "부분 참석" }).click();
  await preview.getByText(/언제 도착/).first().waitFor();
  log(size, "미리보기: 부분 참석 누르면 도착 질문 나타남 OK");
  await page.evaluate(async (eventId) => {
    const forms = await (await fetch(`/api/v1/operator/events/${eventId}/forms`)).json();
    window.sceneMock.forms.markSubmitted(eventId, forms.items[0].formId);
  }, ids.eventId);
  await page.getByRole("button", { name: "신청 닫기" }).click();
  await page.getByRole("heading", { name: "신청 닫힘" }).waitFor();
  log(size, `신청 닫기 OK: 제목 "신청 닫힘", 수정 줄 "${(await page.getByRole("region", { name: "신청 수정 받기" }).innerText()).replace(/\s+/g, " ")}"`);
  await ctx.close();
}
await browser.close();
