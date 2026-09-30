# Church Event Operations Platform — Product Research

> **Baseline 안내:** 아래 Research의 Evidence·Strength·Status·Caveat 보존. Product Requirement 또는 CONFIRMED로 승격하지 않는다. 현재 기술 기준과 작성 시점 차이는 [Architecture](../architecture/architecture-v0.1.md) 참조.

## 저장소 Research Artifact

- [Retreat v0.9 Product Audit — Source-backed Second Pass](../research/retreat-v0.9-product-audit.md)
- [13-Year Cross-event Experience Analysis v0.1](../research/13-year-cross-event-experience-analysis.md)
- [Problem Cluster Synthesis v0.1](../research/problem-cluster-synthesis.md)
- [Event Operational Complexity Dimensions v0.2](../research/event-operational-complexity-dimensions-v0.2.md)

[Product Definition](PRODUCT_DEFINITION.md) · [Product Decisions](PRODUCT_DECISIONS.md) · [Figma Governance](../design/figma-workspace-governance.md)

> 이 문서는 Church Event Operations Platform의 **Research Repository**다.
>
> 경험, 관찰, 설문, 인터뷰, 경쟁 분석에서 발견한 Evidence와 아직 검증되지 않은 Product Hypothesis를 관리한다.
>
> 이 문서에 기록됐다고 해서 Product Requirement로 확정된 것은 아니다.

---

# 1. Research Objective

현재 Research의 가장 중요한 목적은 다음 질문에 답하는 것이다.

> **교회 Event 준비와 운영 과정에서 어떤 문제가 반복적으로 발생하며, 그중 Software Product가 해결할 가치가 충분히 큰 문제는 무엇인가?**

궁극적으로 다음을 발견해야 한다.

- 가장 큰 Problem
- 가장 자주 발생하는 Problem
- 가장 많은 사람에게 영향을 주는 Problem
- 해결 비용이 높은 Problem
- 기존 도구가 제대로 해결하지 못하는 Problem
- 돈을 지불해서라도 해결할 가능성이 있는 Problem

---

# 2. Research Principle

## 2.1 Solution보다 Problem을 먼저 조사한다

다음과 같은 질문은 피한다.

> "이런 기능이 있으면 사용하시겠어요?"

가능하면 다음과 같이 질문한다.

> "최근 Event에서 이 업무를 어떻게 처리하셨나요?"

> "가장 번거로웠던 과정이 무엇이었나요?"

> "왜 그렇게 처리하셨나요?"

> "그 과정에서 실수가 발생한 적이 있나요?"

> "누구와 얼마나 많이 연락해야 했나요?"

과거 실제 행동을 우선 조사한다.

---

## 2.2 사용자 의견과 실제 행동을 구분한다

사람이

> "이 기능 좋을 것 같다."

라고 말하는 것은 강한 Evidence가 아니다.

다음 Evidence를 더 중요하게 본다.

- 실제 사용했던 Workflow
- 반복적으로 수행한 수작업
- 실제 발생한 사고
- 실제로 지불한 비용
- 실제 사용 중인 도구
- 실제로 만든 Spreadsheet
- 실제 반복 문의
- 실제 업무시간

---

# 3. Evidence Type

각 발견에는 가능한 경우 Evidence Type을 기록한다.

## EXPERIENCE

프로젝트 사용자가 직접 경험한 사례.

## INTERVIEW

사용자 인터뷰에서 확인.

## SURVEY

설문 응답에서 확인.

## OBSERVATION

실제 준비 또는 현장을 관찰하여 확인.

## ARTIFACT

Spreadsheet, Forms, 문서, 카카오톡 공지 등 실제 업무 산출물에서 확인.

## MARKET

시장조사나 경쟁 서비스에서 확인.

## SOURCE

기존 제품의 Source나 구현 Artifact에서 직접 확인.

`HYPOTHESIS`는 Evidence Type이 아니라 Research / Product State다.

---

# 4. Evidence Strength

가능하면 Evidence의 강도를 구분한다.

### WEAK

개별 의견이나 단일 사례.

### MODERATE

복수 사례에서 유사한 현상 발견.

### STRONG

여러 역할과 여러 Event에서 반복적으로 확인.

### VALIDATED

실제 Product Test 또는 Pilot을 통해 문제 및 해결 효과 확인.

---

# 5. Research 대상 Role

각 역할의 관점이 다르므로 구분해서 조사한다.

## Pastor / Ministry Leader

관심 가능 영역:

- 전체 진행 상황
- 참가자 Care
- Risk
- 개인정보
- 사역 목적
- 보고
- 담당자 Coordination

## Event Owner / Chair

관심 가능 영역:

- 전체 준비 현황
- 담당자
- 일정
- 의사결정
- 누락
- 커뮤니케이션
- 진행률

## Operator / Staff

관심 가능 영역:

- 반복 업무
- Spreadsheet
- 명단
- 수정
- 현장 처리
- 정보 확인
- 전달

## Team / Group Leader

관심 가능 영역:

- 담당 참가자
- 연락
- 공지
- 상태 확인
- 현장 Coordination

## Participant

관심 가능 영역:

- 신청
- 일정
- 준비물
- 이동
- 결제
- 자신의 그룹
- 변경사항
- 문의

---

# 6. Event Type Research

최소 다음 Event Category의 차이를 조사한다.

## Retreat

예:

- 여름수련회
- 겨울수련회

## Vision Trip / Mission

예:

- 비전트립
- 해외 단기선교
- 국내선교

## Outreach

지역 및 사역 중심 Event.

## Bible School / Camp

어린이·학생 및 보호자 관련 Workflow가 존재할 가능성이 있다.

## Leadership / Small Event

예:

- 임원 MT
- 워크숍
- 리더십 캠프

---

# 7. Research Dimension

각 Event를 조사할 때 기능부터 묻지 않는다.

아래 Workflow를 따라 조사한다.

## Before Event

- Event 기획
- 예산
- 장소
- 담당자
- 참가 신청
- 참가비
- 참가자 정보
- 교통
- 숙소
- 팀 구성
- 물품
- 프로그램
- 공지
- 문서
- 준비 진행률

## Immediately Before

- 최종 명단
- 취소
- 추가 신청
- 입금 확인
- 배정 변경
- 준비물
- 담당자 확인

## Event Day

- 출발
- 체크인
- 현장 등록
- 인원 확인
- 일정
- 차량
- 방
- 식사
- 프로그램
- 돌발상황
- 공지 변경
- 참가자 Care

## After Event

- 귀가
- 정산
- 물품
- 설문
- 피드백
- 자료 정리
- 개인정보
- 회고
- 인수인계

---

# 8. 초기 Experience-Based Findings

> 아래 내용은 사용자의 실제 경험에서 출발한 초기 Input이다.
>
> 시장 전체에 일반화하지 않는다.

## EXP-001 — 정보 분산

**Evidence:** EXPERIENCE  
**Strength:** WEAK → 추가 조사 필요

Event 준비 과정에서 정보와 문서가 여러 도구에 흩어질 수 있다.

예:

- KakaoTalk
- Spreadsheet
- Docs
- PDF
- 개인 파일

### Research Question

다른 교회에서도 이 문제가 반복되는가?

---

## EXP-002 — 반복 문의

**Evidence:** EXPERIENCE  
**Strength:** WEAK → 추가 조사 필요

참가자가 운영자에게 직접 문의해야 하는 정보가 많을 수 있다.

### Research Question

가장 많이 반복되는 문의는 무엇인가?

이 문의를 처리하는 데 실제로 어느 정도 시간이 소비되는가?

