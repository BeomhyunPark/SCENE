// I5 (#517) real click: inside one event, press every sidebar menu item (1440) and every item of the
// phone 전체 메뉴 (390) and check that each opens a real screen (no "준비 중", no 404), plus the home's
// summary links. Usage: node i5-click.cjs <outDir>
const fs = require("fs");
const { setup, overflow, APP } = require("./week4-setup.cjs");
const OUT = process.argv[2];
const log = [];
const mark = (line) => { log.push(line); console.log(line); };
const DEAD = /아직 준비 중이에요|페이지를 찾을 수 없어요|찾을 수 없어요/;

(async () => {
  const s = await setup("I5 행사 메뉴 확인");
  const desk = await s.operator(s.desktop);
  const page = await desk.newPage();
  const home = `${APP}/events/${s.eventId}`;
  // A fresh tab first: 참가 현황 and 준비 업무 are in the menu only after this tab opened them (sessionStorage).
  await page.goto(home);
  const nav = page.getByRole("navigation").first();
  await nav.getByRole("link").first().waitFor({ timeout: 30000 });
  await page.waitForLoadState("networkidle");
  const fresh = await nav.getByRole("link").evaluateAll((links) => links.map((a) => a.textContent.trim()));
  mark(`새 탭 행사 홈 사이드바: ${fresh.join(" · ")}`);
  await page.screenshot({ path: `${OUT}/00-event-home-fresh-tab-1440.png`, fullPage: true });
  for (const segment of ["participants", "tasks"]) {
    await page.goto(`${home}/${segment}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
  }
  await page.goto(home);
  await nav.getByRole("link").first().waitFor({ timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/01-event-home-1440.png`, fullPage: true });
  const items = await nav.getByRole("link").evaluateAll((links) => links.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href") })));
  const buttons = await nav.getByRole("button").evaluateAll((list) => list.map((b) => b.textContent.trim()).filter(Boolean));
  mark(`사이드바 링크 ${items.length}개: ${items.map((i) => i.text).join(" · ")}`);
  mark(`사이드바에서 주소 없는 메뉴 버튼: ${buttons.length ? buttons.join(", ") : "없음"}`);
  let dead = 0;
  for (const item of items) {
    await page.goto(`${APP}${item.href}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    const text = await page.locator("main").innerText().catch(() => "");
    const bad = DEAD.test(text);
    if (bad) dead += 1;
    mark(`  ${item.text} → ${item.href.replace(`/events/${s.eventId}`, "") || "/"} ${bad ? "준비 중/없음(실패)" : "화면"}`);
  }
  mark(`사이드바 죽은 메뉴: ${dead}개`);

  await page.goto(home);
  const stats = page.getByRole("region", { name: "운영 요약" });
  await stats.waitFor({ timeout: 30000 });
  const statLinks = await stats.getByRole("link").evaluateAll((links) => links.map((a) => ({ text: a.textContent.trim().split(/\s+/)[0], href: a.getAttribute("href") })));
  for (const item of statLinks) {
    await page.goto(`${APP}${item.href}`);
    await page.waitForLoadState("networkidle");
    const bad = DEAD.test(await page.locator("main").innerText().catch(() => ""));
    if (bad) dead += 1;
    mark(`  홈 요약 ${item.text} → ${item.href.replace(`/events/${s.eventId}`, "")} ${bad ? "(실패)" : "화면"}`);
  }

  const ph = await s.operator(s.phone);
  const sp = await ph.newPage();
  await sp.goto(`${home}/participants`);
  await sp.waitForLoadState("networkidle");
  await sp.waitForTimeout(500);
  await sp.goto(home);
  await sp.waitForLoadState("networkidle");
  await sp.getByRole("button", { name: "전체 메뉴" }).click();
  const drawer = sp.getByRole("dialog");
  await drawer.waitFor({ timeout: 30000 });
  await sp.screenshot({ path: `${OUT}/02-phone-full-menu-390.png`, fullPage: true });
  const phoneItems = await drawer.getByRole("link").evaluateAll((links) => links.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href") })));
  mark(`휴대폰 전체 메뉴 링크 ${phoneItems.length}개: ${phoneItems.map((i) => i.text).join(" · ")}`);
  let phoneDead = 0;
  for (const item of phoneItems) {
    await sp.goto(`${APP}${item.href}`);
    await sp.waitForLoadState("networkidle");
    if (DEAD.test(await sp.locator("main").innerText().catch(() => ""))) phoneDead += 1;
  }
  mark(`휴대폰 전체 메뉴 죽은 메뉴: ${phoneDead}개, 가로 넘침(마지막 화면) ${await overflow(sp)}`);
  await sp.goto(`${home}/settings`);
  await sp.waitForLoadState("networkidle");
  await sp.getByRole("button", { name: "전체 메뉴" }).click();
  await sp.getByRole("dialog").waitFor();
  const onSettings = await sp.getByRole("dialog").getByRole("link").evaluateAll((links) => links.map((a) => a.textContent.trim()));
  mark(`참고(결정 대기): 행사 설정 화면의 전체 메뉴에는 ${onSettings.join(" · ")} — 참가 현황·준비 업무는 화면마다 넘기는 값에 따라 빠진다`);
  await sp.screenshot({ path: `${OUT}/03-phone-menu-on-settings-390.png`, fullPage: true });
  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\n");
  await s.browser.close();
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\nFAILED: " + e + "\n"); process.exit(1); });
