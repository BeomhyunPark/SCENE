# Church Event Operations Platform — Figma Workspace Governance v0.1

- Version: v0.1
- Date: 2026-08-31
- Scope: Product Discovery / Product Definition 단계의 Figma Workspace 관리
- Status: Project Working Rule
- Applies to: Church Event Operations Platform Figma files

---

# 1. Purpose

Church Event Operations Platform의 Figma는 단순한 UI 디자인 파일이 아니다.

현재 Figma에는 다음과 같은 서로 다른 성격의 Artifact가 함께 존재한다.

- Product Screen Candidate
- UX Hypothesis
- Research Artifact
- Comparison Candidate
- Stress Test
- Product Definition Gate
- End-to-End Flow
- Superseded Screen
- Temporary Exploration

Product Discovery 과정에서 Artifact를 계속 보존하는 것은 중요하다.

그러나 모든 Artifact를 하나의 Page와 하나의 Infinite Canvas에 시간순으로 계속 쌓으면 다음 문제가 발생한다.

- 현재 기준 화면을 찾기 어렵다.
- 오래된 가설과 현재 후보를 구분하기 어렵다.
- 다른 협업자가 무엇을 봐야 하는지 알기 어렵다.
- 과거 Research Artifact가 현재 Product Decision처럼 보일 수 있다.
- 새로운 Exploration이 기존 화면 사이에 계속 추가된다.
- Prototype Flow와 Research History가 뒤섞인다.
- Figma Canvas 자체가 Project History 저장소가 된다.

따라서 이 문서는 Research History를 삭제하지 않으면서도 현재 작업과 과거 Artifact를 명확하게 분리하기 위한 Workspace 관리 규칙을 정의한다.

---

# 2. Core Principle

Figma Workspace는 다음 두 목표를 동시에 만족해야 한다.

1. Research History를 보존한다.
2. 현재 무엇을 검토해야 하는지 즉시 알 수 있어야 한다.

따라서 다음 원칙을 사용한다.

> Preserve history, separate current truth.

과거 Candidate는 삭제하지 않는다.

다만 현재 Product Candidate와 동일한 공간에서 계속 노출하지 않는다.

---

# 3. Page Structure

현재 기본 Page 구조는 다음을 사용한다.

## 00. START HERE

Figma 파일의 Entry Point.

목적:

- 현재 Product Phase 표시
- 현재 UX Candidate 표시
- 현재 Product State 표시
- 주요 Page 안내
- 새 협업자가 무엇을 봐야 하는지 안내

권장 내용:

```text
Church Event Operations Platform

Current Phase
Initial Product Definition v0.1

Current UX Hypothesis
C+ — Work-first Entry
   + State / Action Home
   + Capability Discovery

Product State
HYPOTHESIS

Go to:
→ CURRENT
→ FLOWS
→ RESEARCH & EXPLORATIONS
```

이 Page에 상세 Product Screen이나 Research Board를 쌓지 않는다.

---

## 01. CURRENT — Event Owner

현재 Product / UX 검증에서 실제로 사용 중인 Candidate를 둔다.

이 Page의 질문은 단순하다.

> 지금 우리가 검토하고 있는 제품 화면은 무엇인가?

포함 가능:

- 현재 Event Home Candidate
- 현재 Participant / Participation Candidate
- 현재 Operational Context
- 현재 Group Assignment Candidate
- 현재 Minimal Event Candidate

포함하지 않음:

- 오래된 Candidate
- 비교용 A/B/C
- 긴 Research Annotation
- Product Definition Gate
- Superseded Screen
- 역사 기록용 화면

CURRENT는 "CONFIRMED UI"를 의미하지 않는다.

현재 검증 중인 Candidate 역시 `HYPOTHESIS`일 수 있다.

---

## 02. FLOWS — Event Owner

여러 Product Screen 사이의 실제 User Journey와 Prototype Flow를 관리한다.

예:

- C+ End-to-End Operational Journey
- Participant Change Journey
- Group Assignment Journey
- Event-day Operations Journey
- Failure / Recovery Journey

한 화면 자체보다 다음을 검증하는 Artifact를 둔다.

```text
Screen
→ Action
→ State Change
→ Next Screen
```

Flow는 가능한 경우 실제 Product Screen과 Prototype Interaction을 사용한다.

---

## 10. RESEARCH & EXPLORATIONS

