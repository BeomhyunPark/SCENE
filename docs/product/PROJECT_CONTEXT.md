# Church Event Operations Platform — Project Context

> **2026-09-30 baseline:** 제품명 SCENE, 현재 단계 Technical Design / implementation 전. 아래 Context 본문은 첨부 원문을 보존한다. §12의 단계·기술 미정 표현은 작성 당시 기록이며 현재 기술 기준은 [Architecture](../architecture/architecture-v0.1.md)를 따른다. 연구 가설·MVP·IA를 자동 확정하지 않는다.
>
> [Product Definition](PRODUCT_DEFINITION.md) · [Decisions](PRODUCT_DECISIONS.md) · [Research](RESEARCH.md)
> PROJECT_INSTRUCTIONS.md는 프로젝트 첨부 자료이며 이번 저장소 구조에 포함하지 않았다.

> 이 문서는 프로젝트의 **배경, 문제의식, 제품 방향, 현재 단계**를 설명한다.
>
> 세부 운영 원칙은 `PROJECT_INSTRUCTIONS.md`, 현재 제품 정의는 `PRODUCT_DEFINITION.md`, 확정된 의사결정은 `PRODUCT_DECISIONS.md`, 조사 내용과 Evidence는 `RESEARCH.md`를 기준으로 한다.

---

# 1. 프로젝트 개요

## Working Definition

**Church Event Operations Platform**

교회 및 기독교 단체가 수련회, 비전트립, 아웃리치, 단기선교, 성경학교, 캠프, 워크숍 등 다양한 Event를 **기획하고 준비하고 참가자를 관리하고 현장을 운영하고 종료 후 정산·회고하는 전체 과정**을 지원하는 범용 SaaS 제품.

이 제품은 단순 참가 신청 앱이나 교회 행정 프로그램이 아니다.

핵심 관심사는 다음이다.

> **교회 Event를 준비하고 운영하는 사람들이 불필요한 행정·커뮤니케이션·정보관리 비용을 줄이고, 실제 Event의 본질적인 준비와 사람을 돌보는 일에 더 집중하도록 만드는 것.**

---

# 2. 프로젝트를 시작하게 된 배경

교회 Event 준비 과정에는 많은 사람이 참여한다.

예:

- 목회자
- 공동체 책임자
- 준비위원회
- 임원
- STAFF
- 프로그램 담당
- 행정 담당
- 회계 담당
- 물품 담당
- 차량 담당
- 조장
- 팀장
- 일반 참가자

하지만 이들이 사용하는 정보와 업무 도구는 하나로 정리되어 있지 않은 경우가 많다.

실제 업무에서는 다음과 같은 도구가 동시에 사용될 수 있다.

- KakaoTalk
- Google Sheets
- Google Forms
- Google Docs
- Excel
- Notion
- PDF
- 문자
- 전화
- 종이 문서
- 개인 메모
- 담당자의 기억

그 결과 하나의 Event를 준비하는 데 필요한 정보가 여러 장소로 흩어진다.

---

# 3. 핵심 문제의식

현재 발견하고 있는 주요 Problem Space는 다음과 같다.

## 3.1 정보 분산

"최신 정보가 어디 있는가?"를 알기 어렵다.

예:

- 참가자 명단은 Spreadsheet
- 차량 명단은 다른 Spreadsheet
- 준비물은 KakaoTalk
- 프로그램 일정은 PDF
- 숙소 배정은 특정 담당자의 개인 파일
- 변경된 내용은 단체 채팅방

결과적으로 **Single Source of Truth가 존재하지 않는다.**

---

## 3.2 사람에게 의존하는 정보 전달

참가자가 정보를 얻기 위해 운영자에게 직접 물어봐야 하는 경우가 많다.

예:

- 몇 시까지 가야 하나요?
- 준비물이 뭐예요?
- 저는 어느 조인가요?
- 차량은 어디서 타나요?
- 회비 입금 확인됐나요?
- 방이 어디예요?
- 일정이 바뀌었나요?

