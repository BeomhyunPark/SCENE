// D5 (#515) real click: write and publish a notice in the operator screen, then 공유 문구 복사, and read
// the clipboard. Desktop 1440 and phone 390. Usage: node d5-click.cjs <outDir>
const fs = require("fs");
const { setup, overflow, APP } = require("../517-i5-event-menu/week4-setup.cjs");
const OUT = process.argv[2];
const log = [];
const mark = (line) => { log.push(line); console.log(line); };

(async () => {
  const s = await setup("D5 공유 문구 확인");
  const clip = { permissions: ["clipboard-read", "clipboard-write"] };
  for (const [label, options, tag] of [["1440", s.desktop, "01-desktop"], ["390", s.phone, "02-phone"]]) {
    const ctx = await s.operator(options, clip);
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP });
    const page = await ctx.newPage();
    await page.goto(`${APP}/events/${s.eventId}/notices/new`);
    await page.getByLabel("제목").waitFor({ timeout: 30000 });
    await page.getByLabel("제목").fill(`집회 장소 변경 (${label})`);
    await page.getByLabel("내용").fill("오늘 저녁 집회는 대강당에서 해요.\n7시 50분까지 와 주세요.");
    await page.getByRole("button", { name: "발행" }).click();
    await page.getByRole("status").filter({ hasText: "발행했어요" }).waitFor({ timeout: 30000 });
    mark(`${label}: 발행 → 상세 "${(await page.getByRole("status").first().innerText()).trim()}"`);
    await page.getByRole("button", { name: "공유 문구 복사" }).click();
    await page.getByRole("status").filter({ hasText: "공유 문구를 복사했어요." }).waitFor({ timeout: 10000 });
    const text = await page.evaluate(() => navigator.clipboard.readText());
    mark(`${label}: 클립보드 =\n${text}\n---`);
    mark(`${label}: 참가자 주소 포함 ${text.endsWith(`/participate/${s.eventId}`)}`);
    mark(`${label}: 가로 넘침 ${await overflow(page)}`);
    await page.screenshot({ path: `${OUT}/${tag}-published-copied.png`, fullPage: true });
    await ctx.close();
  }
  // A staff notice and a draft have no share button.
  const staff = await s.api(s.op, "POST", `${s.ev}/notices`, { title: "운영진 모임", body: "9시 소강당", audience: [{ type: "STAFF" }], pinned: false, important: false, publish: true });
  const draft = await s.api(s.op, "POST", `${s.ev}/notices`, { title: "초안", body: "아직", audience: [{ type: "ALL" }], pinned: false, important: false, publish: false });
  const page = await s.op.newPage();
  for (const [what, created] of [["운영진 공지", staff], ["초안", draft]]) {
    await page.goto(`${APP}/events/${s.eventId}/notices/${created.notice.noticeId}`);
    await page.getByRole("button", { name: "고치기" }).waitFor({ timeout: 30000 });
    mark(`${what}: 공유 문구 복사 버튼 ${await page.getByRole("button", { name: "공유 문구 복사" }).count()}개`);
  }
  await page.goto(`${APP}/events/${s.eventId}/notices/${staff.notice.noticeId}`);
  await page.getByRole("button", { name: "고치기" }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${OUT}/03-staff-notice-no-share.png`, fullPage: true });
  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\n");
  await s.browser.close();
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\nFAILED: " + e + "\n"); process.exit(1); });
