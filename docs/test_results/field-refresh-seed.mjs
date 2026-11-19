// Seeds an ACTIVE event with N applicants through the real API (local profile).
const BASE = "http://localhost:8080";
const SPACE = "00000000-0000-4000-8000-000000000010";
const OWNER = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000003";
const N = Number(process.argv[2] ?? 120);
let cookie = "XSRF-TOKEN=dev-csrf";
async function call(method, path, body, keep = true) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (keep && set) {
    const m = set.match(/SCENE_SESSION=[^;]+/);
    if (m) cookie = `XSRF-TOKEN=dev-csrf; ${m[0]}`;
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
await call("POST", "/api/v1/operator/auth/login", { userId: OWNER });
const event = await call("POST", `/api/v1/operator/spaces/${SPACE}/events`, { name: "E1 갱신 확인 수련회", eventType: "RETREAT" });
const eventId = event.eventId;
await call("POST", `/api/v1/operator/events/${eventId}/operators`, { userId: STAFF, role: "STAFF" });
const form = await call("POST", `/api/v1/operator/events/${eventId}/forms`);
await call("POST", `/api/v1/operator/events/${eventId}/activate`, { expectedLifecycleVersion: event.lifecycleVersion ?? 0 });
await call("PATCH", `/api/v1/operator/events/${eventId}/forms/${form.formId}`, { acceptingApplications: true });
const field = (key) => form.fields.find((f) => f.systemKey === key).fieldId;
const family = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"];
const given = ["하늘", "서준", "수아", "예린", "민준", "지우", "도윤", "하은", "시우", "서연", "주원", "지아"];
for (let i = 0; i < N; i += 1) {
  const name = family[i % 10] + given[Math.floor(i / 10) % 12] + (i >= 120 ? String(i) : "");
  const phone = `010-${String(1000 + i).padStart(4, "0")}-${String(2000 + i).padStart(4, "0")}`;
  await call("POST", `/api/v1/public/events/${eventId}/forms/${form.formId}/applications`, {
    answers: [
      { fieldId: field("NAME"), text: name },
      { fieldId: field("PHONE"), text: phone },
      { fieldId: field("COHORT"), text: String(90 + (i % 10)) },
    ],
  }, false);
}
console.log(JSON.stringify({ eventId, n: N }));