---

## EXP-003 — Spreadsheet 중심 운영

**Evidence:** EXPERIENCE  
**Strength:** WEAK → 추가 조사 필요

Event 운영에서 Google Sheets / Excel이 핵심 도구로 사용될 가능성이 높다.

### Research Questions

- 어떤 업무를 Spreadsheet로 처리하는가?
- 가장 복잡한 Sheet는 무엇인가?
- 누가 관리하는가?
- 동시에 몇 명이 수정하는가?
- 어떤 오류가 발생하는가?
- Spreadsheet를 계속 선호하는 이유는 무엇인가?

---

## EXP-004 — 담당자 중심 정보

**Evidence:** EXPERIENCE  
**Strength:** WEAK → 추가 조사 필요

특정 담당자가 정보를 사실상 독점하는 상황이 발생할 수 있다.

### Research Questions

- 담당자가 부재하면 어떤 문제가 발생하는가?
- 업무 인수인계는 어떻게 이루어지는가?
- 이전 Event 자료는 다음 해에 얼마나 재사용되는가?

---

## EXP-005 — Event 당일 운영 혼란

**Evidence:** EXPERIENCE  
**Strength:** WEAK → 추가 조사 필요

행사 당일에는 일정 변경, 인원 변경, 등록 지연 등 예상하지 못한 상황이 발생할 수 있다.

### Research Question

현장에서 가장 자주 발생하는 돌발 상황은 무엇인가?

현재는 어떻게 해결하는가?

---

# 9. Initial Product Hypotheses

## HYP-001 — Single Source of Truth

### Hypothesis

하나의 Event 운영 정보를 구조적으로 모으면 운영 오류와 반복 확인을 줄일 수 있다.

### Need to Validate

- 정보 분산이 실제로 얼마나 큰 문제인가?
- 중앙화하면 새로운 입력 부담이 생기지는 않는가?
- KakaoTalk + Sheets보다 실제로 편한가?

---

## HYP-002 — Participant Self-Service

### Hypothesis

참가자가 자신의 정보를 직접 확인할 수 있으면 반복 문의가 감소한다.

### Example

- 일정
- 준비물
- 차량
- 그룹
- 결제 상태
- 개인 안내

### Metric Candidate

반복 문의 감소율.

---

## HYP-003 — Workflow-specific SaaS

### Hypothesis

범용 Spreadsheet보다 Event Workflow에 맞춘 Software가 운영 비용을 의미 있게 줄일 수 있다.

### Critical Question

그 감소량이 제품 사용료와 Learning Cost보다 큰가?

---

## HYP-004 — Cross-event Platform Core

### Hypothesis

서로 다른 Event Type에서도 일부 Operations Problem이 반복될 가능성이 있다. 다만 Problem의 발생 여부와 Severity는 Event Type 자체보다 Operational Characteristics에 의해 증폭되거나 완화될 수 있다.

### Need to Identify

- 서로 다른 Event에서 실제로 반복되는 Operations Problem은 무엇인가?
- 어떤 Operational Characteristics가 각 Problem을 증폭하거나 완화하는가?
- 공통으로 보이는 Workflow가 실제 공통 Job인지, 표면적으로 유사한 별개 Workflow인지?
- 어떤 차이는 Event Type보다 규모, 참여자 구성, 외부 Partner, Risk, Recovery 조건에서 발생하는가?

Platform Core의 구체적인 내용은 Research 후 Product Decision 단계에서 판단한다.

---

## HYP-005 — Reusability / Institutional Memory

### Hypothesis

이전 Event 정보와 운영 구조를 다음 Event에 재사용할 수 있다면 준비 비용이 감소한다.

### Research Question

실제 교회들은 이전 Event 자료를 얼마나 재사용하는가?

재사용이 어려운 이유는 무엇인가?

---

## HYP-006 — Commercial Willingness to Pay

### Hypothesis

운영 복잡도가 충분히 높은 교회나 Event에서는 전용 SaaS 비용을 지불할 의향이 존재한다.

### High-risk Hypothesis

제품 사업성에 직접적인 영향을 미치므로 반드시 별도 검증한다.

---

# 10. Survey Research Plan

설문은 기능 투표가 아니라 **Problem Discovery**를 목적으로 한다.

## Target Respondents

가능하면 다음을 분리한다.

- 목회자
- 행사 총괄
- 준비팀
- 일반 STAFF
- 조장/팀장
- 일반 참가자

또한 경험 Event를 기록한다.

예:

- 수련회
- 비전트립
- 단기선교
- 아웃리치
- 성경학교
- 캠프
- 워크숍

---

# 11. Survey에서 확인할 영역

## Background

- 최근 몇 년간 참여한 Event
- 역할
- 규모
- 준비 기간
- 운영 인원

## Current Tools

실제 사용한 도구.

## Workflow

어떤 방식으로 준비했는가?

## Pain

가장 힘들었던 작업.

## Frequency

몇 번 발생했는가?

## Severity

얼마나 큰 문제였는가?

## Failure

실제 사고나 누락이 있었는가?

## Communication

사람에게 물어봐야 했던 정보.

## Manual Work

반복 작업.

## After Event

자료와 정보가 어떻게 정리됐는가?

---

# 12. Interview Principle

Interview에서는 "필요한 기능"보다 **최근 실제 사례**를 깊게 파고든다.

좋은 질문:

> 최근 준비했던 Event 하나만 떠올려주세요.

> 준비 시작부터 끝날 때까지 어떤 일을 하셨나요?

> 가장 시간을 많이 쓴 작업이 뭐였나요?

> 가장 짜증났던 작업은 뭐였나요?

> 실수가 났던 적이 있나요?

> 그때 어떤 도구를 사용했나요?

> 다른 사람에게 정보를 몇 번 정도 요청했나요?

> 행사 당일 가장 정신없었던 순간은 언제였나요?

> Event가 끝난 후 자료는 어디에 남았나요?

피해야 할 질문:

> 이런 기능 있으면 좋겠죠?

> 이런 앱이 있으면 쓰시겠어요?

---

# 13. Artifact Research

가능하다면 실제 업무 산출물을 수집하거나 구조를 분석한다.

예:

- 참가자 Spreadsheet
- 차량 배정표
- 숙소 배정표
- 일정표
- 물품표
- 역할 분담표
- 예산표
- 참가 신청 Form
- 공지문
- 준비팀 Task List

목적은 자료를 복제하는 것이 아니다.

다음을 찾는다.

- 반복되는 Entity
- 반복되는 Workflow
- 중복 입력
- 수동 Join
- 정보 이동
- 오류 가능 지점
- 사람이 판단해야 하는 지점

---

# 14. Research Repository Format

새로운 Research Finding은 다음 형태를 권장한다.

## RES-XXX — Finding Title

**Date:** YYYY-MM-DD  
**Event Type:**  
**Role:**  
**Evidence Type:**  
**Strength:** WEAK / MODERATE / STRONG / VALIDATED

### Observation

무엇을 발견했는가?

### Context

어떤 상황에서 발생했는가?

### Current Workflow

현재 어떻게 처리하고 있는가?

### Pain

무엇이 문제인가?

### Impact

시간 / 오류 / 스트레스 / 비용 등에 어떤 영향을 주는가?

### Quote

필요한 경우 짧은 사용자 발언.

### Product Implication

제품에 어떤 의미가 있을 가능성이 있는가?

### Caveat

일반화하기 어려운 이유 또는 추가 검증 필요사항.

---

# 15. Hypothesis Validation Format

## HYP-XXX — Hypothesis

### Statement

