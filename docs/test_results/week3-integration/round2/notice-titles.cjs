// 사용자 결정(DEC-088 결정 대기 6) 뒤 신청 수정 알림 문구를 실제 서버에서 확인한다. 시드 행사(OWNER·MANAGER)를 쓴다.
// 참가자가 고침 → 운영자 알림, 운영자(OWNER)가 고침 → 참가자 알림·다른 운영자(MANAGER) 알림. Usage: node notice-titles.cjs
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const APP = "http://localhost:5173";
const E = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const MANAGER = "00000000-0000-4000-8000-000000000002";
const H = { "X-XSRF-TOKEN": "dev-csrf" };
(async () => {
  const b = await chromium.launch();
  const mk = async () => { const c = await b.newContext(); await c.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]); return c; };
  const call = async (c, m, p, d) => { const r = await c.request.fetch(APP + p, { method: m, headers: H, data: d }); const t = await r.text(); if (r.status() >= 300) throw new Error(`${m} ${p} ${r.status()} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null; };
  execFileSync("docker", ["exec", "scene-local-postgres-1", "psql", "-U", "scene", "-d", "scene", "-c", `UPDATE events SET start_date='2027-01-22', end_date='2027-01-24' WHERE id='${E}'`]);
  const op = await mk(); await call(op, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
  const mg = await mk(); await call(mg, "POST", "/api/v1/operator/auth/login", { userId: MANAGER });
  const ev = `/api/v1/operator/events/${E}`;
  const { formId } = await call(op, "POST", `${ev}/forms`, {});
  const d = await call(op, "GET", ev);
  await call(op, "POST", `${ev}/activate`, { expectedLifecycleVersion: d.lifecycleVersion });
  await call(op, "PATCH", `${ev}/forms/${formId}`, { acceptingApplications: true, acceptingEdits: true });
  const ids = {}; for (const f of (await call(op, "GET", `${ev}/forms/${formId}`)).fields) { const k = f.presetKey ?? f.systemKey; if (k) ids[k] = f.fieldId; }
  const p = await mk();
  const base = (name, cohort) => { const a = [{ fieldId: ids.NAME, text: name }, { fieldId: ids.PHONE, text: "010-4888-0001" }]; if (ids.COHORT) a.push({ fieldId: ids.COHORT, text: cohort }); if (ids.CONSENT) a.push({ fieldId: ids.CONSENT, value: { value: true } }); return a; };
  const applied = await call(p, "POST", `/api/v1/public/events/${E}/forms/${formId}/applications`, { pin: "730914", answers: base("김가람", "94") });
  // 1) 참가자가 고침
  const mine = await call(p, "GET", "/api/v1/participant/application");
  await call(p, "PUT", "/api/v1/participant/application", { expectedRevision: mine.revision, answers: base("김가람", "95") });
  const n1 = await call(op, "GET", `${ev}/notifications`);
  console.log("운영자(OWNER) 알림, 참가자가 고침:", n1.items.map((i) => `${i.kind} "${i.title}" · ${i.body ?? ""}`).join(" | "));
  // 2) OWNER가 고침
  const now = await call(p, "GET", "/api/v1/participant/application");
  await call(op, "PUT", `${ev}/applications/${now.applicationId}/answers`, { expectedRevision: now.revision, answers: base("김가람", "96") });
  const pn = await call(p, "GET", "/api/v1/participant/notifications");
  console.log("참가자 알림:", pn.items.map((i) => `${i.kind} "${i.title}" · ${i.body ?? ""}`).join(" | "));
  const mn = await call(mg, "GET", `${ev}/notifications`);
  console.log("다른 운영자(MANAGER) 알림:", mn.items.map((i) => `${i.kind} "${i.title}" · ${i.body ?? ""} ×${i.count}`).join(" | "));
  const on = await call(op, "GET", `${ev}/notifications`);
  console.log("고친 운영자(OWNER) 알림:", on.items.map((i) => `${i.kind} "${i.title}" ×${i.count}`).join(" | "));
  // 3) 운영자 화면에서 "신청 고치기" 안내 줄
  const page = await op.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const cur = await call(p, "GET", "/api/v1/participant/application");
  await page.goto(`${APP}/events/${E}/participants/${cur.applicationId}`);
  await page.getByRole("link", { name: "신청 고치기" }).click();
  await page.getByText("참가자가 직접 고칠 수 있으면 참가자에게 맡겨 주세요.").waitFor();
  await page.screenshot({ path: `${__dirname}/12-edit-screen-hint.png` });
  console.log("신청 고치기 화면 안내 줄: 보임");
  // 4) 운영자 알림 화면
  const np = await mg.newPage();
  await np.setViewportSize({ width: 1440, height: 900 });
  await np.goto(`${APP}/events/${E}/notifications`);
  await np.getByText(/신청 내역을 수정했어요/).first().waitFor();
  await np.screenshot({ path: `${__dirname}/13-manager-notifications.png` });
  console.log("MANAGER 알림 화면:", (await np.getByText(/신청 내역을 수정했어요/).allInnerTexts()).join(" | "));
  await applied;
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