이런 문의가 반복되면 운영자의 Communication Cost가 증가한다.

---

## 3.3 반복적인 수작업

많은 Event 운영 업무가 사람이 직접 Spreadsheet를 확인하고 수정하고 전달하는 방식으로 이루어진다.

예:

- 신청자 확인
- 입금 여부 표시
- 조 편성
- 차량 편성
- 참가 상태 확인
- 숙소 배정
- 출석/체크인
- 명단 전달
- 변경사항 공유

이 과정에서 복사, 붙여넣기, 재확인, 중복 입력이 발생한다.

---

## 3.4 운영자 기억 의존

특정 담당자만 알고 있는 정보가 많아질 수 있다.

그 담당자가 자리를 비우거나 Event가 끝난 후 인수인계가 발생하면 정보가 사라진다.

따라서 제품은 단순히 정보를 저장하는 것을 넘어

> **조직의 Event 운영 지식을 구조화하는 역할**

까지 할 가능성이 있다.

이 가치는 아직 검증이 필요한 부분은 `HYPOTHESIS`로 취급한다.

---

## 3.5 현장에서의 운영 난이도

Event 당일에는 평상시와 다른 환경이 된다.

- 운영자는 여러 일을 동시에 처리한다.
- 휴대폰만 사용할 가능성이 높다.
- 시간이 부족하다.
- 참가자가 몰릴 수 있다.
- 계획이 변경될 수 있다.
- 인터넷이 불안정할 수 있다.
- 담당자가 갑자기 변경될 수 있다.

따라서 이 제품은 단순한 Back-office SaaS가 아니라

> **현장에서 실제로 사용 가능한 Operations Software**

여야 한다.

---

# 4. 제품의 잠재적 가치

현재 제품이 제공할 가능성이 있는 핵심 가치는 다음과 같다.

## 4.1 Operational Efficiency

반복 행정업무 감소.

## 4.2 Information Accessibility

필요한 사람이 필요한 정보를 스스로 확인.

## 4.3 Coordination

여러 준비팀과 운영자 사이의 협업 비용 감소.

## 4.4 Single Source of Truth

Event와 관련된 핵심 운영 정보를 하나의 구조 안에서 관리.

## 4.5 Operational Continuity

특정 담당자의 기억이나 개인 파일에 의존하지 않는 운영.

## 4.6 Participant Experience

참가자가 필요한 정보를 찾기 위해 여러 사람에게 묻지 않아도 되는 경험.

이 항목들은 현재 **Product Value Hypothesis**이며 Research를 통해 중요도를 검증해야 한다.

---

# 5. 지원하려는 Event 범위

현재 제품은 다음과 같은 Event를 장기적으로 지원할 가능성을 고려한다.

## Retreat

- 여름수련회
- 겨울수련회
- 청년부 수련회
- 학생부 수련회

## Mission

- 비전트립
- 아웃리치
- 국내선교
- 해외 단기선교

## Education / Camp

- 여름성경학교
- 겨울성경학교
- 어린이 캠프
- 청소년 캠프

## Organization Event

- 임원 워크숍
- 리더십 워크숍
- MT
- 특별 공동체 행사

규모 역시 넓게 고려한다.

- 수십 명 규모의 소규모 Event
- 수백 명 규모의 공동체 Event
- 여러 부서가 참여하는 대규모 Event

하지만 **모든 Event Type을 초기 제품에서 지원한다는 뜻은 아니다.**

Research를 통해 공통 Problem과 Workflow를 확인한 후 지원 범위를 결정한다.

---

# 6. 의도적으로 다루지 않는 영역

이 프로젝트는 일반적인 Church Management System을 만드는 것이 아니다.

현재 핵심 범위에서 제외하는 대표적인 영역:

