// 현장 운영 도착·미도착·도착 예정 (#456, 2026-11-26). VITE_API_MOCK=1 Vite on :5199. Usage: node field-states.cjs <outDir>
const { chromium } = require('playwright');
const out = process.argv[2];
async function shoot(b, width, height, name, withExpected, log) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => log.push('pageerror ' + e.message));
  await p.goto('http://localhost:5199/');
  await p.waitForFunction(() => window.sceneMock && navigator.serviceWorker.controller, null, { timeout: 15000 });
  const RETREAT = await p.evaluate(async (withExpected) => {
    const seed = await import('/src/test/summarySeed.ts');
    const ci = await import('/src/mocks/checkInStore.ts');
    const ps = await import('/src/mocks/participantStore.ts');
    const mc = await import('/src/mocks/mealCounts.ts');
    const desk = await import('/src/mocks/deskRooms.ts');
    const fx = await import('/src/mocks/fixtures/seed.ts');
    const session = await import('/src/api/session.ts');
    const r = seed.seedRetreat();
    const ids = [];
    const people = [['하나', '94', 'opt_female'], ['두리', '95', 'opt_male'], ['세나', '96', 'opt_female'], ['네온', '97', 'opt_male']];
    for (const [n, c, g] of people) ids.push(r.apply({ NAME: n, COHORT: c, GENDER: { optionId: g }, ATTENDANCE: { optionId: 'opt_full' } }));
    if (withExpected) {
      // Partial from day 2: 도착 예정 at 19:10 on day 1.
      ids.push(r.apply({ NAME: '세찬', COHORT: '96', GENDER: { optionId: 'opt_male' }, ATTENDANCE: { optionId: 'opt_partial' }, MEALS: { optionIds: ['opt_d2_lunch', 'opt_d2_dinner'] } }));
      ids.push(r.apply({ NAME: '여섯', COHORT: '99', GENDER: { optionId: 'opt_female' }, ATTENDANCE: { optionId: 'opt_partial' }, MEALS: { optionIds: ['opt_d2_breakfast', 'opt_d2_lunch'] } }));
    }
    const part = (a) => ps.tableApplications(seed.RETREAT).find((row) => row.applicationId === a).participantId;
    for (const a of ids.slice(0, 2)) ci.seedCheckIn(seed.RETREAT, part(a));
    const rooms = {};
    ids.forEach((a, i) => { rooms[part(a)] = { roomId: `room-${i % 2}`, name: i % 2 ? '302호' : '301호', locationNote: '본관 3층' }; });
    desk.publishDeskRooms(seed.RETREAT, rooms);
    mc.setMealCountsNow(new Date('2027-01-22T19:10:00+09:00'));
    await session.login({ userId: fx.localUsers[0].userId });
    return seed.RETREAT;
  }, withExpected);
  await p.evaluate((id) => { history.pushState({}, '', `/events/${id}/field`); dispatchEvent(new PopStateEvent('popstate')); }, RETREAT);
  const group = p.getByRole('group', { name: '체크인 상태로 보기' });
  await group.waitFor({ timeout: 15000 });
  await p.getByRole('button', { name: /^전체 \d+명$/ }).waitFor({ timeout: 15000 });
  await p.getByText('301호').first().waitFor({ timeout: 15000 });
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const chips = await group.locator('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  const badges = await p.locator('.event-field__list .event-field__row').evaluateAll((rows) => rows.map((r) => `${r.querySelector('.event-field__name')?.textContent}: ${r.querySelector('.event-field__badge')?.textContent} ${r.querySelector('.event-field__meta')?.textContent ?? ''}`));
  const text = await p.locator('main').innerText();
  log.push(`--- ${name} (${width}) ---\nchips: ${JSON.stringify(chips)}\nrows:\n  ${badges.join('\n  ')}`);
  for (const gone of ['왔어야 함', '올 예정', '참석 칸', '예정 모름', '체크인 완료', '미완료', '끼니', '기준', '식수 현황 보기']) log.push(`${name} has "${gone}": ${text.includes(gone)}`);
  log.push(`${name} horizontal overflow: ${await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)}`);
  await ctx.close();
}
(async () => {
  const b = await chromium.launch();
  const log = [];
  await shoot(b, 390, 844, '11-states-390', true, log);
  await shoot(b, 1440, 900, '12-states-1440', true, log);
  await shoot(b, 390, 844, '13-no-expected-390', false, log);
  await shoot(b, 1440, 900, '14-no-expected-1440', false, log);
  console.log(log.join('\n'));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