우리가 믿고 있는 것은 무엇인가?

### Why We Believe It

현재 Evidence.

### Risk

틀렸을 경우 제품에 미치는 영향.

### Validation Method

- Interview
- Survey
- Prototype
- Concierge Test
- Pilot
- Usage Analytics

### Success Signal

어떤 결과가 나오면 Hypothesis를 지지하는가?

### Failure Signal

어떤 결과가 나오면 Hypothesis를 폐기하거나 변경해야 하는가?

### Status

HYPOTHESIS / RESEARCHED / VALIDATED / REJECTED

---

# 16. Research Priority

현재 Research Priority는 다음 순서로 본다.

## P0 — Problem Validation

실제 문제가 무엇인지.

## P0 — Operator Workflow

Event가 실제로 어떻게 준비되는지.

## P0 — Cross-event Commonality

Event 종류가 달라도 반복되는 Operations가 무엇인지.

## P1 — Participant Experience

어떤 정보 접근 문제가 있는지.

## P1 — Buyer / Willingness to Pay

누가 왜 비용을 지불할지.

## P1 — Competitor / Alternative

현재 무엇으로 해결하는지.

## P2 — Detailed Feature Preference

Feature Preference는 Problem이 확인된 후 조사한다.

---

# 17. Research와 화면설계 연결

Research 결과를 기다린 뒤 처음부터 UI를 만드는 방식만 사용하지 않는다.

초기 Concept Screen을 활용해 다음을 조사할 수 있다.

- 사용자 Mental Model
- 정보 중요도
- Workflow
- 용어
- Navigation
- 실제로 필요한 Action
- 불필요한 기능

단,

> 사용자가 화면을 좋아한다 = Problem이 검증됐다

라고 판단하지 않는다.

---

# 18. Research 결과가 Product로 넘어가는 조건

Research Finding 하나만으로 Feature를 확정하지 않는다.

가능하면 다음 순서를 따른다.

HYPOTHESIS  
→ Evidence 발견  
→ RESEARCHED  
→ 반복 Evidence  
→ Solution Hypothesis  
→ UX / Prototype Test  
→ VALIDATED  
→ Product Decision  
→ CONFIRMED

모든 항목이 반드시 동일 절차를 거칠 필요는 없지만 중요한 Product Decision일수록 근거 수준을 높인다.

---

# 19. 현재 Research Backlog

## Completed / Current Evidence Base

- Retreat Product Audit — Accessible UI
- Retreat Source-backed Second Pass
- Retreat Experience Reconciliation 및 RES-001~RES-011
- 13-Year Cross-event Experience Review 및 RES-012~RES-021
- Event Operational Complexity Dimensions v0.1
- Event Operational Complexity Dimensions v0.2

## Current Priority

- Problem Cluster Synthesis
- Cross-event Problem Severity 비교
- Software Need / Human Recoverability 해석
- UX Hypothesis 후보 선별
- Alternative / Competitive Research
- 도움이 되는 범위의 Operational Artifact Research

## Later Validation

- Independent Interview / Survey
- Buyer Research
- Willingness to Pay
- Pilot
- Commercial Validation

외부 Interview와 Survey는 폐기하지 않지만 모든 다음 작업의 선행조건으로 고정하지 않는다. 현재 Evidence의 약한 지점과 의사결정 위험에 맞춰 필요한 시점에 수행한다.

---

# 20. 다음 Research 질문

가장 먼저 답해야 할 질문:

1. Event 준비에서 가장 많은 시간이 들어가는 업무는 무엇인가?
2. 가장 많은 커뮤니케이션이 발생하는 업무는 무엇인가?
3. 가장 자주 실수가 발생하는 업무는 무엇인가?
4. 가장 사람의 기억에 의존하는 업무는 무엇인가?
5. Spreadsheet에서 가장 복잡하게 관리되는 정보는 무엇인가?
6. Event Type이 달라도 반복되는 Workflow는 무엇인가?
7. 참가자가 가장 자주 물어보는 정보는 무엇인가?
8. 이전 Event의 정보는 다음 Event에 얼마나 재사용되는가?
9. 누가 Software 구매를 결정하는가?
10. 어떤 수준의 문제라면 실제 비용을 지불할 것인가?

---

# 21. Research North Star

Research의 목적은 기능 아이디어를 많이 얻는 것이 아니다.

최종적으로 알아내야 하는 것은 이것이다.

> **"어떤 Event 운영 문제를 해결하면 사용자가 기존 방식으로 돌아가고 싶지 않을 정도의 가치를 만들 수 있는가?"**

---

# 22. Research Findings — Retreat v0.9 Audit and Experience Review

> 아래 Finding은 최근 Retreat의 상세 운영 경험을 중심으로, 필요한 경우 과거 여러 Retreat 준비 경험과 Retreat v0.9 Source-backed Audit에서 확보한 Evidence를 함께 정리한 것이다.
>
> 모든 Finding이 여러 Retreat에서 동일하게 반복됐다는 뜻은 아니다. `RESEARCHED`는 해당 사례에서 Evidence가 발견됐다는 뜻이며, 다른 교회나 Event Type에도 동일하게 적용된다는 의미가 아니다. 각 Product Implication은 별도로 검증해야 하는 `HYPOTHESIS`다.

## RES-001 — Participant Management is primarily Current State Management

**Date:** 2026-08-26  
**Event Type:** Retreat  
**Role:** Pastor / Event Owner / Administration / Accounting Operator  
**Evidence Type:** EXPERIENCE / SOURCE  
**Strength:** MODERATE

### Observation

실제 Retreat 운영에서 참가자 현황은 주로 Spreadsheet로 관리했다. 참가자 명단을 반복적으로 확인한 주체는 Event마다 조금씩 달랐지만 대체로 목회자, 회장, 행정·회계 담당이었다.

이들이 실제로 알고자 했던 것은 단순한 참가자 인적사항보다 다음과 같이 계속 변하는 운영 상태였다.

- 신청 여부
- 입금 여부
- 조 배정 여부와 현재 조
- 전체/부분 참석과 부분참석 시점
- 도착 시점과 교통수단
- 실제 이동 및 도착 여부
- 취소와 각종 변경 여부

Source-backed Audit에서도 참가자 등록정보가 Participant List, Fee Roster, Group Assignment, Check-in 등 여러 운영 화면의 기반으로 재사용되는 것이 확인됐다.

### Context

Retreat 준비기간부터 Event 당일까지 신청, 결제, 참석 범위, 배정, 이동, 도착 상태가 연속해서 바뀌었다.

### Current Workflow

```text
Participant Registration / Change
→ 담당자가 Spreadsheet 또는 운영 화면 갱신
→ 역할별로 명단·입금·조편성·Check-in 상태 확인
→ 추가 변경 발생 시 다시 갱신·확인
```

### Pain

정적인 명단만으로는 현재 누구에게 어떤 확인이나 후속조치가 필요한지 판단하기 어렵다.

### Impact

운영자는 여러 상태를 반복적으로 대조해야 하며, 최신 상태가 반영되지 않으면 연락·배정·현장 처리에서 오류가 발생할 수 있다.

### Product Implication

**HYPOTHESIS:** Participant Management의 핵심 Job은 단순 명단 저장보다 다음에 가까울 가능성이 있다.

> Event 동안 계속 변하는 Participant Operational Current State를 파악하는 것.

### Caveat

한 Retreat 경험과 해당 Retreat를 위해 구현된 v0.9 Source에 근거한다. 다른 Event Type에서도 동일한 Job이 핵심인지는 검증하지 않았다.