- 매주 진행되는 셀모임 관리
- 주일예배 출석관리
- 교적관리
- 장기적인 교인 CRM
- 헌금관리 중심 시스템
- 목양 기록 중심 시스템

Event 중 참가자와 공동체 정보를 활용할 수는 있지만 핵심 Product Domain은 **Event Operations**다.

---

# 7. 사용자 구조

제품에는 여러 종류의 사용자가 존재한다.

## Leadership

Event 전체에 대한 책임과 의사결정을 담당.

예:

- 목회자
- 행사 책임자
- 공동체 책임자
- 준비위원장

## Operator

실제 준비 및 현장 운영 담당.

예:

- 임원
- 준비팀
- STAFF
- 행정 담당
- 회계 담당
- 물품 담당
- 차량 담당
- 프로그램 담당

## Leader

참가자 그룹을 관리하거나 직접 소통하는 사용자.

예:

- 조장
- 팀장
- 소그룹 리더

## Participant

Event에 참가하는 일반 사용자.

---

# 8. Buyer와 User

이 제품에서는 구매자와 실제 사용자가 다를 가능성이 높다.

예상 구조:

**Buyer**

- 교회
- 공동체
- 사역부서
- 담당 목회자
- 책임 운영자

**Operator**

- 준비팀
- 임원
- STAFF

**End User**

- 참가자
- 조장
- 팀원

따라서 Product Discovery에서 반드시 다음을 구분한다.

- User Problem
- Operator Problem
- Buyer Problem

사용자가 좋아하는 기능이 반드시 구매 이유가 되는 것은 아니다.

---

# 9. 현재 중요한 Product Hypothesis

아래 내용은 아직 시장 전체에 대해 확정된 사실이 아니다.

## H1. Information Fragmentation

교회 Event 운영에서 정보 분산이 주요한 운영 비용을 만든다.

## H2. Repetitive Communication

참가자의 반복 문의가 운영자의 업무량을 크게 증가시킨다.

## H3. Spreadsheet Dependency

Spreadsheet는 강력하지만 Event 운영 전체 Workflow를 지원하기에는 한계가 있다.

## H4. Operational Knowledge Loss

Event가 끝난 후 업무 방식과 정보가 조직 자산으로 남지 않는다.

## H5. Event-Specific SaaS Demand

충분히 큰 운영 문제를 해결한다면 교회는 범용 무료 도구 대신 Event 운영 전용 제품에 비용을 지불할 가능성이 있다.

## H6. Cross-Event Commonality

Retreat, Mission, Outreach, Camp 등 서로 다른 Event 사이에도 공통 Operations Core가 존재한다.

이 Hypothesis들을 검증하지 않고 Architecture나 Feature를 확정하지 않는다.

---

# 10. 현재 제품 철학

## Event 중심

Organization 전체를 관리하는 것이 아니라 Event가 중심이다.

## Operations 중심

콘텐츠보다 실제 업무와 Workflow 개선을 우선한다.

## Human-centered

기술적으로 가능한 기능보다 사용자의 실제 행동을 기준으로 한다.

## Field-ready

사무실뿐 아니라 Event 현장에서 사용 가능해야 한다.

## Evidence-driven

경험과 직감을 활용하되 Research를 통해 검증한다.

## Privacy-first

개인정보 보호를 부가 기능으로 취급하지 않는다.

## Simple by default

복잡한 Configuration보다 좋은 Default를 선호한다.

## Integrate when appropriate

이미 좋은 외부 도구가 존재한다면 모든 기능을 직접 만들 필요는 없다.

---

# 11. Product / Business / Engineering의 관계

이 프로젝트는 세 개의 Track이 연결되어 진행된다.

## Product Track

Problem  
→ Research  
→ User Journey  
→ UX Hypothesis  
→ Validation  
→ Product Definition

## Business Track

Market  
→ Customer Segment  
→ Buyer  
→ Competition  
→ Pricing  
→ Pilot  
→ GTM

