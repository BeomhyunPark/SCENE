// DEC-079 Follow-up 2026-11-20 (#429): real clicks on the local server (VITE_API_MOCK=0).
// MANAGER edits the group board, sees phone numbers and downloads the CSV without any personal
// GRANT, and cannot end the event or manage operators. STAFF still only checks in.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/user/SCENE/docs/test_results/';
const BASE = 'http://localhost:5173';
const OWNER = '00000000-0000-4000-8000-000000000001';
const MANAGER = '00000000-0000-4000-8000-000000000002';
const STAFF = '00000000-0000-4000-8000-000000000003';
const SPACE = '00000000-0000-4000-8000-000000000010';
const log = (...a) => console.log(...a);

async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body }) => {
    let token = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))?.split('=')[1];
    if (!token) { token = crypto.randomUUID(); document.cookie = `XSRF-TOKEN=${token}; Path=/; SameSite=Lax`; }
    const r = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(token) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: r.status, body: parsed };
  }, { method, url, body });
}

async function as(browser, userId) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  const r = await api(page, 'POST', '/api/v1/operator/auth/login', { userId });
  log('login', userId.slice(-1), r.status);
  return page;
}

(async () => {
  const browser = await chromium.launch();
  const owner = await as(browser, OWNER);
  let r = await api(owner, 'POST', `/api/v1/operator/spaces/${SPACE}/events`, { name: 'I2 MANAGER 기본 권한 확인 수련회', startDate: '2027-01-22', endDate: '2027-01-24' });
  const eventId = r.body.eventId; log('event', r.status, eventId);
  for (const [userId, role] of [[MANAGER, 'MANAGER'], [STAFF, 'STAFF']]) {
    r = await api(owner, 'POST', `/api/v1/operator/events/${eventId}/operators`, { userId, role });
    log('add', role, r.status);
  }
  r = await api(owner, 'POST', `/api/v1/operator/events/${eventId}/activate`, { expectedLifecycleVersion: 0 }); log('activate', r.status);
  r = await api(owner, 'POST', `/api/v1/operator/events/${eventId}/forms`, {}); const formId = r.body.formId; log('form', r.status);
  r = await api(owner, 'PATCH', `/api/v1/operator/events/${eventId}/forms/${formId}`, { acceptingApplications: true }); log('open', r.status);
  r = await api(owner, 'GET', `/api/v1/operator/events/${eventId}/forms/${formId}`);
  const fields = r.body.fields;
  const byKey = (k) => fields.find((f) => f.systemKey === k || f.key === k)?.fieldId;
  log('fields', fields.map((f) => `${f.systemKey ?? f.key}:${f.answerType}:${f.required}`).join(' '));
  const people = [['김하나', '010-3101-2201', '94'], ['이두리', '010-3101-2202', '96'], ['박세나', '010-3101-2203', '98']];
  const pins = ['481937', '592048', '603159'];
  for (let i = 0; i < people.length; i++) {
    const [name, phone, cohort] = people[i];
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(BASE + '/');
    const answers = [{ fieldId: byKey('NAME'), text: name }, { fieldId: byKey('PHONE'), text: phone }];
    if (byKey('COHORT')) answers.push({ fieldId: byKey('COHORT'), text: cohort });
    r = await api(p, 'POST', `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { answers, pin: pins[i] });
    log('apply', name, r.status, r.status >= 300 ? JSON.stringify(r.body) : '');
    await ctx.close();
  }
  r = await api(owner, 'POST', `/api/v1/operator/events/${eventId}/groups`, { name: '1조' }); log('group', r.status);
  const ev = `${BASE}/events/${eventId}`;
  const shot = (page, name) => page.screenshot({ path: OUT + name, fullPage: true });

  // MANAGER, no personal override.
  const manager = await as(browser, MANAGER);
  r = await api(manager, 'GET', `/api/v1/operator/events/${eventId}/operators/${MANAGER}/permissions`);
  log('manager overrides', JSON.stringify(r.body.overrides), 'effective has GROUP/CONTACT/EXPORT/WRITE', ['GROUP_WRITE', 'PARTICIPANT_CONTACT_READ', 'DATA_EXPORT', 'PARTICIPANT_WRITE'].every((k) => r.body.effective.includes(k)), 'no owner-only', !r.body.effective.includes('EVENT_LIFECYCLE') && !r.body.effective.includes('EVENT_USER_MANAGE'));

  // 1. Group board: pick a person and send them to 1조.
  await manager.goto(`${ev}/groups`);
  await manager.getByLabel('94 김하나 고르기').check();
  await manager.getByRole('button', { name: '고른 1명 이 조로 보내기' }).first().click();
  await manager.getByText('배정 1 · 미배정 2').waitFor();
  await shot(manager, 'i2-manager-1-groups-assigned.png');
  r = await api(manager, 'GET', `/api/v1/operator/events/${eventId}/group-board`);
  log('board assigned', JSON.stringify(r.body.participants.filter((x) => x.groupId).map((x) => [x.name, r.body.groups.find((g) => g.groupId === x.groupId)?.name])));

  // 2. Participation table shows the contact column.
  await manager.goto(`${ev}/participants`);
  await manager.getByText('010-3101-2201').waitFor();
  await shot(manager, 'i2-manager-2-contact.png');
  log('contact column', await manager.getByRole('button', { name: /^연락처/ }).count() > 0);

  // 3. CSV download.
  const downloadPromise = manager.waitForEvent('download', { timeout: 15000 });
  await manager.getByRole('button', { name: 'CSV 내려받기' }).click();
  const confirm = manager.getByRole('dialog');
  if (await confirm.isVisible().catch(() => false)) {
    await shot(manager, 'i2-manager-3-csv-confirm.png');
    await confirm.getByRole('button', { name: /내려받기/ }).last().click();
  }
  const download = await downloadPromise;
  const csvPath = '/tmp/claude-0/-home-user-SCENE/d16f4d21-bf68-5fc0-ab81-f7b73ddb18de/scratchpad/i2-manager.csv';
  await download.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  log('csv rows', csv.trim().split('\n').length, 'has phone', csv.includes('010-3101-2203'));
  await manager.waitForTimeout(500);
  await shot(manager, 'i2-manager-3-csv-done.png');

  // 4. Operators screen: no manage buttons, and the server refuses.
  await manager.goto(`${ev}/operators`);
  await manager.getByText('Local staff').waitFor();
  await shot(manager, 'i2-manager-4-operators-readonly.png');
  log('manager sees 권한 buttons', await manager.getByRole('button', { name: /권한$/ }).count());
  r = await api(manager, 'PUT', `/api/v1/operator/events/${eventId}/operators/${STAFF}/permissions`, { grants: ['GROUP_WRITE'], revokes: [] });
  log('manager PUT permissions', r.status, r.body?.code);
  r = await api(manager, 'PATCH', `/api/v1/operator/events/${eventId}/operators/${STAFF}`, { role: 'MANAGER' });
  log('manager PATCH role', r.status, r.body?.code);

  // 5. End: OWNER only.
  await manager.goto(`${ev}/end`);
  await manager.getByText('행사 Owner만 종료할 수 있어요.').waitFor();
  await shot(manager, 'i2-manager-5-end-owner-only.png');
  r = await api(manager, 'POST', `/api/v1/operator/events/${eventId}/end`, { expectedLifecycleVersion: 1 });
  log('manager end', r.status, r.body?.code);

  // OWNER sees the MANAGER defaults in the permission dialog and the role summary.
  await owner.goto(`${ev}/operators`);
  await owner.getByRole('button', { name: 'Local manager 권한' }).click();
  const dialog = owner.getByRole('dialog', { name: 'Local manager님의 권한' });
  await dialog.getByRole('checkbox', { name: '조 편성' }).waitFor();
  const checked = {};
  for (const name of ['연락처 보기', '참가자 정보 수정', '명단 내려받기', '조 편성', '숙소 배정', '체크인', '준비 업무', '일정 쓰기', '공지 쓰기', '신청서 고치기', '행사 정보 고치기']) {
    checked[name] = await dialog.getByRole('checkbox', { name }).isChecked();
  }
  log('owner dialog manager checked', JSON.stringify(checked));
  await shot(owner, 'i2-owner-6-manager-permissions.png');
  await dialog.getByRole('button', { name: '돌아가기' }).click();
  await owner.getByRole('button', { name: 'Local staff 권한' }).click();
  const staffDialog = owner.getByRole('dialog', { name: 'Local staff님의 권한' });
  await staffDialog.getByRole('checkbox', { name: '조 편성' }).waitFor();
  log('owner dialog staff 조 편성 checked', await staffDialog.getByRole('checkbox', { name: '조 편성' }).isChecked(), '체크인', await staffDialog.getByRole('checkbox', { name: '체크인' }).isChecked());
  await shot(owner, 'i2-owner-7-staff-permissions.png');
  await staffDialog.getByRole('button', { name: '돌아가기' }).click();
  const summary = owner.locator('.event-home__role-summary').first();
  await summary.scrollIntoViewIfNeeded();
  log('role summary', await summary.innerText());
  await shot(owner, 'i2-owner-8-role-summary.png');

  // STAFF still only checks in.
  const staff = await as(browser, STAFF);
  await staff.goto(`${ev}/field`);
  await staff.getByText('94 김하나').waitFor();
  await staff.locator('li', { hasText: '94 김하나' }).getByRole('button', { name: '체크인' }).click();
  await staff.waitForTimeout(1500);
  await shot(staff, 'i2-staff-9-checkin.png');
  r = await api(staff, 'GET', `/api/v1/operator/events/${eventId}/check-ins/summary`);
  log('staff checkin summary', JSON.stringify(r.body));
  await staff.goto(`${ev}/groups`);
  await staff.getByText(/조 편성을 볼 권한이 없어요/).waitFor();
  await shot(staff, 'i2-staff-10-groups-denied.png');
  await staff.goto(`${ev}/participants`);
  await staff.getByText('김하나').first().waitFor();
  await staff.waitForTimeout(1000);
  log('staff sees phone', await staff.getByText('010-3101-2201').count(), 'csv button', await staff.getByRole('button', { name: 'CSV 내려받기' }).count());
  await shot(staff, 'i2-staff-11-participants.png');
  r = await api(staff, 'POST', `/api/v1/operator/events/${eventId}/applications/export`, {});
  log('staff export', r.status, r.body?.code);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