### Status

RESEARCHED — Retreat 사례에 한정. Cross-event 검증 필요.

---

## RES-002 — Information Ownership / Access Bottleneck

**Date:** 2026-08-26  
**Event Type:** Retreat  
**Role:** Event Owner / Administration Operator / Other Operators  
**Evidence Type:** EXPERIENCE  
**Strength:** WEAK

### Observation

최근 Retreat에는 신뢰할 수 있는 기준 Spreadsheet가 있었지만 담당자가 이를 충분히 공유하지 않아 다른 운영진이 필요한 참가자 정보를 확인하기 어려웠다. 과거 Retreat에서도 참가자 정보 열람 주체는 담당자 성향과 실제 업무분장에 따라 달라졌다.

### Context

Spreadsheet의 접근통제는 보통 읽기·쓰기 수준으로 거칠었고, 정보의 실질적 소유권이 특정 담당자에게 집중됐다.

### Current Workflow

다른 운영자가 필요한 정보를 직접 조회하지 못하면 기준 문서를 가진 담당자에게 확인을 요청했다.

### Pain

신뢰할 수 있는 기준 정보가 존재해도 필요한 운영자에게 적시에 도달하지 않았다.

### Impact

확인 지연, 담당자 의존, 중복 문의가 발생하고 현장 판단이 늦어질 수 있다.

### Product Implication

**HYPOTHESIS:** Single Source of Truth의 존재만으로 충분하지 않을 수 있다.

> 필요한 운영자가 업무에 필요한 Current State에는 접근할 수 있으면서, 개인정보와 민감정보는 Minimum Necessary Access 원칙에 따라 제한할 수 있어야 할 가능성이 있다.

### Caveat

구체적인 Role/Permission 모델을 제안하거나 확정하는 Finding이 아니다. 실제 역할별 정보 필요성과 개인정보 위험을 별도로 조사해야 한다.

### Status

RESEARCHED — 단일 조직의 경험. 역할별 Access Need 추가 Research 필요.

---

## RES-003 — Operational Knowledge Silo

**Date:** 2026-08-26  
**Event Type:** Retreat  
**Role:** Operator / Staff / Participant  
**Evidence Type:** EXPERIENCE  
**Strength:** MODERATE

### Observation

업무 담당자는 비교적 명확했지만, 각 담당자가 다른 영역의 기본 운영정보를 알지 못하는 사례가 반복됐다.

실제 참가자 질문 사례:

- “이 프로그램이 뭐 하는 거예요?” → “제가 안 짜서 몰라요.”
- “제 방이 어디예요?” → “전 몰라요.”
- “간식 언제 줘요?” → “간식팀 아니라 몰라요.”

정보는 Event 조직 안에 존재했지만 담당 영역 안에 머물러 참가자와 다른 Staff가 쉽게 접근하지 못했다.

### Context

프로그램, 숙소, 간식 등 업무별 책임과 정보가 분리된 운영조직에서 발생했다.

### Current Workflow

정보를 모르는 Staff나 참가자는 해당 담당자를 다시 찾거나 다른 사람에게 재질문했다.

### Pain

업무분장이 명확해도 결과정보의 조회 경로가 함께 마련되지 않으면 조직 전체의 안내 역량이 낮아진다.

### Impact

참가자의 반복 문의와 담당자 탐색이 늘고, 잘못된 답변 또는 답변 지연이 발생할 수 있다.

### Product Implication

**HYPOTHESIS:** 업무의 책임·수정 권한과 결과정보의 조회·소비 범위를 분리할 필요가 있을 수 있다.

예를 들어 숙소 배정은 숙소 담당자가 수행하더라도 참가자는 자신의 방을 확인하고, 필요한 Staff는 기본 안내를 확인할 수 있어야 할 가능성이 있다.

### Caveat

모든 정보를 모든 Staff에게 공개한다는 의미가 아니다. 개인정보, 민감정보, 업무상 필요성을 함께 검증해야 한다.

### Status

RESEARCHED — 최근 Retreat에서 반복 관찰. 다른 조직구조에서의 발생 여부 확인 필요.

---

## RES-004 — Message Stream Loss / Relay-dependent Communication

**Date:** 2026-08-26  
**Event Type:** Retreat  
**Role:** Event Owner / Operator / Group Leader / Participant  
**Evidence Type:** EXPERIENCE / SOURCE  
**Strength:** MODERATE

### Observation

실제 중요한 안내와 변경사항은 주로 KakaoTalk 공지방에서 전달됐다. 그러나 운영진이 업무 중이라 즉시 확인하지 못하거나 대화량이 많아 중요한 공지가 묻혔고, 변경 내용을 놓치는 사례가 반복됐다.

조장이 내용을 다시 조원에게 전달하는 과정에서는 누락 또는 지연이 발생했고, 서로 다른 사람이 서로 다른 최신 정보를 알고 있는 상황도 생겼다.

Source-backed Audit에서는 v0.9에 Announcement / Schedule 관리자 Surface가 있었지만 작성 → 공개 → Participant Consumption까지 이어지는 end-to-end Communication Workflow는 확인되지 않았다.

### Current Workflow

```text
운영진 공지방에 안내·변경 게시
→ 운영진이 메시지를 확인
→ 조장이 조원에게 재전달
→ 참가자가 전달받은 내용을 기준으로 행동
```

### Pain

대화 Stream에 현재 유효한 운영정보가 섞이면 중요한 변경사항이 묻히고, 전달 단계마다 누락·지연·Version 차이가 생길 수 있다.

### Impact

반복 확인과 재공지 비용이 늘고, 참가자 또는 운영자가 오래된 정보를 기준으로 움직일 수 있다.

### Product Implication

**HYPOTHESIS:** Broadcast와 Current State는 서로 다른 Problem일 수 있다.

예:

- Broadcast: “간식 시간이 15:00에서 15:30으로 변경되었습니다.”
- Current State: “현재 간식 배부 시간: 15:30”

대화는 기존 커뮤니케이션 도구에서 계속 진행하더라도, 현재 유효한 정보는 메시지 검색이나 사람의 기억에만 의존하지 않는 방식이 필요할 수 있다.

### Caveat

KakaoTalk을 대체하는 제품을 제안하는 Finding이 아니다. 기존 도구와 함께 사용할 때 어떤 정보만 구조화할 가치가 있는지 검증해야 한다. v0.9 Source는 구현 의도와 미완성 경계를 보여줄 뿐 실제 사용 효과를 입증하지 않는다.

### Status

RESEARCHED — Retreat 경험에 한정. Communication 도구별 역할과 실패 빈도 추가 조사 필요.

---

## RES-005 — Assignment is a Living Operational State

**Date:** 2026-08-26  
**Event Type:** Retreat  
**Role:** Assignment Operator / Group Leader / Participant  
**Evidence Type:** EXPERIENCE / SOURCE  
**Strength:** MODERATE

### Observation

조편성과 숙소 배정의 최초 결과는 파일 또는 문서로 조장이나 참가자에게 전달됐다. 이후 취소, 부분참석 변경, 인원 변동, 조 변경, 기타 상태변경이 발생하면 사람이 문서를 다시 수정하고 관련자에게 연락했다.

Source-backed Audit에서는 v0.9 조편성 화면이 참가자 상태를 기반으로 배정을 반복 조정하도록 구현된 것이 확인됐다.

### Current Workflow

```text
초기 편성
→ 문서 전달
→ 참가자 취소·변경
→ 수동 재조정
→ 조장에게 다시 연락
→ 필요하면 다른 조까지 연쇄 조정
```

