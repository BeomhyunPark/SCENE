// 현장 운영 화면 캡처 (#468). VITE_API_MOCK=1 pnpm dev 위에서 MSW 목업 저장소를 직접 채운다.
// node shots.mjs <outDir> <prefix>   예: node shots.mjs . before
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir = ".", prefix = "shot"] = process.argv.slice(2);
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

async function open(viewport, mobile) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, locale: "ko-KR", timezoneId: "Asia/Seoul",
    permissions: ["camera"],
  });
  await context.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await context.newPage();
  await page.goto(`${APP}/`);
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(async ({ EVENT, OWNER }) => {
    const ops = await import("/src/mocks/operatorStore.ts");
    const checks = await import("/src/mocks/checkInStore.ts");
    const groups = await import("/src/mocks/groupStore.ts");
    ops.setLifecycle(EVENT, "ACTIVE", 2);
    const people = checks.seededParticipants();
    const id = (name, nth = 0) => people.filter((p) => p.name === name)[nth].participantId;
    const one = { groupId: "00000000-0000-4000-8000-00000000a001", name: "1조" };
    const two = { groupId: "00000000-0000-4000-8000-00000000a002", name: "2조" };
    groups.seedAssignment(EVENT, id("이수아"), { ...one, leader: true });
    groups.seedAssignment(EVENT, id("최예린"), { ...one, leader: false });
    groups.seedAssignment(EVENT, id("김하늘"), { ...two, leader: true });
    groups.seedAssignment(EVENT, id("김하람"), { ...two, leader: false });
    groups.seedAssignment(EVENT, id("박서준"), { ...two, leader: false });
    const board = groups.readBoard(EVENT, OWNER);
    groups.publish(EVENT, OWNER, { expectedBoardVersion: board.boardVersion, confirmUnassigned: true });
    checks.seedCheckIn(EVENT, id("이수아"));
    checks.seedCheckIn(EVENT, id("최예린"), "2027-01-15T01:50:00Z");
    checks.seedCheckIn(EVENT, id("박서준"), "2027-01-15T02:05:00Z");
    const res = await fetch("/api/v1/operator/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": "dev-csrf" },
      body: JSON.stringify({ userId: OWNER }), credentials: "include",
    });
    if (!res.ok) throw new Error(`login ${res.status}`);
    history.pushState({}, "", `/events/${EVENT}/field`);
    dispatchEvent(new PopStateEvent("popstate"));
  }, { EVENT, OWNER });
  await page.getByRole("list", { name: "체크인 명단" }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  return { context, page };
}

for (const [label, viewport, mobile] of [["390", { width: 390, height: 844 }, true], ["1440", { width: 1440, height: 900 }, false]]) {
  const { context, page } = await open(viewport, mobile);
  const shot = (name) => page.screenshot({ path: `${outDir}/${prefix}-${label}-${name}.png`, fullPage: true });
  await shot("1-list");
  await page.getByRole("button", { name: "조별 명단" }).click();
  await page.getByRole("list", { name: "조별 체크인 현황" }).waitFor();
  await page.getByRole("list", { name: "조별 체크인 현황" }).getByRole("button", { expanded: false }).first().click();
  await page.waitForTimeout(400);
  await shot("2-groups");
  await page.getByRole("button", { name: "전체 명단" }).click();
  await page.getByRole("list", { name: "체크인 명단" }).waitFor();
  await page.getByRole("button", { name: "QR 스캔" }).click();
  await page.getByRole("region", { name: "QR 스캔" }).waitFor();
  await page.waitForTimeout(1500);
  await shot("3-qr");
  await page.getByRole("button", { name: "스캔 닫기" }).click();
  await context.setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event("offline")));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "94 김하늘 체크인", exact: true }).first().click();
  await page.waitForTimeout(800);
  await shot("4-offline");
  await context.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event("online")));
  await page.waitForTimeout(1500);
  if (await page.getByRole("button", { name: "96 박서준 체크인 취소", exact: true }).count()) {
    await page.getByRole("button", { name: "96 박서준 체크인 취소", exact: true }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${prefix}-${label}-5-cancel.png` });
    await page.getByRole("button", { name: "돌아가기" }).click();
  }
  await context.close();
}
await browser.close();
console.log("done");