Product Discovery 과정에서 만든 Research / UX Exploration Artifact를 둔다.

예:

- IA 비교
- A/B/C Candidate
- Mental Model Exploration
- Stress Test
- Product Definition Gate
- Operational Structure Synthesis
- Participation IA Research
- Event Setup / Operational Deepening Research
- Research Questions
- HYPOTHESIS Annotation

이 Page는 다음 질문에 답한다.

> 왜 현재 Product Candidate가 이런 방향으로 발전했는가?

Research Artifact가 Product Requirement 또는 CONFIRMED UI처럼 보이지 않도록 상태를 명확히 표시한다.

---

## 90. ARCHIVE

현재 연구 또는 제품 검증에서 더 이상 직접 사용하지 않는 Artifact를 보존한다.

Archive 대상:

- 후속 버전으로 대체된 Screen
- 역할을 다한 초기 Candidate
- 현재 방향과 비교가 끝난 Prototype
- Research History 보존 목적으로만 필요한 화면

Archive는 실패한 화면을 버리는 곳이 아니다.

다음 정보를 보존하기 위한 공간이다.

- 어떤 방향을 시도했는가
- 어떤 가설이 있었는가
- 무엇이 후속 Candidate로 발전했는가

---

## 99. SCRATCH

새로운 아이디어와 짧은 UX 실험을 만드는 임시 작업 공간.

원칙:

> 새 Artifact는 우선 SCRATCH에서 시작한다.

검토 후 다음 중 하나로 승격한다.

```text
SCRATCH
   ↓
CURRENT
or FLOWS
or RESEARCH
or ARCHIVE
```

SCRATCH에 오래 방치된 Artifact는 정기적으로 정리한다.

---

# 4. Artifact Lifecycle

새로운 Figma Artifact는 기본적으로 다음 Lifecycle을 따른다.

```text
New Idea
↓
99. SCRATCH
↓
Review
↓
Classification
```

분류 기준:

### CURRENT

현재 Product Candidate 또는 현재 UX 검증에서 실제로 사용하는 화면.

### FLOWS

여러 Screen과 State 사이의 Journey를 검증하는 Artifact.

### RESEARCH

Product Hypothesis, 비교 실험, Synthesis, Gate, Annotation.

### ARCHIVE

현재 역할을 종료했지만 History 보존 가치가 있는 Artifact.

---

# 5. Promotion Rule

Artifact를 CURRENT로 이동시키는 것은 Product State를 CONFIRMED로 승격하는 것이 아니다.

예:

```text
C+ Event Home
Status: HYPOTHESIS
Location: CURRENT
```

가능하다.

CURRENT는 다음 의미다.

> 현재 다음 Product / UX 검증에서 사용 중인 Candidate.

Research State와 Figma 위치를 혼동하지 않는다.

---

# 6. Archive Rule

다음 조건 중 하나 이상이면 Archive 후보로 본다.

- 더 최신 버전이 존재한다.
- 비교 실험이 끝났다.
- 현재 User Journey에서 사용하지 않는다.
- 후속 Research Artifact가 해당 가설을 대체했다.
- Product Decision 기준선으로 사용하지 않는다.

단 다음 경우에는 Research에 남긴다.

- 왜 현재 방향이 선택됐는지 설명하는 핵심 Evidence
- 비교 과정 자체가 중요한 Product Discovery 기록
- 아직 Open Question을 검증하는 데 사용되는 Artifact

---

# 7. Naming Convention

가능한 경우 다음 형식을 사용한다.

## Product Screen

```text
[Context] — [Screen] vX.X — Desktop 1440
```

예:

```text
Event Home IA C+ — Partially Deepened v0.1 — Desktop 1440
```

## Flow

```text
[Context] — [Journey] vX.X
```

예:

```text
C+ End-to-End Operational Journey v0.1
```

## Research

```text
[Topic] Exploration vX.X
```

또는:

```text
HYPOTHESIS — [Topic]
```

## Stress Test

```text
[Scenario] — Stress Test vX.X
```

## Archive

기존 이름을 변경하지 않아도 된다.

필요한 경우:

```text
[ARCHIVED] 기존 이름
```

정도로 표시할 수 있다.

---

# 8. Section Rule

같은 Research Question 또는 같은 Product Candidate에 속하는 Artifact는 Section으로 묶는다.

예:

```text
Event Home IA C+ Exploration v0.1

  Fresh
  Participation Entry
  Partially Deepened
  Other Operations
  Stress Test
  Annotation
```

