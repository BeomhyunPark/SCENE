# 현장 운영 주기적 갱신 확인 (#408, 로드맵 E1)

2026-11-19. 브랜치 `claude/roadmap-e1-field-refresh`.

## 구분

| 종류 | 한 일 | 결과 |
|---|---|---|
| 단위 테스트 | `fieldRefresh.test.ts`(갱신 규칙 6개), `EventFieldRefresh.test.tsx`(화면 4개, MSW) | 통과. 전체 447개 통과 |
| 정적 검사 | `pnpm lint`·`typecheck`·`build` | 통과 |
| 서버 검증 | 서버 변경 없음. `./gradlew check`는 돌리지 않았다 | — |
| 실제 클릭 | 로컬 서버(Docker PostgreSQL 17, `local` profile) + `VITE_API_MOCK=0`, Playwright 브라우저 컨텍스트 2개(390×844 터치). A=Local owner, B=Local staff | 아래 표 |
| 실제 휴대폰 | 하지 않았다. 사용자 몫(#289) | — |

데이터는 `field-refresh-seed.mjs`로 실제 API를 거쳐 만들었다: ACTIVE 행사 하나, STAFF 운영자 하나, 신청 120건. 클릭 스크립트는 `field-refresh-two-desks.mjs`다.

## 실제 클릭 결과

| # | 확인 | 결과 |
|---|---|---|
| 1 | A가 `90 김하늘`을 체크인하고 B는 아무것도 안 할 때 | 9.6초 뒤 B의 숫자와 명단에 체크인 완료 |
| 2 | B가 검색 칸에 커서를 둔 채 A가 `92 박서준` 체크인 | B의 숫자는 2로 바뀌고 명단은 11초 넘게 그대로(미완료). 검색 칸을 떠나자 0.1초 뒤 체크인 완료 |
| 3 | B가 '더 보기'로 100줄을 읽고 둘째 쪽 `99 임하늘`까지 내려간 채 A가 그 사람을 체크인 | 그 줄만 체크인 완료로 바뀜. 줄 100→100, scrollY 10743→10743 |
| 4 | B의 새로 고침 버튼 | 0.2초 안에 숫자 4 |
| 5 | B가 30초 가만히 있을 때 요청 | 9건: summary ×3, roster ×6(읽어 둔 두 쪽 × 3) |
| 6 | B 탭 숨김(visibilityState) 21초 | 요청 0건. 다시 보인 직후 1.5초 안에 3건 |

1번의 9.6초는 B가 마지막으로 읽은 직후에 A가 체크인했기 때문이다. 최악은 주기 10초 + 응답 시간이고, 화면을 막 만진 경우 명단은 최대 한 주기 더 늦을 수 있다(숫자는 늦지 않는다).

## 캡처

- `field-refresh-1-desk-a.png`, `field-refresh-1-desk-b.png`: 두 접수대 첫 화면과 아래쪽 막대
- `field-refresh-2-desk-b-seen.png`: 1번 뒤 B
- `field-refresh-3-desk-b-typing.png`: 2번, 숫자는 2인데 명단은 기다림
- `field-refresh-4-desk-b-scrolled.png`: 3번, 둘째 쪽에서 그 줄만 바뀜
- `field-refresh-5-desk-b-button.png`: 4번

## 사용자가 확인할 것

- 실제 휴대폰 두 대에서 다른 접수대의 체크인이 10초 안팎으로 보이는지(#289).
- 아래쪽 막대의 새로 고침 버튼이 한 손 엄지로 닿는지, 홈 표시줄과 겹치지 않는지(iPhone).