숙소 배정도 유사한 변경·재전달 패턴을 보였다.

### Pain

정적 문서를 배정 결과의 기준으로 사용할 경우 변경이 생길 때마다 문서 수정과 사람 간 전파가 필요하다.

### Impact

변경 전파 비용이 발생하고, 관련자가 서로 다른 Version의 배정 결과를 볼 수 있다.

### Product Implication

**HYPOTHESIS:** Event의 중요한 Assignment는 한 번 생성되는 정적 문서보다 준비기간 동안 지속적으로 변경되는 Operational State일 가능성이 있다.

### Caveat

Group, Accommodation, Transportation을 하나의 Domain으로 합친다는 뜻이 아니다. 어떤 Assignment에 이 특성이 반복되는지는 Event별로 검증해야 한다.

### Status

RESEARCHED — Retreat의 Group 및 Accommodation 사례. Cross-event 검증 필요.

---

## RES-006 — Serial Check-in Bottleneck

**Date:** 2026-08-26  
**Event Type:** Retreat  
**Role:** Registration Operator / Participant  
**Evidence Type:** EXPERIENCE / SOURCE  
**Strength:** MODERATE

### Observation

최근 Retreat의 현장 등록은 사실상 한 담당자에게 집중됐다. 그 담당자가 기준 문서를 충분히 공유하지 않은 상태에서 참가자를 한 명씩 수기로 확인했다.

한 참가자에게 예외가 발생하면 다음과 같은 직렬 병목이 생겼다.

```text
예외 참가자 처리 지연
→ 그 뒤 정상 참가자 전체 대기
```

참가자들이 등록을 기다리며 상당한 시간을 보냈다.

Source-backed Audit에서는 v0.9이 QR Check-in, 이름 검색 기반 Manual Check-in, 반복적인 Next Participant 처리를 구현하려 한 것이 확인됐다. 다만 최근 실제 Retreat에서는 QR Check-in을 사용하지 못했다.

### Pain

한 개의 처리 Queue에서 예외와 정상 건을 동일하게 직렬 처리해, 예외 한 건이 전체 처리량을 떨어뜨렸다.

### Impact

대기시간이 길어지고 Event 시작 전 참가자 경험과 현장 운영 일정에 영향을 줬다.

### Product Implication

**HYPOTHESIS:** Check-in에서는 하나의 처리방법을 강제하기보다 QR Fast Path, Manual Search Fast Path, Exception Handling을 분리하거나 병렬 운영하는 접근이 유효할 수 있다.

핵심 Problem은 QR의 부재 자체보다 다음에 있었다.

> Exception 한 건이 전체 Normal Queue의 처리량을 떨어뜨리는 직렬 처리 구조.

### Caveat

구체적인 Check-in Solution은 확정하지 않는다. 도착량, 평균 처리시간, 예외 유형, 현장 인력과 기기 조건을 추가 조사해야 한다.

### Status

RESEARCHED — 최근 Retreat 현장 경험과 v0.9 구현 의도에 근거. Solution 검증 전.

---

## RES-007 — Group Formation is a Multi-constraint Human Decision

**Date:** 2026-08-26  
**Event Type:** Retreat  
**Role:** Pastor / Event Owner / Group Formation Operator  
**Evidence Type:** EXPERIENCE / SOURCE  
**Strength:** MODERATE

### Observation

실제 조편성은 단순 인원 균등분배가 아니었다. 다음 요소를 함께 고려했다.

- 성별 및 구성 균형
- 전체/부분참석 여부와 실제 참석 시간
- 기존 공동체 관계
- 신규 참가자와 Care 필요
- 친밀 관계
- 형제·자매·남매 등 가족관계
- 과거 연애관계
- 갈등 또는 서로 불편한 관계
- 특정 조장과 참가자의 적합성
- 다른 조와의 전체 균형

Source-backed Audit에서도 v0.9 조편성 화면은 성별, 신규 여부, 기존 공동체, 참석시간, 조별 인원, 시간대별 참가 가능 인원을 함께 보여주고 Drag & Drop으로 반복 조정하도록 구현돼 있었다.

### Context

대규모 성인 공동체 Retreat에서 여러 조의 구성과 실제 참석 가능 인원을 동시에 조정했다.

### Pain

정형화된 참가정보만으로는 관계와 Care 맥락을 포함한 배정 판단을 완료하기 어렵다.

### Impact

소수 의사결정자가 여러 조건과 전체 균형을 반복적으로 비교해야 하며, 배정 변경의 비용도 커진다.

### Product Implication

**HYPOTHESIS:** Group Formation은 단순 자동배정 문제라기보다 복잡한 인간 판단을 Software가 지원하는 Decision Support Workflow에 가까울 가능성이 있다.

### Caveat

AI 자동조편성이나 Algorithmic Assignment를 Product Requirement로 결정하지 않는다. Source에 표시된 조건이 실제 판단기준 전체이거나 중요도 순서를 나타낸다고 볼 수 없다.

### Status

RESEARCHED — 한 Retreat의 실제 의사결정과 v0.9 Source에 근거. 다른 규모·연령·Event에서 검증 필요.

---

## RES-008 — Group Formation depends on Concentrated Tacit Knowledge

**Date:** 2026-08-26  
**Event Type:** Retreat  
**Role:** Pastor / Ministry Leader / Event Owner  
**Evidence Type:** EXPERIENCE  
**Strength:** WEAK

### Observation

실제 관계 맥락을 주로 알고 있던 사람은 목사, 전도사, 회장 정도였다. 조편성 과정에서는 특히 목사와 회장이 참가자 관계에 관해 대화하며 조합을 반복 수정했다.

이 판단정보는 Spreadsheet나 참가신청 데이터만으로 알 수 없는 Tacit Knowledge였다.

### Pain

운영에 중요한 판단정보가 소수 사람의 머릿속에 집중되고, 담당자 변경 시 맥락이 사라질 가능성이 있다.

### Impact

일부 핵심 인물의 시간과 참여에 조편성 품질 및 진행속도가 의존할 수 있으며, 다음 Event로 판단 맥락을 넘기기 어렵다.

### Privacy Conflict

다음과 같은 정보를 단순한 시스템 데이터로 저장하는 것은 위험할 수 있다.

- 과거 연애관계
- 갈등관계
- 개인적 불편함
- 민감한 Care 맥락

### Open Product Question

> 운영에 필요한 Tacit Knowledge를 어디까지 조직의 운영 자산으로 보존해야 하고, 어디부터 사람의 판단 영역으로 남겨야 하는가?

이는 Operational Continuity와 Privacy가 충돌하는 Research Question이다.

### Product Implication

Solution을 제안하지 않는다. 우선 어떤 판단 맥락이 실제로 반복 사용되는지, 누가 알아야 하는지, 저장 없이도 판단을 지원할 수 있는지 조사해야 한다.

### Caveat

민감한 관계정보의 수집·저장·공유를 정당화하는 Finding이 아니다. DEC-019와 DEC-020의 Privacy 원칙을 우선한다.

### Status

RESEARCHED — 단일 Retreat 경험. Privacy-sensitive Open Question.

---

## RES-009 — Manual Fee Reconciliation

**Date:** 2026-08-26  
**Event Type:** Retreat  
**Role:** Administration / Accounting Operator  
**Evidence Type:** EXPERIENCE / SOURCE  
**Strength:** WEAK

### Observation

입금 확인은 행정·회계 담당자가 Banking App을 직접 확인한 뒤 Spreadsheet에 입금 완료 여부를 표시하는 방식이었다.

