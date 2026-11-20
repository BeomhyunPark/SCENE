const { chromium } = require('playwright');
const E = process.argv[2];
const OUT = '/home/user/SCENE/docs/test_results/446-schedule';
const W = 'http://localhost:5173';
const log = [];
const note = (s) => { log.push(s); console.log(s); };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const desk = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 };

async function operator(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.addCookies([{ name: 'XSRF-TOKEN', value: 'dev-csrf', url: W }]);
  const r = await ctx.request.post(`${W}/api/v1/operator/auth/login`, { headers: { 'X-XSRF-TOKEN': 'dev-csrf' }, data: { userId: '00000000-0000-4000-8000-000000000002' } });
  if (!r.ok()) throw new Error('op login ' + r.status());
  return ctx;
}
async function participant(browser, name, phoneNo) {
  const ctx = await browser.newContext(phone);
  await ctx.addCookies([{ name: 'XSRF-TOKEN', value: 'dev-csrf', url: W }]);
  const r = await ctx.request.post(`${W}/api/v1/public/events/${E}/participant-sessions`, { headers: { 'X-XSRF-TOKEN': 'dev-csrf' }, data: { name, phone: phoneNo, pin: '730914' } });
  if (r.status() !== 204) throw new Error('p login ' + r.status());
  return ctx;
}
async function api(ctx, method, path, data) {
  const r = await ctx.request.fetch(`${W}/api/v1/operator/events/${E}/schedule${path}`, { method, headers: { 'X-XSRF-TOKEN': 'dev-csrf' }, data });
  return r.json();
}