## Engineering Track

Product Requirement  
→ Domain  
→ Architecture  
→ Implementation  
→ Deployment  
→ Operations

Engineering Track이 Product와 Business보다 앞서지 않는다.

---

# 12. 현재 단계

현재 프로젝트는 **Product Discovery에서 Product Definition Gate v0.1을 통과한 뒤의 초기 Product Definition v0.1 단계**다.

현재까지 다음 Research가 진행됐다.

- Retreat 상세 Experience Review
- Retreat v0.9 Source-backed Product Audit
- 약 13년의 Cross-event Longitudinal Experience Review
- Event Operational Complexity Research Lens v0.1 및 v0.2 정교화
- Problem Cluster Synthesis
- Operational Structure 탐색과 Product Definition Gate v0.1

Gate 결과는 다음 원칙과 방향을 현재 Product Definition 기준선에 반영했다.

- `Not Used ≠ Incomplete`: `CONFIRMED`
- `Platform Core + Optional Capability / Module`: `CONFIRMED` 방향 유지
- `Minimal Event`: `RESEARCHED` 상태를 보존하며, 사전 Operational Workspace 선택·구성 없이 Event를 시작할 수 있다는 범위만 제한적으로 승격
- `Work-first Operational Deepening`: `RESEARCHED` 상태와 Caveat를 보존하며 방향만 승격
- `State separation`: `RESEARCHED` 상태와 Caveat를 보존하며 Participant Response / Source Information과 Operational Current State를 동일시하지 않는 원칙만 승격

다음 항목은 Product Definition으로 확정하지 않았다.

- `Operational Lens`: `HYPOTHESIS`
- `Change Coordination`: `HYPOTHESIS`
- Module과 사용자 Mental Model / IA의 관계: `OPEN QUESTION`

초기 Product Definition 문서가 만들어졌다는 사실은 Technical Design 또는 Implementation 진입을 뜻하지 않는다.

아직 다음 사항은 확정하지 않는다.

- 최종 Feature Set
- MVP Feature Set
- 최종 Information Architecture / Navigation
- Organization / Workspace / Event 구조
- 공통 State Model
- Database Schema
- Domain Model
- API
- Architecture
- Pricing
- Packaging
- 최종 Target Segment

현재 주요 목표는 다음이다.

1. Product Definition v0.1의 `RESEARCHED`, `HYPOTHESIS`, `OPEN QUESTION` 경계 유지
2. Minimal Event와 Work-first Deepening의 실제 사용자 이해 및 시작 조건 검증
3. Source Information과 Operational Current State 분리가 필요한 영역 검증
4. Module과 사용자 Mental Model / IA의 관계 탐색
5. `Operational Lens`와 `Change Coordination` 가설 검증
6. Product Scope와 MVP가 검증해야 할 핵심 가치 가설 정의
7. 필요한 시점의 Independent Interview / Survey, UX Artifact와 외부 검증 설계

---

# 13. 현재 Research 전략

사용자는 약 13년에 걸쳐 여러 교회 Event에 반복적으로 참가하고 준비했다.

- 여름·겨울 Retreat 다수 및 직접 Retreat 기획 약 5회
- Vision Trip 3회
- Outreach 여러 회
- Bible School 다수
- Leadership MT / Leadership Event 다수
- 학생부 Event Staff 경험

현재까지 Retreat Source-backed Audit, Retreat Experience Findings, `13-Year Cross-event Experience Analysis v0.1`, `Event Operational Complexity Dimensions v0.2`가 작성됐다.

따라서 사용자의 장기간 Longitudinal `EXPERIENCE`를 Product Discovery의 중요한 1차 Evidence로 활용한다. 다만 이는 한 관찰자의 여러 해에 걸친 경험이며 independent market validation이 아니다.

다음은 여전히 별도 검증 대상이다.