Source-backed Audit에서는 v0.9에 Fee Roster, paid/unpaid 상태, 변경 이력이 구현돼 있었다.

### Current Workflow

```text
Banking App
→ 사람이 입금 확인
→ 참가자와 대조
→ Spreadsheet / System 상태 변경
```

### Pain

외부 금융정보와 Event 참가자 상태를 사람이 수동으로 대조하고 옮겨야 한다.

### Impact

입금 확인과 상태 반영에 Manual Reconciliation Cost가 발생할 수 있다.

### Product Implication

**HYPOTHESIS:** 외부 금융정보와 Event 참가자 상태 사이의 Manual Reconciliation Cost가 제품이 다룰 가치가 있는 Problem일 수 있다.

### Caveat

다음은 아직 `UNKNOWN`이다.

- 입금자명 불일치 빈도
- 환불 처리
- 여러 명 일괄입금
- 입금 확인 문의 빈도
- 실제 소요시간과 오류율
- 자동화 필요 수준
- v0.9 Fee 화면의 실제 사용 여부

따라서 Payment Automation이나 Integration을 Product Requirement로 확정하지 않는다.

### Status

RESEARCHED — 단일 Current Workflow와 v0.9 구현 의도 확인. 비용·빈도·오류율·자동화 가치 UNKNOWN.

---

## RES-010 — Transportation Complexity Observed, Workflow Insufficiently Reconstructed

**Date:** 2026-08-26  
**Event Type:** Retreat  
**Role:** Transportation Operator / Participant  
**Evidence Type:** EXPERIENCE / SOURCE  
**Strength:** WEAK

### Observation

실제 Retreat에서 교통 운영이 매우 복잡했던 경험은 있으나, 현재 기억만으로 담당자, 배차, 카풀 매칭, 변경 전파 등의 Workflow를 정확하게 복원하기 어렵다.

Source-backed Audit에서는 v0.9이 다음 정보를 상세히 수집하도록 구현한 것이 확인됐다.

- Inbound / Outbound 분리
- 버스
- 자차
- 카풀 필요
- 카풀 제공
- 좌석 수
- 지역
- 경유 가능 정보

### Product Implication

현재 Source는 상세한 교통정보 수집 의도를 보여주지만, 실제 운영 Problem이나 필요한 Product Support를 확정할 근거로는 부족하다.

### Caveat

수집 필드가 많다는 사실은 해당 정보가 실제로 사용됐거나 운영 문제를 해결했다는 증거가 아니다.

### Status

UNKNOWN — 교통 담당자 Interview 또는 Artifact Research 필요.

---

## RES-011 — Operational Characteristics may influence Problem Severity more directly than Event Type

**Date:** 2026-08-26  
**Event Type:** Cross-event Comparison  
**Role:** Research / Product Analysis  
**Evidence Type:** EXPERIENCE  
**Strength:** MODERATE — longitudinal single-observer EXPERIENCE

### Observation

Retreat 경험을 다른 Event에 그대로 일반화하기 어렵다.

사용자가 이번 Longitudinal Review에서 구체적으로 복기한 일부 Vision Trip은 상대적으로 소수로 진행됐고, 구성원 간 직접 커뮤니케이션이 빠르며, 참가자 State 변화량도 대규모 Retreat보다 적었다. 따라서 이 사례들에서는 Retreat에서 심각했던 Message Relay, Check-in Queue, Participant Self-Service, 대규모 Assignment 문제가 상대적으로 약했다.

Bible School에서는 어린이·학생이 Participant이고 교사 또는 반 담당자가 인솔하므로, 학생 개인이 Event 정보를 직접 충분히 알고 움직여야 할 필요가 성인 Retreat보다 낮을 수 있다. 인간관계와 Participant Autonomy 구조도 다를 수 있다.

이후 13-Year Cross-event Experience Review에서 다음 대비가 추가로 확인됐다.

- 유사한 20~30명 규모여도 Vision Trip은 Team Readiness, External Partner, 해외 Logistics와 Sensitive Data 때문에 Leadership MT보다 복잡했다.
- 소규모 Vision Trip은 참가자 State가 비교적 안정적이었지만 비슷한 규모의 Outreach에서는 중간 추가 참가자가 반복됐다.
- Low Autonomy인 Bible School은 단순해진 것이 아니라 Teacher Supervision과 Attention Burden이 커졌다.
- 같은 Outreach 안에서도 현지 Partner Need에 따라 마을잔치, Bible School, 시설보수처럼 Work Structure가 달라졌다.

### Product Implication

**HYPOTHESIS:** Event 이름 자체보다 Participant Scale, Participant Autonomy, Change Frequency, Assignment Complexity 등 Operational Characteristics가 Software 필요성과 Problem Severity에 더 직접적으로 영향을 줄 수 있다.

### Research Consequence

다른 Event를 조사할 때 다음 질문만 묻지 않는다.

> “Retreat에도 있었던 Workflow인가?”

대신 다음을 함께 조사한다.

> “어떤 Event 특성 때문에 이 업무가 어려워졌거나 쉬워졌는가?”

### Caveat

Vision Trip과 Bible School에 대한 설명은 사용자의 과거 경험을 바탕으로 한 초기 비교 가설이다. 이번 Review에서 Vision Trip과 별개인 `Short-term Mission`을 독립 사례로 상세 복기하지 않았으므로, 장기 지원 Event Direction에 포함된다는 사실을 직접 조사된 Evidence로 해석하지 않는다. Event 규모, 조직, 지역, 참가자 구성에 따라 달라질 수 있다.

### Status

RESEARCHED — Longitudinal single-observer Cross-event EXPERIENCE가 가설을 지지함. Independent Interview / Survey 필요.

---

# 23. Research Findings — 13-Year Cross-event Experience Review

> 아래 Finding은 약 13년 동안 한 사용자가 여러 교회 Event에 참가하고 준비한 경험을 구조화한 Longitudinal EXPERIENCE Evidence다.
>
> 동일 관찰자에게서 여러 해와 여러 Event에 걸쳐 반복된 패턴은 `MODERATE — longitudinal single-observer EXPERIENCE`로 표시할 수 있다. 이는 독립된 여러 사용자나 다른 교회에서 검증됐다는 뜻이 아니며, 시장 전체의 `STRONG`, `VALIDATED`, `CONFIRMED` Evidence로 해석하지 않는다.

## RES-012 — Participant Scale alone is an insufficient predictor of Operational Complexity

**Date:** 2026-08-26  
**Event Type:** Vision Trip / Outreach / Leadership Event  
**Role:** Participant / Preparing Team Member / Program Operator  
**Evidence Type:** EXPERIENCE  
**Strength:** MODERATE — longitudinal single-observer EXPERIENCE

### Observation

약 18~30명 규모의 Vision Trip은 한 달 이상의 준비, 전문 역할 분화, Team Readiness, 해외 Logistics, Finance, Sensitive Data, External Partner Coordination을 포함했다. 반면 유사한 20~30명 규모의 Leadership MT는 조직과 역할에 익숙한 리더들이 참여해 장소, 식사, 강의, Activity 중심으로 비교적 단순하게 준비할 수 있었다.

또한 소규모 Vision Trip은 최종 참가자 State가 비교적 안정적이었던 반면, 20~40명 규모의 Outreach에서는 중간 추가 참가자가 여러 번 발생했다.

### Pain

Participant Count만 보면 소규모 Event 안에서 발생하는 준비업무, State 변화, Risk와 Coordination의 차이를 놓칠 수 있다.

### Product Implication

