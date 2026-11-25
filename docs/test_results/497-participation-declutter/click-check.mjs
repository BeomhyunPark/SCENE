// #497 목업 서버에서 실제로 눌러 본다: 주소·QR 다이얼로그(복사·QR·Esc·포커스 복귀·Tab 가두기·신청서 설정 이동),
// 도움말, 신청 고치기 저장, 참가자 직접 추가. VITE_API_MOCK=1 pnpm dev 위에서 node click-check.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const e = `/events/${EVENT}`;
const browser = await chromium.launch();
const go = (page, path) => page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, path);
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) process.exitCode = 1; };
const h = { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" };

for (const [size, opts] of [["1440", { viewport: { width: 1440, height: 900 } }], ["390", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  console.log(`--- ${size}`);
  const ctx = await browser.newContext({ ...opts, locale: "ko-KR", permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  const ids = await page.evaluate(async ({ EVENT, OWNER, h }) => {
    window.sceneMock.operator.setLifecycle(EVENT, "ACTIVE", 1);
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
    const form = await (await fetch(`/api/v1/operator/events/${EVENT}/forms`, { method: "POST", headers: h, body: "{}" })).json();
    await fetch(`/api/v1/operator/events/${EVENT}/forms/${form.formId}`, { method: "PATCH", headers: h, body: JSON.stringify({ acceptingApplications: true }) });
    const detail = await (await fetch(`/api/v1/operator/events/${EVENT}/forms/${form.formId}`)).json();
    const f = Object.fromEntries(detail.fields.map((x) => [x.presetKey ?? x.systemKey, x.fieldId]));
    for (let i = 0; i < 3; i += 1) {
      await fetch(`/api/v1/public/events/${EVENT}/forms/${form.formId}/applications`, { method: "POST", headers: h,
        body: JSON.stringify({ pin: "730914", answers: [{ fieldId: f.NAME, text: `참가${i}` }, { fieldId: f.PHONE, text: `010-5555-000${i}` }] }) });
    }
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
    const apps = await (await fetch(`/api/v1/operator/events/${EVENT}/applications`)).json();
    return { app: (apps.items ?? apps)[0].applicationId, form: form.formId };
  }, { EVENT, OWNER, h });

  await go(page, `${e}/participants`);
  const button = page.getByRole("button", { name: "주소·QR" });
  await button.waitFor();
  ok((await page.getByText("참가자를 받는 방법").count()) === 0, "신청이 있으면 '참가자를 받는 방법' 없음");
  ok((await page.getByText("참가 운영", { exact: true }).count()) === 0, "'참가 운영' 배지 없음");
  ok((await page.getByText("칸을 누르고 화살표로").isVisible()) === false, "키보드 설명은 접혀 있음");
  await page.getByText("도움말", { exact: true }).click();
  ok(await page.getByText(/칸을 누르고 화살표로/).isVisible(), "도움말을 누르면 키보드 설명이 보임");

  await button.click();
  const dialog = page.getByRole("dialog", { name: "주소·QR" });
  await dialog.waitFor();
  ok(await dialog.evaluate((d) => d === document.activeElement), "열면 다이얼로그로 포커스");
  const apply = await dialog.getByTestId("apply-address").textContent();
  ok(apply === `${APP}/apply/${EVENT}/${ids.form}`, `신청 주소 표시 ${apply}`);
  await dialog.getByRole("button", { name: "신청 주소 복사" }).click();
  ok((await page.evaluate(() => navigator.clipboard.readText())) === apply, "신청 주소 복사 → 클립보드");
  ok(await dialog.getByText("복사했어요.").isVisible(), "'복사했어요.' 표시");
  await dialog.getByRole("button", { name: "참가자 주소 복사" }).click();
  ok((await page.evaluate(() => navigator.clipboard.readText())) === `${APP}/participate/${EVENT}`, "참가자 주소 복사 → 클립보드");
  await dialog.getByRole("button", { name: "QR 복사" }).click();
  await page.waitForTimeout(500);
  const qrMsg = await dialog.getByRole("status").last().textContent();
  ok(/QR/.test(qrMsg ?? ""), `QR 복사 결과 문구: ${qrMsg}`);
  // Tab 가두기: 마지막(닫기)에서 Tab → 첫 버튼
  await dialog.getByRole("button", { name: "닫기" }).focus();
  await page.keyboard.press("Tab");
  ok(await dialog.getByRole("button", { name: "신청 주소 복사" }).evaluate((b) => b === document.activeElement), "Tab이 다이얼로그 안에서 돈다");
  const small = await dialog.locator("button, a").evaluateAll((els) => els.map((x) => [x.textContent, Math.round(x.getBoundingClientRect().height)]).filter(([, hgt]) => hgt < 40));
  ok(small.length === 0, `다이얼로그 터치 대상 40px 이상 ${JSON.stringify(small)}`);
  await page.keyboard.press("Escape");
  ok((await page.getByRole("dialog").count()) === 0, "Esc로 닫힘");
  ok(await button.evaluate((b) => b === document.activeElement), "닫으면 '주소·QR' 버튼으로 포커스 복귀");
  await button.click();
  await page.getByRole("link", { name: "신청서 설정으로 가기" }).click();
  await page.waitForURL(`**${e}/participants/setup`);
  ok(true, "'신청서 설정으로 가기' → 신청 설정 화면");

  await go(page, `${e}/participants/${ids.app}/edit`);
  await page.getByText("참가자가 직접 고칠 수 있으면 참가자에게 맡겨 주세요.").waitFor();
  ok(true, "신청 고치기 안내 한 줄");
  await page.getByLabel(/^이름/).fill(`고친이름${size}`);
  await page.getByRole("button", { name: "고친 내용 저장" }).click();
  await page.getByText(/집계·조 편성·식수·숙소·CSV가 고친 값을 따라가요/).waitFor();
  ok(true, "저장 뒤 결과 문구에 '집계·…가 고친 값을 따라가요'");
  await page.getByText(/운영자 .+가 고침/).first().waitFor();
  ok(true, "변경 이력에 '운영자 …가 고침'");

  await go(page, `${e}/participants/new`);
  await page.getByText("신청하지 않은 사람을 운영자가 명단에 넣어요.").waitFor();
  ok(true, "직접 추가 안내 한 줄");
  await page.getByLabel(/^이름/).fill("현장손님");
  await page.getByLabel(/^전화/).fill(`010-7777-${size === "390" ? "0390" : "1440"}`);
  await page.getByRole("button", { name: "참가자 추가" }).click();
  await page.getByText("임시 번호예요. 이 화면을 벗어나면 다시 볼 수 없어요. 참가자에게 전해 주세요.").waitFor();
  ok(/^\d{6}$/.test((await page.getByLabel("임시 번호").textContent()) ?? ""), "임시 번호 6자리와 '참가자에게 전해 주세요.'");
  await ctx.close();
}
await browser.close();