- 다른 교회와 조직에서의 반복성
- 목회자, Buyer, 외부 Partner, 보호자 등 다른 역할의 관점
- 실제 운영시간, 오류율, Recovery Cost와 대안 사용 품질
- Commercial Willingness to Pay

Survey, Interview, Observation, Artifact Research와 Market Research는 폐기하지 않는다. 현재 Synthesis에서 Evidence가 약하거나 의사결정 영향이 큰 질문에 맞춰 필요한 시점에 선택적으로 사용한다.

---

# 14. 화면 설계와 Research

이 프로젝트에서는 화면 설계를 Discovery 이후까지 미루지 않는다.

초기 Wireframe이나 Concept Screen을 Research Artifact로 사용할 수 있다.

예:

> "이런 화면이 있으면 실제 준비 과정에서 도움이 될까요?"

> "여기 있는 정보 중 실제로 필요한 것은 무엇인가요?"

> "이 작업을 지금은 어떻게 하고 있나요?"

> "이 화면에서 필요 없는 기능은 무엇인가요?"

즉 화면은 정답이 아니라 **대화를 유도하고 Hypothesis를 검증하는 도구**로 사용한다.

---

# 15. 제품화 관점

이 프로젝트는 최종적으로 실제 상용 서비스를 목표로 한다.

따라서 언젠가는 다음 문제까지 해결해야 한다.

- 고객 확보
- 가입
- Organization 생성
- Event 생성
- Onboarding
- Pricing
- Subscription
- Billing
- Customer Support
- 장애 대응
- 개인정보 처리
- 데이터 보관
- 데이터 삭제
- 서비스 탈퇴
- 운영 관리자
- 모니터링
- 제품 분석
- 고객 유지
- 재사용
- Upsell

하지만 현재는 **상용 서비스에 필요하다는 이유만으로 이를 선행 구현하지 않는다.**

---

# 16. 장기적인 성공의 기준

이 프로젝트의 성공은 기능 개수나 코드량으로 판단하지 않는다.

궁극적인 성공 기준은 다음과 같다.

> 교회 Event 운영자들이 실제 업무에서 제품을 선택한다.

그리고 그 다음:

> 한 번 사용한 교회가 다음 Event에서도 다시 사용한다.

그리고 궁극적으로:

> 무료 Spreadsheet + KakaoTalk 조합보다 비용을 지불하고 이 제품을 사용하는 것이 더 낫다고 느낀다.

---

# 17. 아직 답해야 하는 핵심 질문

## Problem

- 실제로 가장 큰 Pain Point는 무엇인가?
- Event Type마다 어떤 문제는 같고 어떤 문제는 다른가?
- 운영 규모가 커질수록 어떤 문제가 급격히 증가하는가?

## User

- 가장 강한 Pain을 느끼는 사람은 누구인가?
- 핵심 Operator는 누구인가?
- 참가자가 제품을 얼마나 직접 사용해야 하는가?

## Business

- 최초 Target Customer는 누구인가?
- 비용을 지불할 Buyer는 누구인가?
- 구매 단위는 Organization인가 Event인가?
- 얼마의 운영 비용을 줄여야 유료 제품이 될 수 있는가?

## Product

- 무엇이 Platform Core인가?
- 무엇이 Event Module인가?
- 무엇은 Integration으로 해결해야 하는가?
- MVP는 어떤 핵심 가설을 검증해야 하는가?

## UX

- 운영 준비와 현장 운영의 UX는 어떻게 달라야 하는가?
- Mobile과 Desktop은 어떻게 역할을 분담해야 하는가?

---

# 18. 프로젝트의 North Star Question

프로젝트가 복잡해질 때 항상 다음 질문으로 돌아간다.

> **이 제품은 교회 Event를 준비하는 사람들이 행정과 정보 정리에 소모하는 시간을 줄이고, 실제 사람과 Event에 더 집중할 수 있게 만드는가?**
