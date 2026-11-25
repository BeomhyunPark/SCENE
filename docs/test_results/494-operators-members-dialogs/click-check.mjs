// #494 목업에서 실제로 눌러 주요 흐름을 끝까지 확인한다. VITE_API_MOCK=1 pnpm dev(5173) 위에서 돌린다.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const browser = await chromium.launch();
const log = (step, ok, note = "") => console.log(`${ok ? "OK  " : "FAIL"} ${step}${note ? ` — ${note}` : ""}`);
for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  console.log(`## ${size.width}`);
  const ctx = await browser.newContext({ viewport: size, locale: "ko-KR", timezoneId: "Asia/Seoul", hasTouch: size.width < 500 });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await page.evaluate(async ({ EVENT, OWNER }) => {
    window.sceneMock.operator.setLifecycle(EVENT, "ACTIVE", 1);
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" }, body: JSON.stringify({ userId: OWNER }) });
  }, { EVENT, OWNER });
  const go = (path) => page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, path);
  const status = () => page.getByRole("status").first().innerText();
  try {
    await go(`/events/${EVENT}/operators`);
    await page.getByText("Local staff").first().waitFor();
    // 1. 조직 멤버 추가
    await page.getByRole("button", { name: "운영자 추가" }).click();
    const dialog = page.getByRole("dialog", { name: "운영자 추가" });
    await dialog.waitFor();
    const box = await page.getByRole("button", { name: "운영자 추가" }).boundingBox();
    await dialog.getByRole("button", { name: "운영자로 추가" }).click();
    await page.getByText("Local member님을 Staff 역할로 추가했어요.").waitFor();
    log("운영자 추가 → 조직 멤버 → 운영자로 추가", (await dialog.count()) === 0, await status());
    // 2. 키보드로 다이얼로그 열고 Esc, 포커스 복귀
    await page.getByRole("button", { name: "운영자 추가" }).focus();
    await page.keyboard.press("Enter");
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    const back = await page.evaluate(() => document.activeElement?.textContent);
    log("Enter로 열고 Esc로 닫기, 포커스가 버튼으로", back === "운영자 추가", `focus=${back}`);
    // 3. 이메일 초대
    await page.getByRole("button", { name: "운영자 추가" }).click();
    await dialog.getByText("외부 협력자 초대").click();
    await dialog.getByLabel("이메일").fill(`guest${size.width}@example.org`);
    await dialog.getByLabel("역할").click();
    await page.keyboard.press("Escape");
    const stays = (await dialog.count()) === 1;
    await dialog.getByLabel("역할").click();
    await page.getByRole("option", { name: "Manager" }).click();
    log("다이얼로그 안 공용 Select: 목록 열고 Esc는 목록만 닫음 → Manager 고르기", stays && (await dialog.getByLabel("역할").innerText()).includes("Manager"));
    await dialog.getByRole("button", { name: "초대 메일 보내기" }).click();
    await page.getByText(`guest${size.width}@example.org에게 초대 메일을 보냈어요.`, { exact: false }).waitFor();
    log("운영자 추가 → 외부 협력자 초대 → 초대 메일 보내기", (await page.getByRole("list", { name: "대기 중인 초대" }).getByText(`guest${size.width}@example.org`).count()) === 1);
    // 4. 다시 보내기·초대 취소
    await page.getByRole("button", { name: `guest${size.width}@example.org 다시 보내기` }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: `guest${size.width}@example.org 초대 취소` }).click();
    await page.getByText("대기 중인 초대가 없어요.").waitFor();
    log("다시 보내기 → 초대 취소 → 빈 목록 한 줄", (await page.getByText("0건").count()) === 0);
    // 5. 행 메뉴: 키보드로 권한 열기
    await page.getByRole("button", { name: "Local staff 메뉴" }).focus();
    await page.keyboard.press("ArrowDown");
    await page.getByRole("menu").waitFor();
    const first = await page.evaluate(() => document.activeElement?.textContent);
    await page.keyboard.press("Enter");
    const perm = page.getByRole("dialog", { name: "Local staff님의 권한" });
    await perm.waitFor();
    await perm.getByRole("checkbox", { name: "조 편성" }).check();
    await perm.getByRole("button", { name: "저장" }).click();
    await page.getByText("Local staff님의 권한을 저장했어요.").waitFor();
    log("행 메뉴(키보드) → 권한 → 저장", first === "권한", `first item focus=${first}`);
    const tb = await page.getByRole("button", { name: "Local staff 메뉴" }).boundingBox();
    log("행 메뉴 버튼 크기", tb.width >= 40 && tb.height >= 40, `${tb.width}x${tb.height}`);
    // 6. 역할 변경
    await page.getByRole("button", { name: "Local staff 메뉴" }).click();
    const item = page.getByRole("menuitem", { name: "Manager로 변경" });
    const ib = await item.boundingBox();
    await item.click();
    await page.getByRole("dialog").getByRole("button", { name: "역할 바꾸기" }).click();
    await page.getByText("Local staff님의 역할을 Manager로 바꿨어요.").waitFor();
    log("행 메뉴 → Manager로 변경 → 역할 바꾸기", true, `menu item height=${ib.height}`);
    // 7. 빼기
    await page.getByRole("button", { name: "Local member 메뉴" }).click();
    await page.getByRole("menuitem", { name: "빼기" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "빼기" }).click();
    await page.getByText("Local member님을 행사 운영자에서 뺐어요.").waitFor();
    log("행 메뉴 → 빼기 → 빼기", true);
    // 8. 조직 멤버 초대
    await go("/members");
    await page.getByText("Local manager").first().waitFor();
    await page.getByRole("button", { name: "멤버 초대" }).click();
    const md = page.getByRole("dialog", { name: "멤버 초대" });
    await md.getByLabel("이메일").fill("not-an-email");
    await md.getByRole("button", { name: "초대 메일 보내기" }).click();
    await md.getByText("이메일을 확인해 주세요.").waitFor();
    await md.getByLabel("이메일").fill(`member${size.width}@example.org`);
    await md.getByRole("button", { name: "초대 메일 보내기" }).click();
    await page.getByText(`member${size.width}@example.org에게 초대 메일을 보냈어요.`, { exact: false }).waitFor();
    log("멤버 초대 → 잘못된 이메일 안내 → 초대 메일 보내기", (await md.count()) === 0);
    await page.getByRole("button", { name: `member${size.width}@example.org 초대 취소` }).click();
    await page.getByText("대기 중인 초대가 없어요.").waitFor();
    log("조직 초대 취소 → 빈 목록 한 줄", (await page.getByText("0건").count()) === 0);
  } catch (error) {
    log("흐름", false, String(error).split("\n")[0]);
  }
  await ctx.close();
}
await browser.close();
