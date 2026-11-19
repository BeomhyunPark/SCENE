const { chromium } = require("playwright");
const OUT = process.argv[2];
const BASE = "http://localhost:5173";
const SPACE = "00000000-0000-4000-8000-000000000010";
const OWNER = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000003";

async function api(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const xsrf = document.cookie.split("; ").find((c) => c.startsWith("XSRF-TOKEN="))?.split("=")[1];
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json", ...(xsrf ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf) } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "include",
      });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
    { method, path, body },
  );
}

async function ok(page, method, path, body) {
  let r = await api(page, method, path, body);
  if (r.status === 403 && r.body?.code === "FORBIDDEN" && !r.retried) {
    r = await api(page, method, path, body); // first call may only set the CSRF cookie
  }
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

async function loginAs(page, userId) {
  await page.goto(BASE + "/");
  await api(page, "GET", "/api/v1/operator/me");
  await api(page, "POST", "/api/v1/operator/auth/logout");
  await ok(page, "POST", "/api/v1/operator/auth/login", { userId });
}

(async () => {
  const browser = await chromium.launch();
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await desktop.newPage();
  await loginAs(page, OWNER);

  const event = await ok(page, "POST", `/api/v1/operator/spaces/${SPACE}/events`, {
    name: `권한 확인 ${Date.now() % 100000}`, startDate: "2027-01-15", endDate: "2027-01-17", place: "양평", eventType: "RETREAT",
  });
  const eventId = event.eventId;
  await ok(page, "POST", `/api/v1/operator/events/${eventId}/activate`, { expectedLifecycleVersion: event.lifecycleVersion ?? 0 });
  const form = await ok(page, "POST", `/api/v1/operator/events/${eventId}/forms`, {});
  await ok(page, "PATCH", `/api/v1/operator/events/${eventId}/forms/${form.formId}`, { acceptingApplications: true });
  const pub = await ok(page, "GET", `/api/v1/public/events/${eventId}/forms/${form.formId}`);
  const people = [["김하늘", "010-1111-2222", "94"], ["이바다", "010-3333-4444", "96"], ["박산", "010-5555-6666", "98"]];
  for (const [name, phone, cohort] of people) {
    const answers = pub.fields.map((f) => ({
      fieldId: f.fieldId,
      text: f.systemKey === "PHONE" || f.presetKey === "PHONE" || f.label === "전화" ? phone : f.label === "이름" ? name : cohort,
    }));
    await ok(page, "POST", `/api/v1/public/events/${eventId}/forms/${form.formId}/applications`, { answers });
  }
  await ok(page, "POST", `/api/v1/operator/events/${eventId}/operators`, { userId: STAFF, role: "STAFF" });
  console.log("event", eventId);

  // 1. STAFF before the grant: read-only board.
  await loginAs(page, STAFF);
  await page.goto(`${BASE}/events/${eventId}/groups`);
  await page.getByText("조 편성을 볼 권한이 없어요").waitFor();
  const denied = await api(page, "GET", `/api/v1/operator/events/${eventId}/group-board`);
  console.log("staff before grant: board", denied.status, denied.body?.code);
  await page.screenshot({ path: `${OUT}/permissions-1-staff-before-grant.png`, fullPage: true });

  // 2. OWNER grants 조 편성 on the operators screen.
  await loginAs(page, OWNER);
  await page.goto(`${BASE}/events/${eventId}/operators`);
  const region = page.getByRole("region", { name: "운영자" });
  await region.getByText("역할 기본 권한").first().waitFor();
  await page.screenshot({ path: `${OUT}/permissions-2-owner-operators.png`, fullPage: true });
  await region.getByRole("button", { name: "Local staff 권한" }).click();
  const dialog = page.getByRole("dialog", { name: "Local staff님의 권한" });
  await dialog.getByRole("checkbox", { name: "조 편성" }).waitFor();
  await page.screenshot({ path: `${OUT}/permissions-3-dialog-defaults.png` });
  await dialog.getByRole("checkbox", { name: "조 편성" }).check();
  await page.screenshot({ path: `${OUT}/permissions-4-dialog-group-on.png` });
  await dialog.getByRole("button", { name: "저장" }).click();
  await region.getByRole("status").filter({ hasText: "권한을 저장했어요" }).waitFor();
  await region.getByText("개별 권한 1개 더함").waitFor();
  await page.screenshot({ path: `${OUT}/permissions-5-owner-saved.png`, fullPage: true });
  const perms = await ok(page, "GET", `/api/v1/operator/events/${eventId}/operators/${STAFF}/permissions`);
  console.log("server permissions after save:", JSON.stringify(perms));

  // 3. STAFF edits the board: add a group and move 김하늘 into it.
  await loginAs(page, STAFF);
  await page.goto(`${BASE}/events/${eventId}/groups`);
  await page.getByRole("button", { name: "+ 조 추가" }).waitFor();
  await page.locator("#groups-new-name").fill("1조");
  await page.getByRole("button", { name: "+ 조 추가" }).click();
  await page.getByRole("list", { name: "1조 조원" }).or(page.getByText("1조").first()).first().waitFor();
  await page.getByRole("checkbox", { name: /김하늘.*고르기/ }).first().check();
  await page.locator("#groups-target").selectOption({ label: "1조" });
  await page.getByRole("region", { name: "고른 사람 옮기기" }).getByRole("button", { name: "보내기" }).click();
  await page.getByRole("list", { name: "1조 조원" }).getByText("김하늘").waitFor();
  await page.screenshot({ path: `${OUT}/permissions-6-staff-edited-board.png`, fullPage: true });
  const board = await ok(page, "GET", `/api/v1/operator/events/${eventId}/group-board`);
  const moved = board.participants.find((p) => p.name === "김하늘");
  console.log("server board: groups", board.groups.map((g) => g.name), "김하늘 groupId set:", Boolean(moved?.groupId), "boardVersion", board.boardVersion);

  // 4. Phone width: the owner's dialog.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mobile = await phone.newPage();
  await loginAs(mobile, OWNER);
  await mobile.goto(`${BASE}/events/${eventId}/operators`);
  const mRegion = mobile.getByRole("region", { name: "운영자" });
  await mRegion.getByText("개별 권한 1개 더함").waitFor();
  await mobile.screenshot({ path: `${OUT}/permissions-7-phone-operators.png`, fullPage: true });
  await mRegion.getByRole("button", { name: "Local staff 권한" }).click();
  const mDialog = mobile.getByRole("dialog", { name: "Local staff님의 권한" });
  await mDialog.getByRole("checkbox", { name: "조 편성" }).waitFor();
  await mobile.screenshot({ path: `${OUT}/permissions-8-phone-dialog.png` });
  const footerVisible = await mDialog.getByRole("button", { name: "저장" }).isVisible();
  const scrollW = await mobile.evaluate(() => document.documentElement.scrollWidth);
  console.log("phone: save visible", footerVisible, "page scrollWidth", scrollW);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