(async () => {
  const browser = await chromium.launch();
  // 1. Manager on desktop adds the first item through the editor and publishes it in one press.
  const opD = await operator(browser, desk);
  const d = await opD.newPage();
  await d.goto(`${W}/events/${E}/schedule`);
  await d.getByText('아직 공개하지 않았어요').waitFor();
  await d.screenshot({ path: `${OUT}/1-desktop-empty.png` });
  await d.getByRole('link', { name: '+ 일정 추가' }).first().click();
  const f = d.getByRole('form', { name: '일정 추가' });
  await f.getByLabel('시작').fill('18:00');
  await f.getByLabel('끝 (선택)').fill('19:00');
  await f.getByLabel('제목').fill('저녁');
  await f.getByLabel('장소 (선택)').fill('식당');
  await f.getByLabel('분류').selectOption('MEAL');
  await f.getByLabel(/식사 칸 연결/).selectOption('opt_d1_dinner').catch(() => note('no dinner slot in this form setup'));
  await d.screenshot({ path: `${OUT}/2-desktop-editor.png`, fullPage: true });
  await f.getByRole('button', { name: '저장하고 바로 공개' }).click();
  await d.getByText(/추가하고 공개했어요/).waitFor();
  note('desktop add+publish notice: ' + await d.locator('.event-groups__notice').innerText());
  // More items saved only (working copy), then the whole board is published from the dialog.
  const base = { endTime: null, place: null, description: null, slotId: null, audience: [{ type: 'ALL' }], publish: false };
  await api(opD, 'POST', '/items', { ...base, day: 1, startTime: '19:30', endTime: '21:30', title: '저녁 집회', place: '대강당', category: 'WORSHIP' });
  await api(opD, 'POST', '/items', { ...base, day: 1, startTime: '22:00', endTime: '00:30', title: '조장 모임', place: '세미나실', category: 'GROUP', audience: [{ type: 'LEADERS' }] });
  await api(opD, 'POST', '/items', { ...base, day: 1, startTime: '23:00', title: '운영진 회의', category: 'OTHER', audience: [{ type: 'STAFF' }] });
  await api(opD, 'POST', '/items', { ...base, day: 2, startTime: '15:00', endTime: '16:00', title: '산책', place: '뒷산', category: 'FREE' });
  await d.reload();
  await d.getByText(/공개하지 않은 변경 4건/).waitFor();
  await d.screenshot({ path: `${OUT}/3-desktop-board-pending.png`, fullPage: true });
  await d.getByRole('button', { name: '공개', exact: true }).click();
  const dlg = d.getByRole('dialog');
  await dlg.waitFor();
  await d.screenshot({ path: `${OUT}/4-desktop-publish-dialog.png` });
  await dlg.getByRole('button', { name: '공개', exact: true }).click();
  await d.getByText(/^공개했어요/).waitFor();
  note('desktop board publish notice: ' + await d.locator('.event-groups__notice').innerText());

  // 2. Participants: leader and member on phones.
  const leaderCtx = await participant(browser, '김조장', '010-1111-0001');
  const memberCtx = await participant(browser, '이조원', '010-1111-0002');
  const lp = await leaderCtx.newPage();
  await lp.goto(`${W}/participate/${E}/schedule`);
  await lp.getByRole('list').filter({ hasText: '저녁' }).first().waitFor();
  const leaderTitles = await lp.locator('.participant-schedule__title').allInnerTexts();
  note('leader day1: ' + JSON.stringify(leaderTitles));
  await lp.screenshot({ path: `${OUT}/5-phone-leader-schedule.png`, fullPage: true });
  const mp = await memberCtx.newPage();
  await mp.goto(`${W}/participate/${E}`);
  await mp.getByRole('region', { name: '지금·다음 일정' }).getByText(/첫 일정|지금|다음/).first().waitFor();
  await mp.screenshot({ path: `${OUT}/6-phone-member-home.png`, fullPage: true });
  await mp.getByRole('link', { name: '일정 전체 보기' }).click();
  await mp.getByText('저녁 집회').waitFor();
  const memberTitles = await mp.locator('.participant-schedule__title').allInnerTexts();
  note('member day1: ' + JSON.stringify(memberTitles));

  // 3. Manager on a phone: event home -> 일정표 -> item -> start and place -> 저장하고 바로 공개.
  const opP = await operator(browser, phone);
  const p = await opP.newPage();
  await p.goto(`${W}/events/${E}`);
  await p.getByRole('link', { name: /일정표/ }).waitFor();
  let presses = 0;
  const t0 = Date.now();
  await p.getByRole('link', { name: /일정표/ }).click(); presses++;
  await p.getByRole('link', { name: '18:00 저녁 고치기' }).click(); presses++;
  const pf = p.getByRole('form', { name: '일정 고치기' });
  await pf.getByRole('button', { name: '10분 미루기' }).click(); presses++;
  await pf.getByRole('button', { name: '10분 미루기' }).click(); presses++;
  await pf.getByRole('button', { name: '10분 미루기' }).click(); presses++;
  await pf.getByLabel('장소 (선택)').fill('본관 식당'); presses++;
  await p.screenshot({ path: `${OUT}/7-phone-editor.png` });
  await pf.getByRole('button', { name: '저장하고 바로 공개' }).click(); presses++;
  await p.getByText(/저장하고 공개했어요/).waitFor();
  const t1 = Date.now();
  note(`phone fix: ${((t1 - t0) / 1000).toFixed(1)}s from event home to published, ${presses} actions (5 presses + 1 typing + publish) ; notice: ` + await p.locator('.event-groups__notice').innerText());
  await p.screenshot({ path: `${OUT}/8-phone-board-after-publish.png`, fullPage: true });

  // 4. Member's open schedule tab picks it up from updates.
  await mp.getByText('장소 식당 → 본관 식당').waitFor({ timeout: 60000 });
  const t2 = Date.now();
  note(`member saw 변경됨 ${((t2 - t1) / 1000).toFixed(1)}s after publish`);
  await mp.screenshot({ path: `${OUT}/9-phone-member-changed.png`, fullPage: true });

  // 5. Other unpublished change -> confirmation dialog.
  await api(opP, 'POST', '/items', { ...base, day: 2, startTime: '09:30', endTime: '11:00', title: '오전 집회', place: '대강당', category: 'WORSHIP' });
  await p.reload();
  await p.getByRole('link', { name: '19:30 저녁 집회 고치기' }).click();
  await p.getByRole('form', { name: '일정 고치기' }).getByLabel('장소 (선택)').fill('소강당');
  await p.getByRole('button', { name: '저장하고 바로 공개' }).click();
  const conf = p.getByRole('dialog', { name: /다른 미공개 변경 1건도 함께 공개돼요/ });
  await conf.waitFor();
  await p.screenshot({ path: `${OUT}/10-phone-confirm-other-changes.png` });
  await conf.getByRole('button', { name: '함께 공개' }).click();
  await p.getByText(/저장하고 공개했어요/).waitFor();
  note('confirm then publish: ' + await p.locator('.event-groups__notice').innerText());

  // 6. Delete 산책 and publish -> 취소됨.
  await p.getByRole('tab', { name: /2일차/ }).click();
  await p.getByRole('link', { name: '15:00 산책 고치기' }).click();
  await p.getByRole('button', { name: '이 일정 지우기' }).click();
  await p.getByRole('dialog').getByRole('button', { name: '지우고 바로 공개' }).click();
  await p.getByText(/지우고 공개했어요/).waitFor();
  const t3 = Date.now();
  note('delete: ' + await p.locator('.event-groups__notice').innerText());
  await mp.getByRole('tab', { name: /2일차/ }).click();
  await mp.getByText('취소됨').waitFor({ timeout: 60000 });
  note(`member saw 취소됨 ${((Date.now() - t3) / 1000).toFixed(1)}s after publish`);
  await mp.screenshot({ path: `${OUT}/11-phone-member-cancelled.png`, fullPage: true });

  // 7. Desktop participant view.
  const deskP = await browser.newContext(desk);
  await deskP.addCookies([{ name: 'XSRF-TOKEN', value: 'dev-csrf', url: W }]);
  await deskP.request.post(`${W}/api/v1/public/events/${E}/participant-sessions`, { headers: { 'X-XSRF-TOKEN': 'dev-csrf' }, data: { name: '김조장', phone: '010-1111-0001', pin: '730914' } });
  const dp = await deskP.newPage();
  await dp.goto(`${W}/participate/${E}/schedule`);
  await dp.getByText('저녁 집회').waitFor();
  await dp.screenshot({ path: `${OUT}/12-desktop-leader-schedule.png`, fullPage: true });
  await d.reload();
  await d.getByText('모두 공개됐어요').waitFor();
  await d.screenshot({ path: `${OUT}/13-desktop-board-published.png`, fullPage: true });
  require('fs').writeFileSync('/tmp/claude-0/s/click-log.txt', log.join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
