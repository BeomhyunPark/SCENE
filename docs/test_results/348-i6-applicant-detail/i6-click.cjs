// I6 (#348) real click: the participant name on 현장 운영 (phone list, desktop detail panel), 조 편성 and
// 숙소 opens the same 신청 상세 (/events/:eventId/participants/:applicationId), and its back arrow
// returns to the screen it came from. Usage: node i6-click.cjs <outDir>
const fs = require("fs");
const { setup, overflow, APP } = require("../517-i5-event-menu/week4-setup.cjs");
const OUT = process.argv[2];
const log = [];
const mark = (line) => { log.push(line); console.log(line); };
const NAME = "93 이조원";

(async () => {
  const s = await setup("I6 신청 상세 확인");
  const expected = `/events/${s.eventId}/participants/${s.mate2.applicationId}`;
  const desk = await s.operator(s.desktop);
  const page = await desk.newPage();
  const opened = async (from, shot) => {
    await page.getByRole("heading", { name: "신청 내용" }).waitFor({ timeout: 30000 });
    const path = new URL(page.url()).pathname;
    mark(`${from} → ${path === expected ? "같은 신청 상세" : `다른 주소 ${path}`}`);
    if (shot) await page.screenshot({ path: `${OUT}/${shot}`, fullPage: true });
    await page.getByRole("link", { name: "이전 화면" }).click();
    await page.waitForURL((url) => !url.pathname.includes("/participants/"), { timeout: 30000 });
    mark(`  뒤로 → ${new URL(page.url()).pathname.replace(`/events/${s.eventId}`, "")}`);
  };

  // 현장 운영, desktop: the row selects; the name in the detail panel opens the detail.
  await page.goto(`${APP}/events/${s.eventId}/field`);
  await page.getByRole("button", { name: new RegExp(NAME) }).first().click();
  const panelName = page.locator(".event-field__detail-name").getByRole("link", { name: NAME });
  await panelName.waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${OUT}/01-field-1440-panel-name.png`, fullPage: true });
  await panelName.click();
  await opened("현장 운영 1440(상세 패널 이름)", "02-detail-from-field-1440.png");

  for (const [label, segment, shot] of [["조 편성 1440", "groups", "03-groups-1440.png"], ["숙소 1440", "rooms", "04-rooms-1440.png"]]) {
    await page.goto(`${APP}/events/${s.eventId}/${segment}`);
    const link = page.getByRole("link", { name: NAME }).first();
    await link.waitFor({ timeout: 30000 });
    await page.screenshot({ path: `${OUT}/${shot}`, fullPage: true });
    mark(`${label}: 이름 링크 href=${(await link.getAttribute("href")) === expected ? "같은 상세" : await link.getAttribute("href")}`);
    await link.click();
    await opened(label);
  }

  // 현장 운영, phone: the name in the list is the link.
  const ph = await s.operator(s.phone);
  const sp = await ph.newPage();
  await sp.goto(`${APP}/events/${s.eventId}/field`);
  const phoneLink = sp.getByRole("link", { name: NAME }).first();
  await phoneLink.waitFor({ timeout: 30000 });
  await sp.screenshot({ path: `${OUT}/05-field-390.png`, fullPage: true });
  mark(`현장 운영 390 가로 넘침 ${await overflow(sp)}`);
  await phoneLink.click();
  await sp.getByRole("heading", { name: "신청 내용" }).waitFor({ timeout: 30000 });
  mark(`현장 운영 390 → ${new URL(sp.url()).pathname === expected ? "같은 신청 상세" : sp.url()}`);
  await sp.screenshot({ path: `${OUT}/06-detail-from-field-390.png`, fullPage: true });
  await sp.getByRole("link", { name: "이전 화면" }).click();
  await sp.waitForURL((url) => url.pathname.endsWith("/field"), { timeout: 30000 });
  mark("  뒤로 → /field");

  // Opened from anywhere else (here: typed address), the back arrow still goes to 참가 현황.
  mark(`참가 현황에서 연 상세의 뒤로: ${await (async () => { await page.goto(`${APP}${expected}`); await page.getByRole("heading", { name: "신청 내용" }).waitFor(); return page.getByRole("link", { name: "신청자 목록" }).getAttribute("href"); })()}`);
  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\n");
  await s.browser.close();
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\nFAILED: " + e + "\n"); process.exit(1); });
