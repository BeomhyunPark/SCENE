// 식수 현황 단순화 캡처 (#454, 2026-11-25). VITE_API_MOCK=1 Vite on :5199. Usage: node meals-simple.cjs <outDir>
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
    const fx = await import('/src/mocks/fixtures/seed.ts');
    const session = await import('/src/api/session.ts');
    const r = seed.seedRetreat();
    const ids = [];
    const people = [['하나', '94', 'opt_female'], ['두리', '95', 'opt_male'], ['세나', '96', 'opt_female'], ['네온', '97', 'opt_male'], ['다섯', '98', 'opt_female']];
    for (const [n, c, g] of people) ids.push(r.apply({ NAME: n, COHORT: c, GENDER: { optionId: g }, ATTENDANCE: { optionId: 'opt_full' } }));
    ids.push(r.apply({ NAME: '세찬', COHORT: '96', GENDER: { optionId: 'opt_male' }, ATTENDANCE: { optionId: 'opt_partial' }, MEALS: { optionIds: ['opt_d2_lunch', 'opt_d2_dinner'] } }));
    const part = (a) => ps.tableApplications(seed.RETREAT).find((row) => row.applicationId === a).participantId;
    for (const a of ids.slice(0, 3)) ci.seedCheckIn(seed.RETREAT, part(a));
    // Day 2 13:10: day 1 dinner, day 2 breakfast and lunch are done; next is day 2 dinner.
    mc.setMealCountsNow(new Date('2027-01-23T13:10:00+09:00'));
    await session.login({ userId: fx.localUsers[0].userId });
    return seed.RETREAT;
  });
  await p.evaluate((id) => { history.pushState({}, '', `/events/${id}/meals`); dispatchEvent(new PopStateEvent('popstate')); }, RETREAT);
  await p.getByRole('region', { name: /다음 식사/ }).waitFor({ timeout: 15000 });
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const text = await p.locator('.meals').innerText();
  log.push(`--- ${name} (${width}) .meals text ---\n${text}`);
  for (const gone of ['끼니', '도착 반영', '올 예정', '아직 안 옴', '기본 시각', '모르는 신청', '복사', '주방', '지남']) {
    log.push(`${name} has "${gone}": ${text.includes(gone)}`);
  }
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  log.push(`${name} horizontal overflow: ${overflow}`);
  await ctx.close();
}
(async () => {
  const b = await chromium.launch();
  const log = [];
  await shoot(b, 390, 844, '10-simple-390', log);
  await shoot(b, 1440, 900, '11-simple-1440', log);
  console.log(log.join('\n'));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