**HYPOTHESIS:** Participant Scale은 Complexity의 한 요소일 뿐 Software Need를 단독으로 설명하지 못한다. Scale, Change Frequency, Team Readiness, External Partner Dependency, Sensitive Information 등을 독립적으로 조사할 필요가 있다.

### Caveat

같은 사용자가 경험한 일부 Event 비교다. Event 규모별 임계값이나 다른 조직에서의 반복성은 확인하지 않았다.

### Status

RESEARCHED — RES-011을 지지하는 Cross-event EXPERIENCE. 외부 검증 필요.

---

## RES-013 — Vision Trip Participants also carry Preparation State

**Date:** 2026-08-26  
**Event Type:** Vision Trip  
**Role:** Participant / Team Leader / Program Operator  
**Evidence Type:** EXPERIENCE  
**Strength:** MODERATE — longitudinal single-observer EXPERIENCE

### Observation

세 차례 Vision Trip에서 참가자는 단순 Event Consumer가 아니라 준비팀 구성원이기도 했다. 각자는 프로그램, 공연, 언어, 현지교육, 물품, 사역 준비 등을 맡았고 정기모임, 연습, 기도회, Team Building에 참여했다.

### Current Workflow

```text
목회자 / Team Leader
→ Team 또는 개인에게 준비상태 확인
→ 보고받음
→ 미준비 항목 재요청 또는 다른 사람이 보완
```

### Pain

최종 참가자 명단이 안정적이어도 각 사람과 Team이 실제 역할을 수행할 준비가 됐는지는 별개의 운영 상태였다.

### Product Implication

**HYPOTHESIS:** Mission-type Event에서는 Participant Current State 외에 Team Readiness / Preparation State가 중요한 Operational State일 가능성이 있다.

### Caveat

구체적인 Task, Training, Practice 관리 기능을 제안하거나 Requirement로 확정하지 않는다. 어떤 Readiness 정보가 실제로 추적 가치가 있는지 조사해야 한다.

### Status

RESEARCHED — 세 차례 Vision Trip의 반복 경험. 다른 Mission Team 검증 필요.

---

## RES-014 — External Partner Coordination is an Operational Dependency

**Date:** 2026-08-26  
**Event Type:** Vision Trip / Outreach  
**Role:** Pastor / Team Leader / External Partner / Preparing Team  
**Evidence Type:** EXPERIENCE  
**Strength:** MODERATE — longitudinal single-observer EXPERIENCE

### Observation

Vision Trip에서는 현지 선교사, Outreach에서는 현지교회 목회자가 Local Context와 Need의 핵심 Source였다. 이들은 수용 인원, 예상 대상자, 일정, 현지 환경, 프로그램 요청, 시설, 교통, 현지 Need와 참가자 특이사항 등을 제공하거나 조정했다.

대표적인 정보 흐름은 다음과 같았다.

```text
External Partner
↕
목회자 / Team Leader
↕
한국 준비팀 / 파견팀
```

### Pain

내부 준비팀의 계획은 외부 Partner가 가진 정보, 자원, 승인과 현지 변화에 의존했다. Partner 정보가 늦거나 바뀌면 내부 준비에도 영향이 생길 수 있었다.

### Privacy Consideration

일부 Child Outreach에서는 보호자 연락처와 아이 특이사항을 현지 목회자가 보유하고, 파견팀이나 담당교사에는 필요한 정보만 전달했다. Single Source of Truth가 모든 민감정보를 중앙수집한다는 뜻은 아닐 수 있다.

### Product Implication

**HYPOTHESIS:** External Partner Dependency가 높은 Event는 내부 준비팀만으로 Workflow를 설명하기 어렵다. 정보 Source를 Partner에게 남겨두고 Minimum Necessary Information만 전달하는 방식도 Research 대상이어야 한다.

### Caveat

External Partner Portal, 계정, Collaboration Feature를 제안하지 않는다. Partner별 책임, 정보정확성, 접근권한과 실제 전달 실패를 추가 조사해야 한다.

### Status

RESEARCHED — Vision Trip 3회와 Outreach 사례에서 반복. 다른 교회·Partner 검증 필요.

---

## RES-015 — Human Recoverability moderates Software Need

**Date:** 2026-08-26  
**Event Type:** Retreat / Vision Trip / Outreach / Leadership Event  
**Role:** Event Owner / Operator / Participant  
**Evidence Type:** EXPERIENCE  
**Strength:** MODERATE — longitudinal single-observer EXPERIENCE

### Observation

유사한 운영 문제가 발생해도 사람이 복구하는 비용은 Event마다 달랐다.

```text
Outreach 물품 누락
→ 현지 마트에서 구매

Outreach 우천 변경
→ 목회자 즉석 결정·공지
→ 대체 프로그램 진행

Leadership MT 공지 누락
→ 옆 사람 또는 담당자에게 직접 확인

Retreat Check-in Exception
→ 전체 Normal Queue 정체
```

Vision Trip에서도 KakaoTalk 공지 미확인, 메시지·파일 탐색 문제가 있었지만 소수 Team은 직접 재질문, 전날 브리핑, 버스 공지 등으로 비교적 빠르게 복구했다.

### Impact

Problem의 존재와 Frequency가 비슷해도 Recovery에 필요한 시간, 사람, 위험과 downstream 변경량에 따라 실제 운영비용이 달라졌다.

### Product Implication

**HYPOTHESIS:** Feature Priority와 Software Need는 Failure Frequency뿐 아니라 Failure Impact, Change Propagation Cost, Human Recovery Cost를 함께 봐야 한다.

> 문제가 발생한다는 사실만으로 Software가 필요하다고 판단하지 않는다.

> 사람이 기존 방식으로 빠르고 안전하게 복구할 수 있는 Problem에 Software가 추가 운영 부담을 만들어서는 안 된다.

### Caveat

Human Recoverability를 정량 Score로 사용하지 않는다. 빠른 복구가 실제로 안전하고 지속가능했는지도 별도로 확인해야 한다.

### Status

RESEARCHED — Cross-event Negative Evidence 포함. Product Requirement 미확정.

---

## RES-016 — Formal Reporting does not guarantee Operational Memory

**Date:** 2026-08-26  
**Event Type:** Retreat / Vision Trip / Outreach  
**Role:** Pastor / Team Leader / Preparing Team / Participant  
**Evidence Type:** EXPERIENCE  
**Strength:** MODERATE — longitudinal single-observer EXPERIENCE

### Observation

Vision Trip과 Outreach가 끝난 뒤 영상, 간증, 발표, 사역보고, 결과보고, 정산은 남았다. 그러나 다음 Event 준비에 재사용할 수 있는 Operational Know-how는 충분히 남지 않아 이전 참가자나 목회자에게 “작년에 어떻게 했어요?”라고 다시 묻는 경우가 있었다.

### Important Distinction

```text
Event Record
= 무엇을 했는가

Operational Memory
= 왜 그렇게 했는가
  어떻게 준비했는가
  어디서 막혔는가
  무엇이 부족했는가
  다음에는 무엇을 다르게 해야 하는가
```

### Pain

공식 결과물은 Event의 의미와 결과를 전달하지만, 다음 준비팀이 판단과 시행착오를 재사용하는 데 필요한 맥락은 사람의 기억에 남는 경우가 많았다.

### Product Implication

**HYPOTHESIS:** 기존 HYP-005 Reusability / Institutional Memory는 Cross-event EXPERIENCE의 추가 지지를 받는다. 다만 어떤 지식을 구조화할 가치가 있는지, 기록 부담보다 재사용 가치가 큰지는 검증해야 한다.

### Caveat

