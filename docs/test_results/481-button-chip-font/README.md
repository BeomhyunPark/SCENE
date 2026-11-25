# #481 버튼·칩 글씨 크기

목업 서버(`VITE_API_MOCK=1 pnpm dev`)에서 자동으로 열어 찍고 잰 기록이다. 실제 클릭은 칩 터치 영역 확인(`hit.mjs`)만 했고, 실서버 검증은 하지 않았다.

- `node shots.mjs . before|after` → `before-*.png`, `after-*.png`(1440·390, deviceScaleFactor 2), `*-measure.json`
- `node hit.mjs` → `hit-log.txt`: 32px 칩의 위·아래 3px를 눌러도 칩이 선택됨(터치 40px)

| 측정 | 전 | 후 |
| --- | --- | --- |
| 공지 필터 칩 · 받는 사람 칩 | 18px/26, 높이 40 | 14px/21, 보이는 높이 32 (터치 40) |
| size 48 버튼 (끼니 복사, 공지 발행, 가입 390) | 18px/26, 높이 48 | 16px/24, 높이 48 |
| size 40 버튼 | 14px/21 | 그대로 |

검증: `pnpm typecheck && pnpm lint && pnpm test` 통과 (103 파일, 770 테스트).
