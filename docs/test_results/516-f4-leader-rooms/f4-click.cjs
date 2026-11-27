// F4 (#516) real click: after groups and rooms are published (real API), the leader's phone (390) shows
// each member's room on 조원 현황 and the room with its location note on a member's detail.
// Usage: node f4-click.cjs <outDir>
const fs = require("fs");
const { setup, overflow, APP } = require("../517-i5-event-menu/week4-setup.cjs");
const OUT = process.argv[2];
const log = [];
const mark = (line) => { log.push(line); console.log(line); };

(async () => {
  const s = await setup("F4 조장 숙소 확인");
  mark("준비: 신청 5명, 1조(김조장·박조원·이조원, 조장 김조장)·2조 공개, 301호(김조장·박조원)·302호(이조원 외) 공개");
  const page = await s.lead.ctx.newPage();
  await page.goto(`${APP}/participate/${s.eventId}/group`);
  const list = page.getByRole("list", { name: "우리 조 조원" });
  await list.waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  const rows = (await list.innerText()).split("\n").filter(Boolean);
  mark(`조장 조원 현황 목록: ${rows.join(" | ")}`);
  mark(`가로 넘침 ${await overflow(page)}`);
  await page.screenshot({ path: `${OUT}/01-leader-members-390.png`, fullPage: true });
  await list.getByRole("link").filter({ hasText: "이조원" }).click();
  await page.getByText("302호 · 본관 3층 끝").waitFor({ timeout: 30000 });
  mark("조원 상세(이조원): \"302호 · 본관 3층 끝\"");
  await page.screenshot({ path: `${OUT}/02-member-detail-room-390.png`, fullPage: true });

  // A room move is not shown until it is published again (same rule as the participant 숙소 screen).
  const board = await s.api(s.op, "GET", `${s.ev}/room-board`);
  const r301 = board.rooms.find((r) => r.name === "301호").roomId;
  const r302 = board.rooms.find((r) => r.name === "302호").roomId;
  await s.api(s.op, "POST", `${s.ev}/room-assignments`, { changes: [{ participantId: s.mate2.participantId, fromRoomId: r302, toRoomId: r301 }] });
  const before = (await s.api(s.lead.ctx, "GET", "/api/v1/participant/group")).leaderView.members.find((m) => m.name === "이조원").room;
  mark(`작업본에서 이조원을 301호로 옮긴 뒤(공개 전) 조장 응답의 방: ${before.name}`);
  const again = await s.api(s.op, "GET", `${s.ev}/room-board`);
  await s.api(s.op, "POST", `${s.ev}/rooms/publish`, { expectedBoardVersion: again.boardVersion, confirmUnassigned: true });
  await page.goto(`${APP}/participate/${s.eventId}/group`);
  await list.waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  mark(`다시 공개한 뒤 조장 목록: ${(await list.innerText()).split("\n").filter(Boolean).join(" | ")}`);

  const member = await s.mate1.ctx.newPage();
  await member.goto(`${APP}/participate/${s.eventId}/group`);
  await member.getByRole("region", { name: "내 조" }).waitFor({ timeout: 30000 });
  mark(`조원(박조원) 화면의 "방 " 글자: ${await member.getByText(/^방 /).count()}개, 조원 현황 영역 ${await member.getByRole("region", { name: "조원 현황" }).count()}개`);
  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\n");
  await s.browser.close();
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\nFAILED: " + e + "\n"); process.exit(1); });