모든 회고와 문서를 Product 안에 저장해야 한다는 뜻이 아니다. 기존 문서도구와 사람 간 인수인계가 더 효율적인 범위를 함께 조사해야 한다.

### Status

RESEARCHED — Cross-event 반복 경험. 재사용 빈도와 효과 UNKNOWN.

---

## RES-017 — Outreach Structure is Partner-Need Driven

**Date:** 2026-08-26  
**Event Type:** Outreach  
**Role:** Pastor / External Partner / Preparing Team / Operator  
**Evidence Type:** EXPERIENCE  
**Strength:** MODERATE — longitudinal single-observer EXPERIENCE

### Observation

동일한 `Outreach` 명칭 아래에서도 실제 Work Structure는 크게 달랐다.

- Taean: 어르신 가정 방문, 마을잔치, 음식, 공연과 지역 섬김
- Gimhae: 고려인 어린이 대상 Bible School 운영
- Cheorwon: 어린이 Bible School, 물놀이, 시설보수와 외벽 페인트 작업

각 Event의 준비조직과 물품, 전문성, 현장 진행은 현지교회가 전달한 Need에 따라 달라졌다.

### Product Implication

**HYPOTHESIS:** `Outreach`라는 Event Type만으로 필요한 Product Support를 결정하기 어렵다. External Partner Need와 실제 Work Structure, Participant와 Risk Context를 먼저 조사해야 한다.

### Caveat

세 사례 모두 한 사용자의 경험이며 Outreach 시장 전체를 대표하지 않는다. Event Type을 세부 Template이나 Feature Set으로 매핑하지 않는다.

### Status

RESEARCHED — 세 Outreach 사례 비교. RES-011을 추가 지지.

---

## RES-018 — Low Participant Autonomy redistributes Operational Burden

**Date:** 2026-08-26  
**Event Type:** Bible School / Children Event  
**Role:** Child Participant / Guardian / Teacher / Pastor / Staff  
**Evidence Type:** EXPERIENCE  
**Strength:** MODERATE — longitudinal single-observer EXPERIENCE

### Observation

어린 참가자는 Event 정보를 스스로 확인하고 행동할 필요가 상대적으로 낮았지만 그 책임은 사라지지 않았다. 목회자, 보호자, 반교사가 정보 전달, 이동, 출석, 식사, 프로그램, 취침, 건강과 안전을 대신 관리했다.

```text
Child Autonomy ↓
→ Guardian / Teacher Mediation ↑
→ Supervision Burden ↑
→ Operator Attention Cost ↑
```

특히 이동, 물놀이, 숙박, 취침에서는 단순히 “오늘 출석했는가?”보다 “지금 이 아이가 담당교사의 관리 범위 안에 있는가?”가 중요한 순간이 있었다. 아이를 직접 보느라 KakaoTalk이나 Mobile Screen을 확인할 Attention 자체가 부족한 경우도 있었다.

### Current Workflow

```text
목회자
↕
보호자
↕
반교사
↕
어린이
```

연령이 어릴수록 보호자와 교사가 주요 Information Consumer였고, 연령이 높아질수록 아이 본인의 Information Need 비중이 커졌다.

### Product Implication

**HYPOTHESIS:** Low Participant Autonomy를 Low Operational Complexity로 해석하면 안 된다. Participant-facing UX의 실제 사용자는 Participant, Guardian, Leader로 나뉠 수 있으며, Child Event에는 Attendance와 구분되는 Presence / Supervision Problem이 존재할 수 있다.

### Caveat

위치 Tracking이나 Continuous Monitoring Feature를 제안하지 않는다. 야간 불침번과 지속적 돌봄처럼 Software가 직접 해결하기 어려운 Human Staffing Problem도 명확히 존재한다.

### Status

RESEARCHED — 여러 연령부·여러 형태의 Bible School 경험. Safety Workflow 외부 검증 필요.

---

## RES-019 — Event Participation remains distinct from Church Membership

**Date:** 2026-08-26  
**Event Type:** Bible School / Children Event  
**Role:** Pastor / Teacher / Administration Operator / Guardian  
**Evidence Type:** EXPERIENCE  
**Strength:** MODERATE — longitudinal single-observer EXPERIENCE

### Observation

기존 Church Member 명단이 있어도 Bible School에서는 별도의 Event 신청을 다시 받았다.

그 이유에는 실제 참가 여부, Event용 반편성, 여러 예배부서 통합, 친구 초청자와 신규 참가자, 초청 관계처럼 상시 명단과 다른 Event Context가 포함됐다.

### Product Implication

**HYPOTHESIS:** Church Member Record와 Event Participation State는 운영상 동일한 개념으로 취급하기 어려울 수 있다.

### Caveat

Architecture, Entity, Account 또는 Data Synchronization 방식을 제안하지 않는다. 다른 교회의 기존 명단 품질과 Event 신청 Workflow를 추가 조사해야 한다.

### Status

RESEARCHED — 반복된 Bible School EXPERIENCE. Cross-organization 검증 필요.

---

## RES-020 — Operational Context Need can exceed Formal Responsibility

**Date:** 2026-08-26  
**Event Type:** Retreat / Bible School  
**Role:** Staff / Teacher / Participant  
**Evidence Type:** EXPERIENCE  
**Strength:** MODERATE — longitudinal single-observer EXPERIENCE

### Observation

Bible School 반교사는 자기 반의 4~6명을 직접 책임졌지만, 보호자 문의와 현장변경에 대응하려면 전체 일정, 다음 프로그램, 식사, 장소와 공지를 함께 알아야 했다.

이는 Retreat에서 업무 담당자가 자신의 영역 밖 기본정보를 몰라 참가자 질문에 답하지 못했던 Operational Knowledge Silo와 연결된다.

### Product Implication

**HYPOTHESIS:** Formal Responsibility와 정보 조회 필요 범위는 일치하지 않을 수 있다. 책임·수정 권한을 넓히지 않더라도 현장 대응에 필요한 Result Context의 소비 범위는 별도로 조사해야 한다.

### Caveat

모든 Staff에게 모든 정보를 공개한다는 뜻이 아니다. Minimum Necessary Access, 현장 Attention, 정보민감도를 함께 고려해야 한다.

### Status

RESEARCHED — RES-003을 지지하는 Cross-event EXPERIENCE.

---

## RES-021 — Shared Context can reduce Coordination Cost

**Date:** 2026-08-26  
**Event Type:** Leadership MT / Leadership Event  
**Role:** Pastor / Elder / Cell Leader / Ministry Team Leader  
**Evidence Type:** EXPERIENCE  
**Strength:** WEAK

### Observation

Leadership MT 참가자는 대체로 교회와 조직, 서로의 역할, 의사결정자와 Event 방식에 익숙했다. 약 20~30명 규모였지만 날짜, 장소, 식사, 강의, 프로그램과 Activity를 정하는 과정에서 특별히 큰 운영상 어려움이 기억되지 않았다.

### Product Implication

**HYPOTHESIS:** Shared Context / Operational Familiarity가 높으면 명시적인 Information Management와 Operational Guidance의 필요성이 낮아질 수 있다.

### Negative Evidence

모든 교회 Event가 전용 Software를 필요로 한다는 가설에 반하는 사례다. Direct Communication과 기존 Coordination만으로 충분한 Event가 존재할 수 있다.

### Caveat

운영상 어려움이 기억되지 않는다는 단일 관찰자의 회고이며, 실제 준비시간과 누락을 측정한 Evidence는 없다.

### Status

RESEARCHED — Negative Evidence. 다른 Leadership Event 검증 필요.
