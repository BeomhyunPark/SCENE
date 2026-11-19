const { chromium, devices } = require('playwright');
const OUT = '/home/user/SCENE/docs/test_results/';
const BASE = 'http://localhost:5173';
const OWNER = '00000000-0000-4000-8000-000000000001';
const SPACE = '00000000-0000-4000-8000-000000000010';
const NOTICE = '참가비 3만원은 12월 31일까지 보내 주세요.\n신한 110-123-456789 (예금주 홍길동)\n\n문의: 총무 010-1234-5678\n안내 글: https://example.com/retreat?y=2027&m=1\n<b>굵게</b>는 글자 그대로 보여요.';

async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body }) => {
    let token = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))?.split('=')[1];
    if (!token) { token = crypto.randomUUID(); document.cookie = `XSRF-TOKEN=${token}; Path=/; SameSite=Lax`; }
    const r = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  }, { method, url, body });
}

(async () => {
  const browser = await chromium.launch();
  const op = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await op.newPage();
  await page.goto(BASE + '/');
  let r = await api(page, 'POST', '/api/v1/operator/auth/login', { userId: OWNER });
  console.log('login', r.status);
  r = await api(page, 'POST', `/api/v1/operator/spaces/${SPACE}/events`, { name: 'A8 완료 안내 확인 수련회', startDate: '2027-01-22', endDate: '2027-01-24' });
  console.log('event', r.status);
  const eventId = r.body.eventId;
  r = await api(page, 'POST', `/api/v1/operator/events/${eventId}/activate`, { expectedLifecycleVersion: 0 });
  console.log('activate', r.status);
  r = await api(page, 'POST', `/api/v1/operator/events/${eventId}/forms`, {});
  console.log('form', r.status);
  const formId = r.body.formId;
  r = await api(page, 'PATCH', `/api/v1/operator/events/${eventId}/forms/${formId}`, { acceptingApplications: true });
  console.log('open', r.status);

  // 1. Operator writes the notice by clicking in the real setup screen.
  await page.goto(`${BASE}/events/${eventId}/participants/setup`);
  const box = page.getByRole('textbox', { name: '완료 안내 문구' });
  await box.waitFor();
  await box.scrollIntoViewIfNeeded();
  await page.screenshot({ path: OUT + 'a8-completion-notice-1-empty.png', fullPage: true });
  await box.fill(NOTICE);
  await page.getByRole('heading', { name: '신청을 마친 화면' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: OUT + 'a8-completion-notice-2-draft-preview.png', fullPage: true });
  await page.getByRole('button', { name: '안내 저장' }).click();
  await page.getByText('저장했어요.').waitFor();
  await page.screenshot({ path: OUT + 'a8-completion-notice-3-saved.png', fullPage: true });
  r = await api(page, 'GET', `/api/v1/operator/events/${eventId}/forms/${formId}`);
  console.log('stored equals', r.body.completionNotice === NOTICE.trim());

  // 2. A participant applies on a phone and sees the notice.
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  const p = await phone.newPage();
  await p.goto(`${BASE}/apply/${eventId}/${formId}`);
  await p.getByLabel(/^이름/).fill('김참가');
  await p.getByLabel(/^전화/).fill('010-2222-3333');
  await p.getByLabel(/^또래/).fill('94');
  await p.screenshot({ path: OUT + 'a8-completion-notice-4-phone-form.png', fullPage: true });
  await p.getByRole('button', { name: '신청하기' }).click();
  const region = p.getByRole('region', { name: '안내' });
  await region.waitFor();
  const shown = await region.locator('p').innerText();
  console.log('phone shows notice', shown === NOTICE.trim(), 'no <b> element', await region.locator('b').count() === 0, 'no link', await region.locator('a').count() === 0);
  const width = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  console.log('phone scroll/inner width', width);
  await p.screenshot({ path: OUT + 'a8-completion-notice-5-phone-done.png', fullPage: true });

  // 3. After an application arrives the form is locked, but the notice is still editable.
  await page.reload();
  await page.getByText(/신청이 들어와서/).first().waitFor();
  const box2 = page.getByRole('textbox', { name: '완료 안내 문구' });
  await box2.fill('문의: 총무 010-1234-5678 (평일 저녁)');
  await page.getByRole('button', { name: '안내 저장' }).click();
  await page.getByText('저장했어요.').waitFor();
  await box2.scrollIntoViewIfNeeded();
  await page.screenshot({ path: OUT + 'a8-completion-notice-6-edit-after-submit.png', fullPage: true });
  r = await api(page, 'GET', `/api/v1/operator/events/${eventId}/forms/${formId}`);
  console.log('locked', r.body.locked, 'notice', r.body.completionNotice);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
