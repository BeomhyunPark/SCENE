// 조장 조원 현황 → 조원 상세 실제 클릭 (local 서버 + Vite VITE_API_MOCK=0), 휴대폰 390px.
// Usage: node member-click.cjs <outDir>
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.argv[2];
const APP = "http://localhost:5173";
const OWNER = "00000000-0000-4000-8000-000000000001";
const PIN = "730914";
const H = { "X-XSRF-TOKEN": "dev-csrf" };
const log = [];
const mark = (step, extra = "") => { const line = `${step}${extra ? " — " + extra : ""}`; log.push(line); console.log(line); };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" };
async function api(ctx, method, path, data) {
  const res = await ctx.request.fetch(`${APP}${path}`, { method, headers: H, data });
  const text = await res.text();
  if (res.status() >= 300) throw new Error(`${method} ${path} ${res.status()} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = async (options) => { const c = await browser.newContext(options); await c.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]); return c; };
  const op = await ctx({ locale: "ko-KR" });
  await api(op, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
  const spaces = await api(op, "GET", "/api/v1/operator/spaces");
  const spaceId = (spaces.items ?? spaces)[0].spaceId;
  const today = new Date(Date.now() + 9 * 3600e3);
  const day = (o) => new Date(today.getTime() + o * 86400e3).toISOString().slice(0, 10);
  const { eventId } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "조원 상세 클릭 확인", eventType: "RETREAT", startDate: day(-1), endDate: day(1), place: "양평" });
  const ev = `/api/v1/operator/events/${eventId}`;
  const { formId } = await api(op, "POST", `${ev}/forms`, {});
  const detail = await api(op, "GET", ev);
  await api(op, "POST", `${ev}/activate`, { expectedLifecycleVersion: detail.lifecycleVersion });
  await api(op, "PATCH", `${ev}/forms/${formId}`, { acceptingApplications: true });
  const ids = {};
  for (const f of (await api(op, "GET", `${ev}/forms/${formId}`)).fields) { const k = f.presetKey ?? f.systemKey; if (k) ids[k] = f.fieldId; }
  const people = {};
  for (const [name, n, cohort] of [["김하늘", 1, "94"], ["이도윤", 2, "95"], ["박서준", 3, "96"]]) {
    const c = await ctx(phone);
    const answers = [{ fieldId: ids.NAME, text: name }, { fieldId: ids.PHONE, text: `010-4400-${String(n).padStart(4, "0")}` }, { fieldId: ids.COHORT, text: cohort }];
    if (ids.CONSENT) answers.push({ fieldId: ids.CONSENT, value: { value: true } });
    const body = await api(c, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: PIN, answers });
    people[name] = { ctx: c, participantId: body.participantId };
  }
  const g1 = (await api(op, "POST", `${ev}/groups`, { name: "1조" })).group;
  await api(op, "POST", `${ev}/group-assignments`, { changes: Object.values(people).map((p) => ({ participantId: p.participantId, fromGroupId: null, toGroupId: g1.groupId })) });
  const b1 = await api(op, "GET", `${ev}/group-board`);
  await api(op, "PUT", `${ev}/groups/${g1.groupId}/leaders`, { participantIds: [people["김하늘"].participantId], expectedVersion: b1.groups.find((g) => g.groupId === g1.groupId).version });
  const b2 = await api(op, "GET", `${ev}/group-board`);
  await api(op, "POST", `${ev}/groups/publish`, { expectedBoardVersion: b2.boardVersion, confirmUnassigned: true });
  mark("준비(API)", `행사 ${eventId}, 1조 3명, 조장 김하늘, 조 공개`);

  // 조장: 홈 → 내 조 카드 "조원 현황" → 조원 이도윤 누르기
  const leader = await people["김하늘"].ctx.newPage();
  await leader.goto(`${APP}/participate/${eventId}`);
  const statusLink = leader.getByRole("link", { name: /조원 현황/ }).first();
  await statusLink.waitFor({ timeout: 30000 });
  await statusLink.tap();
  await leader.getByRole("list", { name: "우리 조 조원" }).waitFor({ timeout: 20000 });
  await leader.waitForTimeout(500);
  const roster = leader.getByRole("list", { name: "우리 조 조원" });
  const links = await roster.getByRole("link").allInnerTexts();
  mark("조장 조원 현황: '우리 조 조원' 목록의 링크", links.map((t) => t.replace(/\n/g, " ")).join(" | "));
  const absentLinks = await leader.getByRole("list", { name: "미도착 조원" }).getByRole("link").count();
  mark("조장 조원 현황: '미도착 조원' 목록의 링크 수", String(absentLinks));
  const row = roster.getByRole("link", { name: /이도윤/ });
  const style = await row.evaluate((el) => { const s = getComputedStyle(el); const a = getComputedStyle(el, "::after"); return { cursor: s.cursor, after: a.content, afterColor: a.color, height: el.getBoundingClientRect().height }; });
  mark("조원 줄 모양", JSON.stringify(style));
  await row.scrollIntoViewIfNeeded();
  await leader.screenshot({ path: `${OUT}/01-leader-status-before-tap.png`, fullPage: true });
  await row.tap();
  await leader.waitForURL(/\/group\/members\//, { timeout: 10000 });
  await leader.getByText("조원 현황으로").waitFor({ timeout: 15000 });
  await leader.waitForTimeout(800);
  mark("이도윤 누름 → 주소", leader.url().replace(APP, ""));
  mark("조원 상세 내용", (await leader.locator("main").innerText()).replace(/\n/g, " / ").slice(0, 300));
  await leader.screenshot({ path: `${OUT}/02-leader-member-detail-after-tap.png`, fullPage: true });
  await leader.goBack();
  await leader.getByRole("list", { name: "우리 조 조원" }).waitFor({ timeout: 10000 });
  mark("뒤로 → 주소", leader.url().replace(APP, ""));

  // 일반 조원: 같은 조 명단에 누를 수 있는 조원 항목이 없어야 함 (DEC-083)
  const member = await people["이도윤"].ctx.newPage();
  await member.goto(`${APP}/participate/${eventId}/group`);
  await member.getByText("김하늘").first().waitFor({ timeout: 30000 });
  await member.waitForTimeout(800);
  const memberLinks = await member.locator("main a").evaluateAll((as) => as.map((a) => `${a.innerText.replace(/\n/g, " ")} → ${a.getAttribute("href")}`));
  mark("조원 이도윤 내 조 화면의 링크", memberLinks.join(" | ") || "(없음)");
  mark("조원 화면의 members/ 링크 수", String(memberLinks.filter((l) => l.includes("/members/")).length));
  await member.screenshot({ path: `${OUT}/03-member-group-no-links.png`, fullPage: true });
  const direct = await member.request.fetch(`${APP}/api/v1/participant/group/members/${people["김하늘"].participantId}`);
  mark("조원이 조원 상세 API 직접 호출", String(direct.status()));

  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\n");
  await browser.close();
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\nFAILED: " + e.message + "\n"); process.exit(1); });
