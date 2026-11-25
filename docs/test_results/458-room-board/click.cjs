// G3 #458 / A11 #461 click run against the local server (real API, no mock). Usage: SEED=seed200.json node click.cjs <outDir>
const { chromium } = require("playwright");
const fs = require("fs");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const seed = JSON.parse(fs.readFileSync(process.env.SEED || __dirname + "/seed200.json", "utf8"));
const OUT = process.argv[2];
const BASE = "http://localhost:5173";
const E = seed.eventId;
const SPACE = "00000000-0000-4000-8000-000000000010";
const log = [];
const t0 = Date.now();
const mark = (step, extra = "") => {
  const line = `${((Date.now() - t0) / 1000).toFixed(1)}s ${step}${extra ? " — " + extra : ""}`;
  log.push(line);
  console.log(line);
};
const sql = (text) => execFileSync("docker", ["exec", "-i", "scene-pg", "psql", "-At", "-U", "scene", "-d", "scene"], { input: text }).toString().trim();

// Selects the first option whose text matches the pattern (Playwright labels take strings only).
function pickOption(select, source) {
  const option = [...select.options].find((item) => new RegExp(source).test(item.textContent));
  if (!option) throw new Error("no option " + source);
  select.value = option.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

async function idle(page) {
  await page.waitForFunction(() => !document.querySelector(".event-groups__fetching") && ![...document.querySelectorAll("button")].some((b) => b.textContent === "참가자에게 공개" && b.disabled), null, { timeout: 20000 });
}

// Every action first marks the notice on screen as seen; the screen clears it and mounts a new one when done.
async function seen(page) {
  await page.evaluate(() => document.querySelectorAll(".event-groups__notice-slot .event-groups__notice").forEach((el) => el.setAttribute("data-seen", "")));
}
async function notice(page) {
  const fresh = page.locator(".event-groups__notice-slot .event-groups__notice:not([data-seen])").first();
  await fresh.waitFor({ timeout: 20000 });
  const text = (await fresh.textContent()).trim();
  await seen(page);
  return text;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "ko-KR" });
  sql(`DELETE FROM room_assignment_logs WHERE event_id = '${E}'; DELETE FROM room_assignments WHERE event_id = '${E}'; DELETE FROM room_publications WHERE event_id = '${E}'; DELETE FROM rooms WHERE event_id = '${E}'; DELETE FROM room_boards WHERE event_id = '${E}';`);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  await page.goto(BASE + "/login");
  await context.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: BASE }]);
  const login = await page.request.post(BASE + "/api/v1/operator/auth/login", {
    headers: { "X-XSRF-TOKEN": "dev-csrf", "Content-Type": "application/json" },
    data: { userId: "00000000-0000-4000-8000-000000000001" },
  });
  if (!login.ok()) throw new Error("login " + login.status());
  mark("로그인");
  await page.goto(`${BASE}/events/${E}/rooms`);
  await page.getByText(/^배정 \d/).waitFor();
  mark("숙소 화면 열림", await page.locator(".event-groups__chip").textContent());
  await shot(page, "01-desktop-empty");

  // Rooms: 301–316 남, 401–416 여, 정원 6 (번호로 여러 개).
  const T_rooms = Date.now();
  await page.getByRole("button", { name: "+ 방 추가" }).click();
  await page.getByRole("radio", { name: "번호로 여러 개" }).check();
  const many = page.getByRole("form", { name: "번호로 여러 방 만들기" });
  for (const [from, to, gender, note] of [["301", "316", "남", "본관 3층"], ["401", "416", "여", "본관 4층"]]) {
    await many.getByLabel("시작 번호").fill(from);
    await many.getByLabel("끝 번호").fill(to);
    await many.getByLabel("정원").fill("6");
    await many.getByLabel("성별 구분").selectOption({ label: gender });
    await many.getByLabel(/위치 메모/).fill(note);
    await many.getByRole("button", { name: /개 만들기$/ }).click();
    mark(`방 ${from}~${to}`, await notice(page));
    await idle(page);
  }
  mark("방 32개 만들기", `${((Date.now() - T_rooms) / 1000).toFixed(1)}s`);
  await page.getByRole("button", { name: "닫기" }).click();
  await shot(page, "02-desktop-rooms");

  // 조 단위 일괄 배정: 1조(남) → 301호, 2조(여) → 401호.
  const batch = page.getByRole("region", { name: "조 단위로 넣기" });
  for (const [group, room] of [["1조", "301호"], ["2조", "401호"]]) {
    const selects = batch.locator("select");
    const n = await selects.count();
    await selects.nth(n - 2).evaluate(pickOption, new RegExp(`^${group} `).source);
    await selects.nth(n - 1).evaluate(pickOption, new RegExp(`^${room} `).source);
    const note = await batch.locator(".event-rooms__not-lodging-note").allTextContents();
    await batch.getByRole("button", { name: /명 넣기$/ }).click();
    mark(`조 단위 ${group}→${room}`, (await notice(page)) + (note.length ? ` [${note.join(" / ")}]` : ""));
    await idle(page);
  }
  await shot(page, "03-desktop-group-batch");

  // Drag and drop: the over-capacity 301호 gives two people to 302호 (mouse, anywhere on the row).
  for (let k = 0; k < 2; k += 1) {
    await page.getByRole("article", { name: "301호" }).scrollIntoViewIfNeeded();
    const row = page.getByRole("article", { name: "301호" }).locator(".event-rooms__member").last();
    const dragged = (await row.locator(".event-groups__name").textContent()).trim();
    const from = await row.boundingBox();
    const to = await page.getByRole("article", { name: "302호" }).boundingBox();
    await page.mouse.move(from.x + from.width - 12, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width - 30, from.y + from.height / 2 + 20, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
    if (k === 0) await shot(page, "03b-desktop-dragging");
    await page.mouse.up();
    mark(`끌어 놓기 ${dragged} 301호→302호`, await notice(page));
    await idle(page);
  }

  // Filter and send: by gender, six at a time into the rooms of that gender.
  const T_fill = Date.now();
  let sends = 0;
  for (const [genderLabel, prefix] of [["남", "3"], ["여", "4"]]) {
    await page.getByRole("group", { name: "참가자 거르기" }).locator("label", { hasText: /^성별/ }).locator("select").evaluate(pickOption, new RegExp(`^${genderLabel} `).source);
    for (let n = 1; n <= 16; n += 1) {
      const room = `${prefix}${String(n).padStart(2, "0")}호`;
      const card = page.getByRole("article", { name: room });
      const size = (await card.locator(".event-groups__card-size").textContent()).trim();
      const [have, cap] = size.replace("명", "").split("/").map(Number);
      const want = cap - have;
      if (want <= 0) continue;
      const boxes = page.locator(".event-groups__people input[type=checkbox]");
      const available = await boxes.count();
      if (available === 0) break;
      for (let i = 0; i < Math.min(want, available); i += 1) await boxes.nth(i).check();
      await page.getByLabel("보낼 방").evaluate(pickOption, new RegExp(`^${room} `).source);
      await page.getByRole("region", { name: "고른 사람 옮기기" }).getByRole("button", { name: "보내기" }).click();
      await notice(page);
      await idle(page);
      sends += 1;
    }
  }
  mark("성별로 걸러 6명씩 보내기", `${sends}번, ${((Date.now() - T_fill) / 1000).toFixed(1)}s`);
  // Whoever is left (성별 응답 없음) goes to a 구분 없음 room.
  await page.getByRole("group", { name: "참가자 거르기" }).getByRole("button", { name: "초기화" }).click();
  const left = await page.locator(".event-groups__people input[type=checkbox]").count();
  mark("남은 미배정", `${left}명`);
  if (left > 0) {
    await page.getByRole("button", { name: "+ 방 추가" }).click();
    await page.getByRole("radio", { name: "한 개" }).check();
    const one = page.getByRole("form", { name: "방 만들기" });
    await one.getByLabel("방 이름").fill("501호");
    await one.getByLabel("정원").fill("10");
    await one.getByLabel(/위치 메모/).fill("별관 1층");
    await one.getByRole("button", { name: "방 만들기" }).click();
    mark("방 501호", await notice(page));
    await idle(page);
    await page.getByRole("button", { name: "닫기" }).click();
    await page.getByRole("checkbox", { name: "보이는 사람 모두 고르기" }).check();
    await page.getByLabel("보낼 방").evaluate(pickOption, /^501호 /.source);
    await page.getByRole("region", { name: "고른 사람 옮기기" }).getByRole("button", { name: "보내기" }).click();
    mark("남은 사람→501호", await notice(page));
    await idle(page);
  }
  mark("배정 끝", await page.locator(".event-groups__chip").textContent());
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "04-desktop-filled");
  // 숙박 안 함 is not offered.
  await page.getByRole("group", { name: "참가자 거르기" }).locator("label", { hasText: /^숙박/ }).locator("select").evaluate(pickOption, /^숙박 안 함/.source);
  await page.getByRole("group", { name: "참가자 거르기" }).locator("label", { hasText: /^배정 상태/ }).locator("select").selectOption("all");
  await page.locator(".event-groups__pool").scrollIntoViewIfNeeded();
  await shot(page, "05-desktop-not-lodging-list");
  mark("숙박 안 함 명단", `${await page.locator(".event-rooms__pool-card--blocked").count()}명 고를 수 없음`);
  await page.getByRole("group", { name: "참가자 거르기" }).getByRole("button", { name: "초기화" }).click();

  // A11: two assigned people edit their application through the real participant path (A4).
  const board = await (await page.request.get(`${BASE}/api/v1/operator/events/${E}/room-board`)).json();
  const placed = board.participants.filter((p) => p.roomId && p.lodging === "LODGING");
  const edits = [
    { who: placed[0], answers: (a) => a.map((x) => (x.fieldId === seed.fields.ATTENDANCE ? x : x)).concat([{ fieldId: seed.fields.NO_LODGING, value: { optionIds: ["opt_no_lodging"] } }]) },
    { who: placed[1], answers: (a) => a.map((x) => (x.fieldId === seed.fields.ATTENDANCE ? { fieldId: x.fieldId, value: { optionId: "opt_partial" } } : x)).concat([{ fieldId: seed.fields.LODGING, value: { optionIds: ["opt_n2"] } }]) },
  ];
  for (const edit of edits) {
    const token = crypto.randomBytes(16).toString("hex") + "0".repeat(32);
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    sql(`INSERT INTO participant_sessions (id, space_id, event_id, participant_id, token_hash, created_at) VALUES ('${crypto.randomUUID()}', '${SPACE}', '${E}', '${edit.who.participantId}', '${hash}', now());`);
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: "SCENE_PSESSION", value: token, url: BASE }, { name: "XSRF-TOKEN", value: "dev-csrf", url: BASE }]);
    const current = await (await ctx.request.get(`${BASE}/api/v1/participant/application`)).json();
    const put = await ctx.request.put(`${BASE}/api/v1/participant/application`, {
      headers: { "X-XSRF-TOKEN": "dev-csrf", "Content-Type": "application/json" },
      data: { expectedRevision: current.revision, answers: edit.answers(current.answers) },
    });
    mark(`A4 신청 수정 ${edit.who.name}`, `${put.status()} revision ${current.revision}→${put.ok() ? (await put.json()).revision : "?"}`);
    await ctx.close();
  }
  await page.reload();
  await page.getByRole("region", { name: /다시 볼 것/ }).waitFor();
  mark("다시 볼 것", (await page.getByRole("region", { name: /다시 볼 것/ }).locator(".event-rooms__review-row").allTextContents()).join(" | "));
  await page.getByRole("region", { name: /다시 볼 것/ }).scrollIntoViewIfNeeded();
  await shot(page, "06-desktop-review");
  await page.getByRole("button", { name: new RegExp(`${edits[1].who.name} 확인$`) }).click();
  mark("확인(자는 밤 바뀜)", await notice(page));
  await idle(page);

  // Publish: 미배정 0, the person who dropped lodging stays in the room → confirmNotLodging.
  await page.evaluate(() => window.scrollTo(0, 0));
  const T_pub = Date.now();
  await page.getByRole("button", { name: "참가자에게 공개" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "공개" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "확인하고 공개" }).waitFor();
  mark("공개 확인 요청", (await page.locator("#confirm-dialog-title").textContent()).trim());
  await shot(page, "07-desktop-publish-confirm");
  await page.getByRole("dialog").getByRole("button", { name: "확인하고 공개" }).click();
  mark("공개", (await notice(page)) + ` (${((Date.now() - T_pub) / 1000).toFixed(1)}s)`);
  await idle(page);
  await page.locator("#rooms-scope-title").scrollIntoViewIfNeeded();
  await page.getByRole("radio", { name: "같은 방 사람까지" }).click();
  await page.getByText(/보도록 바꿨어요/).waitFor();
  mark("공개 범위", (await page.getByText(/보도록 바꿨어요/).textContent()).trim());
  await shot(page, "08-desktop-scope");
  await page.getByRole("radio", { name: /전체 방 배정표까지/ }).click();
  await page.getByText(/전체 방 배정표까지 보도록 바꿨어요/).waitFor();

  const published = await (await page.request.get(`${BASE}/api/v1/operator/events/${E}/rooms/published`)).json();
  mark("공개본", `방 ${published.rooms.length}개, 사람 ${published.rooms.reduce((s, r) => s + r.members.length, 0)}명, 미배정 ${published.unassigned.length}명`);
  mark("총 걸린 시간", `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (errors.length) mark("콘솔 오류", errors.join(" | "));
  fs.writeFileSync(`${OUT}/desktop-run.log`, log.join("\n") + "\n");
  await browser.close();
})().catch((error) => {
  console.error(error);
  fs.writeFileSync(`${OUT}/desktop-run.log`, log.join("\n") + "\nFAILED: " + error.message + "\n");
  process.exit(1);
});