Section 내부 화면의 관계가 명확하다면 개별 Frame을 캔버스에 흩어놓지 않는다.

---

# 9. Prototype Safety Rule

Figma 정리 과정에서 Prototype Flow가 손상되어서는 안 된다.

특히 Page 이동 전 다음을 확인한다.

- Prototype destination
- Back navigation
- Overlay target
- Existing Flow starting point
- Cross-screen interaction

Prototype으로 연결된 화면은 하나의 Migration Unit으로 취급한다.

즉:

```text
A → B → C → D
```

가 연결돼 있다면 일부 Screen만 먼저 다른 Page로 이동하지 않는다.

먼저 Interaction Graph를 확인한다.

Figma의 Page 간 Prototype 동작이 기존 Flow와 충돌할 가능성이 있으면 해당 연결 Cluster는 같은 Page에 유지한다.

---

# 10. Node Preservation Rule

기존 Research Artifact의 Node ID를 외부 문서에서 참조할 수 있으므로:

> Copy → Delete 방식보다 기존 Node 이동을 우선한다.

가능하면 기존 Node 자체를 Page 또는 Section으로 이동한다.

불가피하게 복제하는 경우:

- Original Node를 즉시 삭제하지 않는다.
- New Node ID를 기록한다.
- 기존 문서 Reference 영향을 확인한다.

---

# 11. Current Workspace Migration Plan v0.1

현재 `01. Event Owner` Page에는 초기 Screen부터 최신 C+ Journey까지 약 42개의 Top-level Artifact가 누적되어 있다.

정리는 한 번에 수행하지 않는다.

다음 순서를 따른다.

---

## Phase 1 — Structure First

새 Page 생성:

```text
00. START HERE
01. CURRENT — Event Owner
02. FLOWS — Event Owner
10. RESEARCH & EXPLORATIONS
90. ARCHIVE
99. SCRATCH
```

아직 Artifact를 이동하지 않는다.

---

## Phase 2 — Archive Low-risk Artifacts

Prototype 의존성이 낮고 후속 버전으로 대체된 초기 화면부터 Archive한다.

후보:

- Event Home v0.1
- Event Home v0.2
- 초기 Participant / Operator Concept
- Minimal Event Home v0.1
- 초기 Operational Need Emergence Candidate

이동 후 기존 Prototype 또는 Reference 영향을 확인한다.

---

## Phase 3 — Move Research Clusters

다음 Research Cluster를 `10. RESEARCH & EXPLORATIONS`로 이동한다.

- Cross-role Flow v0.1
- Participant Intake Patterns v0.1
- Participation IA / Phase Model v0.1
- Vision Trip Admission Mode Research
- Event Setup → Operational Deepening
- Event Operational Structure Synthesis
- Product Definition Gate v0.1
- Event Home IA / Mental Model Exploration A/B/C
- C+ Exploration 및 HYPOTHESIS Annotation

단 현재 Prototype과 직접 연결된 C+ Product Screen의 이동 여부는 Interaction Graph 확인 후 결정한다.

---

## Phase 4 — Current Candidate

현재 Product Candidate를 `01. CURRENT — Event Owner`에 구성한다.

현재 기준 후보:

- C+ Fresh Event
- C+ Participation Entry
- C+ Partially Deepened
- C+ Participation Current
- C+ Group Assignment Entry
- Group Assignment Board v0.3
- C+ Home after Group Assignment
- Leadership MT C+ Minimal Event

다만 Prototype 연결 유지가 더 중요하다.

필요하면 CURRENT에는 Current Candidate Index만 두고 실제 Prototype-connected Screen Cluster는 FLOWS에 유지할 수 있다.

---

## Phase 5 — Flow

다음 Artifact를 `02. FLOWS — Event Owner`에 배치한다.

- C+ End-to-End Operational Journey v0.1

향후:

- Change Coordination Journey
- Exception / Recovery Journey
- Event-day Journey

등을 이 Page에서 관리한다.

---

# 12. Current Artifact Classification

현재 주요 Artifact의 권장 분류는 다음과 같다.

