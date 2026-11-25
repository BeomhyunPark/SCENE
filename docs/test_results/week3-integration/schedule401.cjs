// 범위 밖 버그 후보 재현: 시작·끝 날짜가 없는 행사에서 GET /participant/schedule. Usage: node schedule401.cjs
const { chromium } = require("playwright");
const APP = "http://localhost:5173";
const H = { "X-XSRF-TOKEN": "dev-csrf" };
(async () => {
  const browser = await chromium.launch();
  const mk = async () => { const c = await browser.newContext(); await c.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]); return c; };
  const call = async (c, m, p, d) => { const r = await c.request.fetch(APP + p, { method: m, headers: H, data: d }); const t = await r.text(); return { status: r.status(), body: t ? JSON.parse(t) : null }; };
  const op = await mk();
  await call(op, "POST", "/api/v1/operator/auth/login", { userId: "00000000-0000-4000-8000-000000000001" });
  const spaces = (await call(op, "GET", "/api/v1/operator/spaces")).body;
  const spaceId = (spaces.items ?? spaces)[0].spaceId;
  const { eventId } = (await call(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "날짜 없는 행사", eventType: "RETREAT" })).body;
  const ev = `/api/v1/operator/events/${eventId}`;
  const { formId } = (await call(op, "POST", `${ev}/forms`, {})).body;
  const lc = (await call(op, "GET", ev)).body;
  console.log("activate", (await call(op, "POST", `${ev}/activate`, { expectedLifecycleVersion: lc.lifecycleVersion })).status);
  await call(op, "PATCH", `${ev}/forms/${formId}`, { acceptingApplications: true });
  const ids = {};
  for (const f of (await call(op, "GET", `${ev}/forms/${formId}`)).body.fields) { const k = f.presetKey ?? f.systemKey; if (k) ids[k] = f.fieldId; }
  const p = await mk();
  const answers = [{ fieldId: ids.NAME, text: "날짜없음" }, { fieldId: ids.PHONE, text: "010-4010-0001" }];
  if (ids.COHORT) answers.push({ fieldId: ids.COHORT, text: "94" });
  if (ids.CONSENT) answers.push({ fieldId: ids.CONSENT, value: { value: true } });
  console.log("apply", (await call(p, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: "730914", answers })).status);
  console.log("home", (await call(p, "GET", `/api/v1/participant/home?eventId=${eventId}`)).status);
  const s = await call(p, "GET", `/api/v1/participant/schedule?eventId=${eventId}`);
  console.log("schedule", s.status, JSON.stringify(s.body).slice(0, 300));
  await browser.close();
})();
