# 신청서 질문 유형·조건부 질문 검토

Status: 확정 (2026-11-16). 사용자가 확정한 항목은 [DEC-068](PRODUCT_DECISIONS.md#dec-068--신청서-질문은-유형-9종과-조건부-표시를-갖고-신청-접수-후-유형-변경보기-삭제를-잠근다)에 있다. 10절의 확인 항목 4개도 같은 날 사용자가 추천안대로 확정했다(DEC-068 Follow-up).

관련: [#223](https://github.com/BeomhyunPark/SCENE/issues/223) · [#224](https://github.com/BeomhyunPark/SCENE/issues/224) · [#229](https://github.com/BeomhyunPark/SCENE/issues/229) · 상위 [#230](https://github.com/BeomhyunPark/SCENE/issues/230)

> **후속 결정 (2026-11-16, [DEC-070](PRODUCT_DECISIONS.md#dec-070--운영자는-신청서-설정으로-질문을-자동으로-만들고-기본항목은-이름전화또래다)):** 운영자는 질문을 하나씩 만드는 대신 신청서 설정에 답하고, 서버가 이 문서의 유형·보기·조건으로 질문을 만든다. 기본항목에 또래가 더해졌고, 기본항목의 설명·안내 문구·순서를 바꿀 수 있다. 2절의 "SYSTEM 이름·전화는 지금처럼 고정 질문"은 이 결정으로 바뀌었다.

## 1. 배경

- 2027년 1월 하순 수련회에서 실제로 쓴다. 신청은 12월 중순에 연다 (#230).
- 지금 신청서는 SYSTEM 이름·전화와 CUSTOM 자유 텍스트 질문 1개만 있다 (`V3__forms.sql`의 `fields_one_custom`). 답은 `answers.value` jsonb에 `{"text": "..."}`로 저장된다.
- 참고 사례로 실제 수련회 신청서를 분석했다 ([#223 댓글](https://github.com/BeomhyunPark/SCENE/issues/223)). 질문 약 35개 중 7개만 모두에게 보이고, 나머지는 참석 방식 → 교통편 → 동승 여부 순서로 앞 답에 따라 열린다. 교통편 보기도 참석 방식에 따라 바뀐다.

## 2. 질문 유형 (확정 9종)

| `answerType` | 이름 | 설정(`config`) | 답 값(`value`) |
|---|---|---|---|
| `SHORT_TEXT` | 단답형 | `maxLength`(1–200, 기본 200), `format`(`NONE`·`PHONE`·`DIGITS`), `placeholder` | `{"text"}` |
| `LONG_TEXT` | 서술형 | `maxLength`(1–2000, 기본 1000), `placeholder` | `{"text"}` |
| `SINGLE_CHOICE` | 단수선택 | `options`, `allowOther`, `display`(`LIST`·`BUTTONS`) | `{"optionId"}` 또는 `{"other"}` |
| `MULTI_CHOICE` | 복수선택 | `options`, `allowOther`, `minSelect`, `maxSelect` | `{"optionIds": [...], "other"?}` |
| `DROPDOWN` | 드롭다운 | `options` | `{"optionId"}` |
| `DATE` | 날짜 | `includeTime`, `min`, `max`(운영자 화면 기본값: 행사 기간) | `{"date"}` 또는 `{"dateTime"}` |
| `DATE_RANGE` | 기간 | `includeTime`, `min`, `max`(운영자 화면 기본값: 행사 기간) | `{"start", "end"}` |
| `NUMBER` | 숫자 | `min`, `max`, `unit`(예: "명") | `{"number"}` 정수 |
| `YES_NO` | 예/아니오 | `style`(`YES_NO`·`CONSENT`), `yesLabel`, `noLabel` | `{"value": true/false}` |

모든 질문이 공통으로 갖는 것: `label`(1–200자), `description`(0–500자), `required`, `position`, `showWhen`(4절).

- 텍스트 답은 지금 `{"text"}` 모양을 그대로 쓴다. 기존 CUSTOM 질문과 답은 `SHORT_TEXT`로 옮기며 값은 바꾸지 않는다.
- 날짜·시간은 행사 현지 시각(Asia/Seoul)으로 받는다. `date`는 `YYYY-MM-DD`, `dateTime`은 `YYYY-MM-DDTHH:mm`이고 offset은 넣지 않는다.
- SYSTEM 이름·전화는 지금처럼 고정 질문으로 둔다. 전화는 `SHORT_TEXT` + `format: PHONE` 규칙(숫자 4개 이상, 50자 이하)을 따른다.

### 참고 사례에서 나온 요구를 9종 안에서 처리하기 (확정)

새 유형을 만들지 않고 설정으로 처리한다. 유형이 늘면 운영자 화면과 검증 코드가 함께 커진다.

| 요구 | 처리 |
|---|---|
| 도착·출발 예정 시각 | `DATE`·`DATE_RANGE`의 `includeTime: true` |
| 개인정보 동의 | `YES_NO` + `style: CONSENT` + `required` → 체크해야 제출됨 |
| 일자별 프로그램·식사 선택 | 보기의 `group`(예: "1월 22일 (금)")으로 묶어서 표시 |
| 전화번호·숫자만 입력 | `SHORT_TEXT`의 `format` |
| 보기 2~3개를 버튼으로 | `SINGLE_CHOICE`의 `display: BUTTONS` |

## 3. 보기(option)

```json
{ "optionId": "opt_7f3a", "label": "단체 이동 차량", "group": null, "hidden": false, "showWhen": null }
```

- `optionId`는 서버가 발급하고 바꾸지 않는다. 답은 보기 문구가 아니라 `optionId`를 저장한다. 그래서 운영자가 "S"를 "S (90)"로 고쳐도 받은 답이 유지된다.
- 보기 문구 1–100자, 질문당 보기 최대 50개.
- `allowOther`면 "기타(직접입력)"가 붙는다. 직접 입력한 글은 1–200자.
- `hidden` 보기는 새 참가자에게 보이지 않는다. 이미 고른 답과 명단에는 "(숨김)"으로 남는다.

## 4. 조건부 표시 (확정: 1차 포함)

### 규칙 (확정)

```json
"showWhen": { "fieldId": "…", "optionIds": ["opt_partial", "opt_worship"] }
"showWhen": { "fieldId": "…", "equals": true }
```

- **질문 조건:** 앞 질문의 답이 보기 중 하나면 이 질문을 보인다. 조건 하나, 보기 OR만 쓴다. 여러 조건의 AND 결합은 1차에 넣지 않는다. 참고 사례는 AND 없이 조건을 이어 붙이는 것으로 모두 만들 수 있다 (참석 방식 → 교통편 → 동승 여부).
- **보기 조건:** 보기에도 같은 `showWhen`을 둔다. 참석 방식에 따라 교통편 보기가 바뀌는 경우에 쓴다. 넣지 않으면 운영자가 같은 질문을 참석 방식별로 세 번 만들어야 하고, 명단에서 교통편 열이 셋으로 나뉜다.
- **조건 대상:** `SINGLE_CHOICE`·`MULTI_CHOICE`·`DROPDOWN`·`YES_NO`만 대상이 될 수 있다. 대상은 순서상 **앞에 있는 질문**만 고를 수 있다. 그래서 조건이 순환하지 않는다. 대상이 숨겨지면 이 질문도 숨겨진다(연쇄).
- **복수선택 대상:** 고른 보기 중 하나라도 `optionIds`에 있으면 참이다.

### 숨겨진 질문의 처리

- 서버는 제출된 답으로 조건을 다시 계산한다. 화면이 보낸 표시 여부를 믿지 않는다.
- 숨겨진 질문은 필수 검사를 하지 않는다.
- 숨겨진 질문에 온 답은 **저장하지 않고 버린다** (확정). 화면에서 답을 바꾼 뒤 남은 값일 수 있으므로 거절하지 않는다. 숨겨진 보기를 고른 답도 같은 방식으로 버린다.
- 참가자가 앞 답을 바꾸면 화면은 숨겨진 질문의 입력값을 비운다.

## 5. 검증 (서버)

공개 신청 제출은 다음 순서로 검사한다. 실패하면 지금처럼 `400 APPLICATION_VALIDATION_FAILED`를 돌려준다. 질문별 오류 위치(`errors[].fieldId`)를 추가할지는 #225에서 정한다.

1. 알 수 없는 `fieldId`, 중복 답, 유형과 맞지 않는 값 모양 → 거절
2. 조건을 계산해 보이는 질문만 남긴다
3. 보이는 필수 질문에 답이 없으면 → 거절
4. 유형별 범위: 글자 수, `format`, 보기 존재·숨김 여부, 선택 개수, 날짜·숫자 범위, `start ≤ end`

## 6. 신청 접수 후 편집 (확정: 유형 변경·보기 삭제 잠금)

신청서에 `SUBMITTED` 신청이 1건이라도 있으면:

| 동작 | 허용 |
|---|---|
| 제목·설명·안내 문구 수정 | 허용 |
| 보기 추가, 보기 문구 수정, 보기 숨기기·다시 보이기 | 허용 |
| 질문 추가, 순서 변경, 필수 여부 변경 | 허용 (새 신청부터 적용) |
| 질문 유형 변경 | **잠금** |
| 보기 삭제 | **잠금** (숨기기를 안내) |
| 질문 삭제 | 숨기기로 대신한다 (확정). 받은 답은 명단에 남는다 |
| `showWhen` 변경 (질문·보기) | **잠금** (확정). 이미 받은 답과 조건이 맞지 않게 된다 |
| 글자 수·선택 수·범위 좁히기 | 허용. 기존 답은 다시 검사하지 않는다 |

잠긴 동작은 `409`와 새 오류 코드로 거절한다(#225). 운영자 화면은 버튼을 끄고 이유를 보여 준다(#226).

## 7. 한도

| 항목 | 값 |
|---|---|
| 신청서당 질문 | 최대 100개 (SYSTEM 포함) |
| 질문당 보기 | 최대 50개 |
| `LONG_TEXT` 답 | 최대 2000자 |

## 8. 개인정보 경고 (C7)

DEC-066의 C7 경고 범위를 질문 제목에서 **설명과 보기 문구까지** 넓힌다. 이번에도 경고만 하고 저장을 막지 않는다. 확인에는 운영자가 쓴 문구만 보내고, 행사나 참가자 답은 보내지 않는다.

## 9. 저장 구조 (구현 메모, #225)

- V9 (`V9__field_answer_types.sql`, 회고 V8 다음): `fields`에 `answer_type varchar(16)`, `required boolean`, `description varchar(500)`, `config jsonb`, `show_when jsonb`, `hidden boolean`을 더한다. `fields_one_custom`을 지운다. 기존 CUSTOM은 `SHORT_TEXT`, `required=false`로 옮긴다.
- 보기는 `config.options`에, 질문 조건은 `show_when` 열에, 보기 조건은 각 보기의 `showWhen`에 둔다. 보기만 따로 조회하거나 집계할 일이 생기면 그때 테이블로 나눈다.
- 날짜 `min`·`max`는 서버가 행사 기간으로 채우지 않는다. 운영자 화면(#226)이 질문을 만들 때 행사 기간을 기본값으로 넣는다.
- API 계약은 [backend/docs/api.md](../../backend/docs/api.md)의 "신청서"와 "공개 신청서"에 있다.
- `answers.value`는 그대로 jsonb다.

## 10. 확인 결과 (2026-11-16 사용자 결정, 모두 추천안)

- ✅ 참고 사례 요구(시간, 동의, 일자 묶음, 형식, 버튼 표시)를 새 유형 없이 설정으로 처리한다 — 2절
- ✅ 보기 단위 조건(`option.showWhen`)을 1차에 넣는다 — 4절
- ✅ 숨겨진 질문의 답은 거절하지 않고 버린다 — 4절
- ✅ 신청 접수 후 질문 삭제는 숨기기로 대신하고, 조건 대상 변경은 잠근다 — 6절

## 11. 범위 밖

- AND·NOT 조건, 페이지 나누기·건너뛰기 로직
- 파일 첨부, 서명, 표(그리드) 질문
- 답에 따른 자동 계산(참가비 등) — 참가비는 이번 수련회에서 SCENE 밖에서 처리한다 (#230)