| Artifact | Node | Target |
|---|---:|---|
| Event Home v0.1 | 2:11 | ARCHIVE |
| HYPOTHESIS / Event Home v0.1 | 2:14 | ARCHIVE |
| Event Home v0.2 | 28:2 | ARCHIVE |
| HYPOTHESIS / Event Home v0.2 | 28:105 | ARCHIVE |
| 참여 Desktop v0.1 | 38:2 | ARCHIVE |
| Participant Detail v0.1 | 43:2 | ARCHIVE |
| 교통 Operator v0.1 | 47:2 | ARCHIVE |
| Event Home — 행사 당일 / Owner v0.1 | 63:2 | ARCHIVE / RESEARCH |
| 7조 / 담당 참가자 — Leader v0.1 | 63:128 | RESEARCH |
| Participant Home v0.1 | 63:147 | RESEARCH |
| Cross-role Flow v0.1 | 100:2 | RESEARCH |
| Participant Intake Patterns v0.1 | 197:2 | RESEARCH |
| Participation IA / Phase Model v0.1 | 281:2 | RESEARCH |
| Vision Trip Admission Mode v0.1 | 304:2 | RESEARCH |
| Event Setup → Operational Deepening v0.2 | 323:2 | RESEARCH |
| Minimal Event Home v0.1 | 337:2 | ARCHIVE |
| Operational Need Emergence v0.1 | 337:4 | RESEARCH / ARCHIVE |
| Minimal Event Home v0.2 | 356:2 | RESEARCH |
| 참여 / Before Grouping v0.2 | 356:3 | RESEARCH |
| 조 편성 시작 Overlay v0.2 | 356:4 | RESEARCH |
| 조 편성 First Workspace v0.2 | 356:5 | RESEARCH |
| Group Assignment Board v0.3 | 397:2 | CURRENT |
| Group Assignment Context Hidden | 409:2 | RESEARCH |
| Group Assignment Drag State | 410:2 | RESEARCH |
| Group Assignment AFTER | 411:2 | RESEARCH |
| Group Assignment Hypothesis | 412:2 | RESEARCH |
| 참여 / Before Transport v0.1 | 421:2 | RESEARCH |
| 교통 First Workspace v0.1 | 421:119 | RESEARCH |
| Event Operational Structure Synthesis | 442:2 | RESEARCH |
| Product Definition Gate v0.1 | 448:2 | RESEARCH |
| Event Home IA / Mental Model A/B/C | 457:2 | RESEARCH |
| Event Home IA C+ Exploration | 502:2 | CURRENT / RESEARCH — prototype dependency 확인 |
| C+ End-to-End Journey | 553:2 | FLOWS |

Ambiguous 항목은 자동 이동하지 않고 Prototype Dependency와 현재 Research 사용 여부를 먼저 확인한다.

---

# 13. START HERE Maintenance

Product Direction이 크게 바뀔 때 `00. START HERE`를 갱신한다.

항상 다음 정보만 최신 상태로 유지한다.

- Current Phase
- Current Product Definition version
- Current UX Candidate
- Product State
- Current Research Question
- Links / navigation to Current and Flow

START HERE를 상세 Project Documentation으로 만들지 않는다.

---

# 14. Working Rule for Future Figma Tasks

앞으로 Figma 작업 Prompt에는 가능한 경우 다음을 명시한다.

```text
Target Page:
99. SCRATCH

Do not add new work to existing infinite canvas.

Preserve current Product Screens.

After completing the experiment, report whether the Artifact should be:
CURRENT / FLOWS / RESEARCH / ARCHIVE.
```

새 작업을 곧바로 CURRENT에 만들지 않는다.

---

# 15. Cleanup Trigger

다음 중 하나가 발생하면 Figma 정리를 수행한다.

- 한 Page의 Top-level Artifact가 지나치게 증가
- 최신 Candidate 식별이 어려움
- 새 협업자가 무엇을 봐야 할지 설명해야 함
- Product Definition Gate가 변경됨
- 큰 UX Hypothesis 라운드가 종료됨
- 새로운 Major Journey가 시작됨

---

# 16. Guardrails

Workspace 정리는 Product Decision이 아니다.

따라서 정리 과정에서:

- HYPOTHESIS를 CONFIRMED로 승격하지 않는다.
- 화면 내용을 수정하지 않는다.
- Research 결과를 삭제하지 않는다.
- Product Scope를 새로 정의하지 않는다.
- IA를 확정하지 않는다.
- 오래된 화면을 실패작으로 단정하지 않는다.

목적은 Product History를 보존하면서 Workspace의 Navigation Cost를 줄이는 것이다.
