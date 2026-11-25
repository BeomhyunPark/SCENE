// 현장 운영 counts only (#456, 2026-11-25). VITE_API_MOCK=1 Vite on :5199. Usage: node field-counts.cjs <outDir>
const { chromium } = require('playwright');
const out = process.argv[2];
async function shoot(b, width, height, name, log) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => log.push('pageerror ' + e.message));
  await p.goto('http://localhost:5199/');
  await p.waitForFunction(() => window.sceneMock && navigator.serviceWorker.controller, null, { timeout: 15000 });
  const RETREAT = await p.evaluate(async () => {
    const seed = await import('/src/test/summarySeed.ts');
    const ci = await import('/src/mocks/checkInStore.ts');
    const ps = await import('/src/mocks/participantStore.ts');
    const mc = await import('/src/mocks/mealCounts.ts');
    const desk = await import('/src/mocks/deskRooms.ts');
    const operator = await import('/src/mocks/operatorStore.ts');
    const fx = await import('/src/mocks/fixtures/seed.ts');
    const session = await import('/src/api/session.ts');
    const r = seed.seedRetreat();
    const ids = [];
    const people = [['하나', '94', 'opt_female'], ['두리', '95', 'opt_male'], ['세나', '96', 'opt_female'], ['네온', '97', 'opt_male'], ['다섯', '98', 'opt_female']];
    for (const [n, c, g] of people) ids.push(r.apply({ NAME: n, COHORT: c, GENDER: { optionId: g }, ATTENDANCE: { optionId: 'opt_full' } }));
    ids.push(r.apply({ NAME: '세찬', COHORT: '96', GENDER: { optionId: 'opt_male' }, ATTENDANCE: { optionId: 'opt_partial' }, MEALS: { optionIds: ['opt_d2_lunch', 'opt_d2_dinner'] } }));
    const part = (a) => ps.tableApplications(seed.RETREAT).find((row) => row.applicationId === a).participantId;
    for (const a of ids.slice(0, 2)) ci.seedCheckIn(seed.RETREAT, part(a));
    const rooms = {};
    ids.forEach((a, i) => { rooms[part(a)] = { roomId: `room-${i % 2}`, name: i % 2 ? '302호' : '301호', locationNote: '본관 3층' }; });
    desk.publishDeskRooms(seed.RETREAT, rooms);
    // Day 1 19:10: before #456 was taken off, the late full attendees read as 왔어야 함 here.
    mc.setMealCountsNow(new Date('2027-01-22T19:10:00+09:00'));
    if (operator.setLifecycle) operator.setLifecycle(seed.RETREAT, 'ACTIVE', 1);
    await session.login({ userId: fx.localUsers[0].userId });
    return seed.RETREAT;
  });
  await p.evaluate((id) => { history.pushState({}, '', `/events/${id}/field`); dispatchEvent(new PopStateEvent('popstate')); }, RETREAT);
  await p.getByRole('group', { name: '체크인 상태로 보기' }).waitFor({ timeout: 15000 });
  await p.getByText('301호').first().waitFor({ timeout: 15000 });
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const chips = await p.getByRole('group', { name: '체크인 상태로 보기' }).locator('button').allInnerTexts();
  const summary = await p.locator('.event-field__counts, [aria-label="체크인 현황"]').first().innerText().catch(() => '(no summary locator)');
  const text = await p.locator('main').innerText();
  log.push(`--- ${name} (${width}) ---\nchips: ${JSON.stringify(chips)}\nsummary: ${summary.replace(/\n/g, ' ')}`);
  for (const gone of ['왔어야 함', '올 예정', '도착 예정', '참석 칸', '예정 모름', '끼니', '기준']) log.push(`${name} has "${gone}": ${text.includes(gone)}`);
  log.push(`${name} has room 301호: ${text.includes('301호')}`);
  log.push(`${name} horizontal overflow: ${await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)}`);
  await ctx.close();
}
(async () => {
  const b = await chromium.launch();
  const log = [];
  await shoot(b, 390, 844, '7-counts-only-390', log);
  await shoot(b, 1440, 900, '8-counts-only-1440', log);
  console.log(log.join('\n'));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
