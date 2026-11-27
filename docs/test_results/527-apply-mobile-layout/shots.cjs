const { chromium } = require('playwright');
const [,, url, out] = process.argv;
const f = (id, pos, label, answerType, config, extra = {}) => ({ fieldId: id, kind: extra.kind ?? 'CUSTOM', systemKey: extra.systemKey ?? null, label, position: pos, answerType, required: extra.required ?? false, description: extra.description ?? null, config, showWhen: null, hidden: false, presetKey: extra.presetKey ?? null, presetActive: extra.presetKey ? true : null });
const form = { formId: 'frm_1', fields: [
  f('f1', 1, '이름', 'SHORT_TEXT', { maxLength: 50 }, { kind: 'SYSTEM', systemKey: 'NAME', required: true }),
  f('f2', 2, '교통편', 'SINGLE_CHOICE', { options: [{ optionId: 'o1', label: '단체 버스', group: null, hidden: false, showWhen: null }, { optionId: 'o2', label: '개인 차량', group: null, hidden: false, showWhen: null }], display: 'LIST' }, { presetKey: 'TRANSPORT_IN', required: true }),
  f('f3', 3, '개인정보 수집·이용에 동의합니다', 'YES_NO', { style: 'CONSENT', yesLabel: null, noLabel: null }, { presetKey: 'CONSENT', required: true, description: '입력한 정보는 신청 접수와 행사 운영(조 배정, 숙박·식사·이동 준비, 현장 확인)에만 사용합니다.' }),
  f('f4', 4, '함께 오는 가족은 몇 명이에요?', 'NUMBER', { min: 0, max: 10, unit: '명' }),
  f('f5', 5, '머무는 기간', 'DATE_RANGE', { includeTime: false, min: null, max: null }),
]};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
  await p.route('**/api/v1/**', (r) => r.request().url().includes('/public/events/') ? r.fulfill({ json: form }) : r.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }));
  await p.goto(url);
  await p.getByText('신청하기').waitFor();
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
})();
