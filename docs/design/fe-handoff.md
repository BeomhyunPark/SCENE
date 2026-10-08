# SCENE web app: front-end handoff (design system)

**For:** SCENE Dev Lead and the FE implementer · **Figma:** `RreFdEVMiwgHrV7teaCEOm` · **Status:** 2026-10-08, 12:50 KST. UX 검수 PASS (12:33); Color Master verified the SCENE Color v2.1 rollout (12:44, plus the c43 components pass)
**Sources:** the audit and worker reports named in each section, plus read-only Figma reads on 2026-10-08 (variables, text styles, components, instance counts). This doc made no Figma edits itself; the design changes it describes are logged in each report. **TODO** marks anything still open.

## 1. Overview

**Libraries**
- **Base:** the purchased **"Event Operation Platform Design System" (EOP)**: library components, `Icon/*` glyphs, Inter text styles, and the radius variable `Border Radius/8 px` (752:13).
- **SCENE layer on top:** colour collection **SCENE Color v2** (`VariableCollectionId:1796:7`, Light `1796:0` / Dark `1796:1`, 91 variables, v2.1), 16 `SCENE/*` text styles, and local `SCENE / …` components on 4:3. EOP colour variables have been rebound to SCENE tokens, so **build against SCENE tokens only.**

**Source of truth:** **262:7** "91. REVIEW — PROCESS PROTOTYPE" is the **live prototype** (all screens, 42 flows). **4:3** "10. COMPONENTS — CRM ADAPTED" holds the **component masters** (§4). 4:4 PATTERNS is small and fully token-bound.

**Ignore**
- Pages: ARCHIVE **4:6**, SCRATCH **0:1**, **253:8** (v0.1 screen-definitions doc), the colour proposal pages **1078:44635** and **1325:7**, and REFERENCES **41:16850**. Pages 4:2, 97:12, 4:5 and 41:16849 have no product screens.
- Non-live sections inside 262:7: **262:8** (index), **262:16** (research duplicate of P08) and **281:21879** (superseded P09).
- Not product UI: anything labelled `QA`, `검토 전용` or `Review ·`, the "현재 로그인: … · 검토 계정" labels, annotations, READ ME panels and memo frames.
- **D04:** build the **D04 v2 board** (in section 816:43447, e.g. 1797:86418). The old D04 frames 816:43491, 816:44063 and 816:44263 are now fully token-bound, but they are legacy and still in the file only because flows link to them.

## 2. Colour tokens (SCENE Color v2)

**CSS: use `var(--color-<path>)`.** The variable name is the token path with each `/` turned into `-`: `bg/surface` → `--color-bg-surface`, `action/primary/bg` → `--color-action-primary-bg`.
- This is the WEB codeSyntax already set on all 91 variables, so it matches Figma Dev Mode and the 91-variable CSS that Front Lead generated (confirmed by Color Master). iOS and Android code syntax are not set.
- Put Light on `:root` and Dark under the theme selector. Text styles use the `--scene-*` prefix (§3).

**Naming:** `group/role[-state]`. None of the variables are aliases.
**Shadow tokens** store colour and alpha only; the geometry is in the recipes below.
**Scopes:** FF frame fill · SF shape fill · TF text fill · ST stroke · EF effect. The default for each group is given in its heading.

**Backgrounds `bg/*`** (FF SF)

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg/canvas` | #F4F7F8 | #0E1416 | Page / app background only |
| `bg/surface` | #FFFFFF | #182226 | Cards, panels, anything on the canvas |
| `bg/subtle` | #EDF2F3 | #232E31 | Elements on a surface |
| `bg/brand-subtle` | #E4F1F3 | #123A41 | Neutral brand tint, feedback banners |
| `bg/raised` | #FFFFFF | #2E393C | Raised layers |
| `bg/hover-row` | #F4F7F8 | #2C383C | Row hover |
| `bg/selected` | #D6ECEF | #123A41 | Selected item, active sidebar item |

**Text `text/*`** (SF TF)

| Token | Light | Dark | | Token | Light | Dark |
|---|---|---|---|---|---|---|
| `text/primary` | #132125 | #E6EEEF | | `text/brand` | #0B5866 | #6CC4D2 (also ST) |
| `text/secondary` | #4A5B5F | #A9B8BB | | `text/on-accent` | #FFFFFF | #05252B |
| `text/tertiary` | #59696D | #94A4A7 | | `text/on-danger` | #FFFFFF | #2A0907 |
| `text/disabled` | #98A6A9 | #56666A | | | | |

**Borders `border/*`** (ST)

| Token | Light | Dark | Use |
|---|---|---|---|
| `border/default` | #DAE2E4 | #374246 | Hairlines, card borders, **read-only** fields (also SF, for 1px dividers) |
| `border/control` | #6F8185 | #7A8D92 | **Every interactive outline at rest** (see rules) |
| `border/strong` | #6F8185 | #71858A | Non-interactive strong dividers and drop-zone rest borders only |
| `border/selected` | #0E6A7A | #4DB3C3 | Selected outline, active tab underline |
| `border/raised` | #DAE2E4 | #4E5D62 | Popover border (kept in Dark) |
| `border/hover-row` | #B9C6C9 | #4E5D62 | Row hover |

**Accent, action and focus**

| Token | Light | Dark | Scopes |
|---|---|---|---|
| `accent` · `action/primary/bg` · `selected/indicator` | #0E6A7A | #4DB3C3 | FF SF (+ST on accent and indicator) |
| `accent-hover` · `action/primary/bg-hover` | #0B5866 | #6CC4D2 | FF SF (+ST on accent) |
| `accent-pressed` · `action/primary/bg-pressed` | #084652 | #3A9AAA | FF SF (+ST on accent) |
| `action/primary/bg-disabled` | #E3E9EA | #2A3539 | FF SF |
| `action/primary/on` | #FFFFFF | #05252B | SF TF |
| `action/primary/on-disabled` | #8D9B9E | #6B7B7F | SF TF |
| `focus/ring` | #2F6FEB | #7FA8FF | ST EF |

**Status** (fg: SF TF, with ST on danger · bg: FF SF)

| Family | fg Light | fg Dark | bg Light | bg Dark |
|---|---|---|---|---|
| `success` | #24702A | #58BE6E | #E8F5E6 | #12301F |
| `warning` | #995700 | #E9A23B | #FDF1DE | #36270D |
| `danger` | #B42318 | #FF8A7F | #FDECEA | #3D1A17 |
| `info` | #3756B8 | #93ACFF | #EBEFFB | #1B2646 |

Extras: `danger-hover` #951D13 / #FFA59C, `danger-pressed` #77170F / #F2766A, `warning/bg-large` #FDF1DE / #2B2414 (all FF SF).

**Attendance and badges**

| Token | Light / Dark | Token | Light / Dark |
|---|---|---|---|
| `attendance/full` (FF SF ST) | #2A7A32 / #3E9F5A | `attendance/absent` (FF SF) | transparent |
| `attendance/partial` (FF SF ST) | #B87500 / #DC9D36 | `attendance/absent-border` (ST) | #778688 / #738589 |
| `attendance/partial-tint` (FF SF) | #FDE8CD / #483618 | | |

| Badge (`badge/<name>-fg` SF TF · `-bg` FF SF) | fg Light / Dark | bg Light / Dark |
|---|---|---|
| `attendance-full` | #24702A / #58BE6E | #E8F5E6 / #12301F |
| `attendance-partial` | #965900 / #DC9D36 | #FDF1DE / #36270D |
| `over-capacity` | #B42318 / #FF8A7F | #FDECEA / #3D1A17 |
| `new-family` | #0B5866 / #6CC4D2 | #E4F1F3 / #123A41 |

**Chips `chip/<state>-<part>`** (bg FF SF · border ST · text SF TF), as Light / Dark

| State | bg | border | text |
|---|---|---|---|
| default | #FFFFFF / #182226 | #6F8185 / #7A8D92 | #4A5B5F / #A9B8BB |
| hover | #EDF2F3 / #2C383C | #6F8185 / #71858A | #132125 / #E6EEEF |
| selected | #E4F1F3 / #123A41 | #0E6A7A / #4DB3C3 | #0B5866 / #6CC4D2 |

**D04 board families** (Light / Dark)

| Token | Value | Token | Value |
|---|---|---|---|
| `drag/row-raised-bg` | #FFFFFF / #2E393C | `drop/hover-bg` | #D7E4E7 / #294145 |
| `drag/row-raised-border` | #DAE2E4 / #4E5D62 | `drop/hover-border` | #0E6A7A / #4DB3C3 |
| `drag/origin-placeholder-border` | #6F8185 / #71858A | `drop/rest-border` · `drop/empty-group-border` · `drop/empty-group-icon` | #6F8185 / #71858A |
| `drag/origin-placeholder-bg` | transparent | `drop/rest-text` · `drop/empty-group-text` | #4A5B5F / #A9B8BB |
| `sticky/unsaved-bg` | #FFFFFF / #2E393C | `drop/over-capacity-border` (2px) | #B42318 / #FF8A7F |
| `sticky/unsaved-border` | #DAE2E4 / #4E5D62 | `drop/over-capacity-bg` | #FBE3E0 / #42201C |
| `sticky/unsaved-icon` | #995700 / #E9A23B | `group/over-capacity-border` · `-count` | #B42318 / #FF8A7F |
| `leader/icon` | #0E6A7A / #4DB3C3 | | |

**Overlay and shadows** (x / y / blur / spread; shadows are EF, the scrim is FF SF)

| Token / recipe | Light | Dark | Geometry and use |
|---|---|---|---|
| `overlay/scrim` | #0B1A1E @48% | #000000 @60% | Under modal dialogs only; keep the layer at 100% opacity |
| `shadow/raised-sm` | #0B1A1E @8% | #000000 @30% | 0/1/3/0: chips, logo tile, calendar cards; also the 2nd layer of popover and dialog |
| `shadow/popover` | #0B1A1E @14% | #000000 @45% | 0/4/16/0 + raised-sm: popovers, menus, tooltips (in Dark, keep `border/raised`) |
| `shadow/dialog` | #0B1A1E @18% | #000000 @60% | 0/16/40/0 + raised-sm: modal dialogs, over the scrim |
| `shadow/drag-1` + `shadow/drag-2` | @16% + @10% | @55% + @40% | 0/8/24/0 + 0/2/6/0: lifted D04 card |
| `shadow/sticky` | #0B1A1E @10% | #000000 @50% | 0/−4/16/0: sticky elements |
| `shadow/color` | #0B1A1E | #000000 | Base shadow colour |

There are no `raised-md` or `shadow/overlay` tokens.

### Usage rules

| Rule | Detail |
|---|---|
| **Parent-surface rule** | An element on the canvas uses `bg/surface`. An element on a surface uses `bg/subtle`. `bg/canvas` is only for page backgrounds. A borderless pill on the canvas gets `bg/surface` plus a `border/default` stroke. |
| **Interactive outlines** | At rest, every interactive outline uses `border/control`: inputs, selects, steppers, chips, Secondary and row buttons. Read-only display fields keep `border/default`, so you can see they can't be edited. `border/strong` is only for non-interactive strong dividers and the resting border of drop zones. When a border is the only edge of an interactive or draggable element (for example participant cards or picker options), use `border/control`, because `border/default` is under 3:1 in Dark. Danger popovers use `danger/fg` on the stroke. Static dividers and card edges that also have a surface step stay on `border/default`. Toggle slots (for example the partial-attendance slot selector) use `border/control` on each slot; the group frame stays on `border/default`. |
| **Dark primary buttons** | Dark text (`text/on-accent` #05252B) on light teal (#4DB3C3). **This is intended.** |
| `text/disabled` | Only on disabled controls (2.51:1 on white). Placeholders use `text/tertiary`. |
| `text/on-danger` | On solid danger fills. Don't reuse `text/on-accent`. |
| **Partial attendance** | Always show the half-fill: left half `attendance/partial`, right half `attendance/partial-tint`, 1px inside `attendance/partial` outline (D04 v2 1797:10). |
| **Absent attendance** | Outlined: transparent fill, 1px inside `attendance/absent-border`, **radius 2** (as on the D04 v2 board). In code, separate slots with **gap spacing, not borders**. |
| Status badges | Use `badge/attendance-full-*` for 전체참석 and `badge/attendance-partial-*` for 부분참석. Use `success/bg` only for real success feedback; neutral banners use `bg/brand-subtle`. |
| Checkbox and focus | Checked box: `selected/indicator` with a `text/on-accent` check mark. Focus: `focus/ring`, 2px, with a 2px offset in code. |
| **Category dots** | Keep them as static colours (#3DB278, #5C80F2, #BDAD0F, #FA6B2E, #39C682, #6884FD). Category tokens are a v2.2 item for Color Master. |
| **Avatars** | The 20 library avatar circles have no token. Treat them as images or static art. |

## 3. Text styles

**Font: Noto Sans KR everywhere in code**, including text that comes from library components. Those are still Inter in Figma, but that doesn't affect code. The only exception is the **Geist** wordmark (`SCENE Brand / Wordmark / Primary` 111:12).
**CSS:** the style descriptions in Figma name **`var(--scene-<style>)`** variables, so text styles use the `--scene-*` prefix and colours use `--color-*`. Suggested value: a `font` shorthand, e.g. `--scene-body-m: 400 14px/21px "Noto Sans KR", sans-serif`. Letter spacing is 0 for every style.

| Style | Size / LH | Weight | CSS | Use |
|---|---|---|---|---|
| SCENE/Display | 28 / 36 | Bold 700 | `--scene-display` | Hero numbers, page hero |
| SCENE/Heading/L | 24 / 32 | Bold 700 | `--scene-heading-l` | Page titles |
| SCENE/Heading/M | 20 / 28 | Bold 700 | `--scene-heading-m` | Section / dialog titles |
| SCENE/Heading/S | 18 / 26 | Bold 700 | `--scene-heading-s` | Card titles, mobile screen titles |
| SCENE/Title | 16 / 24 | Bold 700 | `--scene-title` | List item / panel titles |
| SCENE/Body/L | 16 / 24 | Regular 400 | `--scene-body-l` | Mobile body |
| SCENE/Body/L-Strong | 16 / 24 | Medium 500 | `--scene-body-l-strong` | Emphasised mobile body |
| SCENE/Body/M | 14 / 21 | Regular 400 | `--scene-body-m` | Desktop body, table cells |
| SCENE/Body/M-Strong | 14 / 21 | Bold 700 | `--scene-body-m-strong` | Names and values in tables and cards |
| SCENE/Body/S | 13 / 20 | Regular 400 | `--scene-body-s` | Secondary body, helper text |
| SCENE/Body/S-Strong | 13 / 20 | Bold 700 | `--scene-body-s-strong` | Dense card names (D04, P13) |
| SCENE/Label/L | 18 / 26 | Medium 500 | `--scene-label-l` | Size-48 button labels, field mode |
| SCENE/Label/M | 14 / 21 | Medium 500 | `--scene-label-m` | Buttons (40/32), tabs, field labels, nav |
| SCENE/Label/S | 12 / 17 | Medium 500 | `--scene-label-s` | Badges, chips, table headers |
| SCENE/Caption/M | 12 / 18 | Regular 400 | `--scene-caption-m` | Captions, timestamps |
| SCENE/Caption/S | 11 / 16 | Regular 400 | `--scene-caption-s` | Dense board meta |

**Gaps (TODO, design):** hero numerals of 22–46 px (P13 counters, P01 hero, Bold 22 and 26 titles) and the 9px attendance-bar labels (533 nodes) have no style.

**Korean line breaks:** Figma uses manual ⏎ breaks. In code, use `word-break: keep-all`.

## 4. Components

### 4.1 SCENE / Action (560:3875): 121 variants

**Label content (70):** 5 Types × 48/40 × Default, Hover, Pressed, Focus, Disabled, Loading; **size 32 has Default and Disabled only**. **Icon only (51):** 5 Types × 48/40/32 × Default, Pressed, Disabled, plus **Selected** (Secondary and Tertiary only).

| Figma property | Values (Figma default first) | React (suggested) |
|---|---|---|
| Type | Primary, Secondary, Tertiary, Danger Outline, Danger | `variant: 'primary' \| 'secondary' \| 'tertiary' \| 'danger' \| 'danger-outline'` |
| Size | 48, 40, 32 | `size`. **Code default: 40 on desktop, 48 below the mobile breakpoint.** Dialog footers are always 40. 32 is only for dense tables and toolbars. |
| State Hover / Pressed / Focus | variants | CSS `:hover`, `:active`, `:focus-visible` |
| State Disabled / Loading | variants | `disabled`, `loading` (spinner `__SCENE / Icon / Loading` 554:3873; set `aria-busy`). In Loading the label keeps its normal token at **100% opacity**; only the spinner shows the state. |
| State Selected | Icon only (Secondary, Tertiary) | `<IconButton selected>` → `aria-pressed` / `aria-expanded` |
| Content | Label, Icon only | `<Button>` / `<IconButton>` |
| Label#476:5 | default "버튼" | `children`, or the **required** `aria-label` on `<IconButton>` |
| Show / Leading / Trailing icon (#557:24/30/36/42) | off; swap default 554:3873 | `leadingIcon?`, `trailingIcon?` |
| Icon#2020:0 + Show icon#2020:71 | `__SCENE / Icon / Plus` 2021:103436; on | `icon`: 24/20/16 px at 48/40/32, colour `currentColor` |
| Square label#2020:142 | off | Page numbers (text in the square). Current page Primary/32 with `aria-current="page"`, others Tertiary/32 |

**Measured:** radius 8 everywhere. Padding and gap: 48 → 10/18, gap 8, `SCENE/Label/L` · 40 → 10/16, gap 8, `SCENE/Label/M` · 32 → 6/12, gap 6, `SCENE/Label/M`. Icon only is square with padding 0.

| Type | Default | Hover | Pressed | Disabled | Selected (icon) |
|---|---|---|---|---|---|
| Primary | `action/primary/bg` + `text/on-accent` | `…/bg-hover` | `…/bg-pressed` | `…/bg-disabled` + `…/on-disabled` | – |
| Secondary | `bg/surface`, `border/control`, `text/primary` | `bg/subtle` | `bg/subtle` + `border/control` | `bg/subtle`, `border/default`, `text/disabled` | `bg/selected` + `border/selected` + `text/brand` |
| Tertiary | no fill, `text/brand` | `bg/subtle` | `bg/brand-subtle` | `text/disabled` | `bg/selected` + `text/brand` |
| Danger | `danger/fg` + `text/on-danger` | `danger-hover` | `danger-pressed` | as Primary | – |
| Danger Outline | `bg/surface`, `danger/fg` stroke + label | `danger/bg` | `danger/bg` | `bg/surface`, `border/default`, `text/disabled` | – |

**Destructive rule:** the final confirm of a destructive action in a dialog (삭제, 나가기 confirm and the like) is `danger` (filled, `text/on-danger`). `danger-outline` is for non-final or secondary destructive actions.

Secondary Pressed uses `border/control`, following the outline rule in §2. The Figma master variants were rebound from `border/strong` on 2026-10-08.

**States with no design:** Hover, Pressed, Focus and Loading on size-32 Label buttons, and Hover, Focus and Loading on Icon-only buttons. **Derive them from the same Type's size-40 state:** same bg, border and text tokens; focus ring `focus/ring` 2px with a 2px offset; Loading replaces the label or icon with the spinner and keeps the button width.

**Layout rules**
- **Sizes:** 48 on mobile, 40 on desktop and in all dialog footers, 32 in dense tables and toolbars. Mobile back '‹' buttons are 44×48 Tertiary.
- **Dialogs:** 32px padding (24 on mobile), left-aligned title and body, right-aligned footer with a 12px gap. Mobile footers stack full-width at 48.
- **3-button footer:** primary on the right, secondary to its left, the tertiary text action on the left, with a spacer between (e.g. 638:36465, 816:44664).
- **Icon-only buttons need an `aria-label`.** Never ship the master default '버튼'. Names already used: 조 메뉴, 이전 달 / 다음 달, 이전 페이지 / 다음 페이지, 닫기.
- **Selected** is a persistent open or active state (e.g. column menu open, 1799:87479); **Pressed** is transient press feedback.

### 4.2 Other SCENE components

Uses = top-level instances on live 262:7 (instances nested in other instances are not counted).

| Component | Id | Variants / properties | Uses |
|---|---|---|---|
| Navigation / Sidebar Toggle | 179:12724 | State = Expanded / Collapsed | 143 |
| Common / Work Search · Public Header Actions | 178:12722 · 178:12742 | Text · Show secondary / primary action | 5 · 6 |
| Brand / Wordmark / Primary (Geist) | 111:12 | – | 165 |
| Assignment / Attendance Segment · Timeline | 175:11096 · 175:11105 | Tone = Full / Absent / Partial · Slot 1–7 swaps | nested |
| Assignment / Member Row · Unassigned Card | 176:3725 · 177:12831 | Name, Show drag handle · Name, Metadata, Show more, Show attendance label | 264 · 90 |
| Work / Checklist Item | 183:22987 | State = Incomplete / Complete; Label, Show menu | 74 |
| Work / List Row | 177:13571 | Title, Due, Category, Progress, Show menu / category / assignee 2–3 | 16 |
| Work / Section Header · Group Heading · Local Create | 178:3742 · 178:12660 · 178:12699 | Title, Context · Title, Count, Show indicator · Label | 16 · 9 · 9 |
| Participant / Mobile Header · Mobile Sticky Action | 416:3851 · 434:3851 | Title, Show back, Show more · – | 37 · 24 |
| Operator / Mobile Header · Mobile Work Row · Content Header | 664:42459 · 664:42455 · 567:3898 | Title, Event, Show back · Status, Title, Meta · Title, Subtitle | 32 · 30 · 3 |
| Mobile / Action Group | 562:3943 | Layout = Single / Primary + Secondary / Secondary + Destructive / Inline result | 0 |
| Form Field | 563:3938 | State = Default / Filled / Error / Read only / Disabled; Label, Helper, Error, Value, Required | 23 |
| Consent · OTP | 564:3920 · 565:3946 | State = Unchecked / Checked / Error · State = Input / Resent / Waiting / Error / Expired / Send failed | 3 · 0 |
| Feedback | 566:3916 | Type = Inline Error / Banner / Result / Loading / Skeleton / Empty | 91 |
| Field / Participant Item | 616:3971 | State = Waiting / Arrived / Hold; Name, Meta, Detail | 55 |
| CRM / Dialog · Auth Visual (decorative) | 30:5431 · 30:5363 | Type = Terms / Confirm / Waiting · Type = Login / Signup | 3 · 2 |
| CRM / Brand, Top Nav, Public Shell, Organization Result Row, Terms Block | 30:1626 … 30:5368 | – | 1, 0, 6, 3, nested |
| D04v2 / Participant Card · Attendance Slot (on 262:7) | 1797:13 · 1797:8 | State = Default / Selected / Lifted / Placeholder; Name, Meta, Show Badge, Show Checkbox · Tone = Full / Partial / Absent | 784 · 67 |

`SCENE / Mobile / Action` (476:3876) has been merged into SCENE / Action (Size 48) and no longer exists.

**EOP library components still placed as-is** (top-level uses): Navigation / Sidebar / Menu 1,154 and Sidebar 45 · Rows 244 · Calendar Tile 210 and Bar 6 · Header / Section Header 135 and Top Header 30 · Brand / Logo 98 · Table (Header 98, List 75, Action 15, Table / Header 11) · Task Card 96 · Badge 57 · Tag 51 · Text Field 47 · Search Bar 32 · Checkbox 27 · Avatar 24 · Page Indicator 19 · Pagination 19 · `Icon/*` glyphs · Buttons 28 in total, nested included (§7).

## 5. Copy rules

- **해요체** in all UI copy (…해요, …돼요, …이에요/예요, …었어요). Consent and summary lines too (…동의해요, …확인했어요).
- **Requests:** '…해 주세요'. Use '…해 보세요' only for optional suggestions (empty states, getting started).
- **Wording:** **업무 넘기기** for tasks · **Owner 넘기기** for the role · **나가기**, not 이탈 / 인계 / 위임 / 탈퇴 · **넘기기 / 넘김** for handing over participants (e.g. "현장 총괄에게 넘겼어요").
- **No self-addressing by name** on a user's own screens: use "나" or "지금처럼 혼자 Owner예요".
- **Button labels are short** (넘기기 요청, Owner 수락, 나가기 조건 확인).

## 6. Copy and state notes for code (prototype not updated: Figma flows are frozen)

From UX 검수's last Owner-path review. **Implement these in code**, even where Figma still shows older copy.

| # | Screen | Implement |
|---|---|---|
| a | **791:43188**: 이서연's view after 김하늘 accepts Owner | **One card.** Title **'김하늘님이 Owner를 수락했어요'**. Body **'10월 14일에 Owner 넘기기가 끝나요. 그때까지는 나도 Owner 권한을 그대로 유지해요.'** Remove the separate notice. The screen looks the same whether it's reached right after accepting or later. |
| b | **791:43236**: 김하늘's receive screen | **Accepted:** title **'Owner를 수락했어요'**, body **'10월 14일부터 드림공동체의 Owner예요. 그때까지는 이서연님도 Owner 권한을 유지해요.'**, and a single **[확인]**. This replaces [나중에] and the status line. **Not accepted:** keep the existing request copy with **[나중에]** and **[Owner 수락]**. |
| c | **638:36869** | **'김하늘님이 수락하기 전까지는 지금처럼 혼자 Owner예요.'** (Figma already has it.) |
| d | **1294:44659** '어떤 행사를 계속 볼까요?' | **Open product decision for the Dev Lead:** the default selection. The designer recommends pre-selecting **'계속 보기'**; Figma pre-checks '그만 보기'. |
| e | P14 prototype variables | `D01/handoverTitle` (1862:102844), `handoverBody`, `receivedTitle` and `receivedBody` are unbound leftovers of an interrupted edit. They are inert, so **ignore them**. |
| f | Legacy "old 조 편성" save dialog (851 section, save 851:44766) | Its save actions assume **1조**. Don't model logic on it: **D04 v2** (section 816:43447) is the main board. |

## 7. Known gaps / not done

| Area | Gap | Source |
|---|---|---|
| Buttons | **38 real-UI buttons still carry library or hex paint** (30 on 262:7, mostly the superseded P09 A01–B06 header and notice buttons, plus 편성 저장 288:24931 and a few P08 copies; 8 on 4:3: CRM Dialog, 시작하기, REFERENCE). 44 more sit inside the static Auth Visual art. Earlier unswapped-instance count: **28 library Buttons instances remain:** 22 decorative CRM Auth Visual buttons, 5 P03 rows-per-page selects, and 1 unlabeled control (323:26902). 21 hidden "Legacy" frames are kept as reference. | b8 rollout §9 |
| Buttons | **Steppers** (1819:51184, 1819:51186, 1819:98074, 1819:98081) are hand-built segments. **They need a Stepper component.** | b8 §9.3 |
| Buttons | Tertiary **Pressed** (#E4F1F3) and **Selected** (#D6ECEF) look very similar. Other close × and carousel buttons weren't converted to Icon only. Of 103 non-auto-layout buttons, constraints were inferred and **17 are left at the MIN/MIN default**. | b8 §9.3, §9.4, §11 |
| Colour | **204 hex paints remain in scope** (+18 effect hex on 4:3 button masters): 93 button-skip (raw-green "CRM Button" overrides) and 111 kept on purpose (art/logos 25, Auth Visual mock 34, traffic-light dots 15, category dots 19, annotation outlines 5, hotspots 3, sanctioned static #FFFFFF 10, including the Auth Visual master headlines). | color/final, final_leftovers |
| Colour | **287 library-bound paints remain** (after the UX fix runs ux1, ux1b and c43): mostly decorative library CRM button overrides, art, and 20 avatar circles (avatar colours come with Color Master's v2.2 category set). Badge · Owner 1301:44746 now has a `bg/brand-subtle` fill, but its text can't be rebound because it is a remote-library instance with no exposed layers; it sits in a hidden row. In code, use `bg/brand-subtle` + `text/brand` for the Owner role badge. | final_leftovers |
| Colour | **39 of 730 screens are not fully bound.** 16 of them are in the non-live sections 262:16 and 281:21879. The rest are button-skip paints, the Auth Visual mock, category dots, annotations and hotspots. | color/final |
| D04 | The legacy frames are fully bound but are not the build target. D04 v2 has no Dark frames for the drag, over-capacity, popover or dialog states; the tokens pass contrast. | final, D04 re-check |
| Type | **107 typography override flags** on instance sublayers (P13 participant rows, Consent). Hero-numeral and 9px label styles are missing (§3). | copy-type notes |

## 8. Before / after metrics

| Metric | Before | After (final) | Baseline / source |
|---|---|---|---|
| **Hex share, in scope** | **33.7%** (17,492 / 51,869) | **0.39%** (204 / 52,186); 0.37% without the 10 sanctioned whites | Colour morning baseline 10-08 → final pass (`color/final.md`). The 10-06 audit had 47% (fills + strokes, 262:7 only) |
| Hex share by area | – | 262:7 excl. D04 0.48% (161) · D04 0% · 4:3 2.11% (41) · 4:4 0% | final.md |
| **Library-bound paints, in scope** | **1,010** (start of final pass) | **287** | final.md, ux1/notes.md, ux1/c43_notes.md |
| Library variables, 262:7 | 13,817 excl. D04 (batch 2 start); D04 248 | **179** excl. D04; **D04 0** | batch 2 → final |
| **Fully bound screens** | 637 / 730 (batch 3); 456 / 703 (batch 2) | **696 / 730** (664/698 excl. D04; **D04 32/32**) | final.md. There is **no figure from before the colour batches**. |
| **Library Buttons** | 664 placed, 616 overridden (93%) | **28** (181 after phase 1) | audit 10-06 → b8 rollout + Figma recount |
| **SCENE / Action instances** | 477 local (incl. Mobile / Action), 351 overridden | **1,540** (1,386 Label + 154 Icon only) | audit → Figma recount 10-08 |
| **Hand-built buttons** | 98 (audit) / 114 convertible (rollout) | **0** convertible (21 hidden Legacy frames + 4 stepper segments kept) | audit → b8 rollout |
| Non-해요체 strings | **284** occurrences / 202 unique | B7 converted 285 + 47 + 4 nodes. This round's detector: **73 → 35 → 10**, all annotations, **0 UI** | audit regex → fix2 → copy-type (broader detector incl. 이탈/인계/위임) |
| Text nodes with a style (262:7) | 1,672 / 15,158 (**11.0%**) | 11,095 / 15,155 (**73.2%**): 9,458 SCENE + 1,637 EOP | copy-type notes |
| Fonts (262:7 text nodes) | Inter 3,287 · Noto 11,686 · Geist 185 | Inter **2,596** · Noto **12,374** · Geist 185 | copy-type notes |
| Flows on 262:7 | 42 | **42** | every report |
| Reactions on 262:7 (nodes / reactions / actions) | 1277 / 1279 / 5040 | **unchanged** (hash 3227955030) | b8, color batches 1–3 and final |
| Reactions, file-wide flat | 1462 / 1466 / 1150 navs / 5232 | **unchanged** | b8; colour reaction hashes identical on all pages |

## Prototype links left for code (GitHub #107)
These were never wired in the prototype (checked against the pre-cleanup baseline), so build them in code:
- P03 265:10288: the pagination › in 265:10315 goes to the next page.
- P06 267:18607: month ‹ 267:18617 and › 267:18627 change the month, and [오늘] 2017:61449 jumps to today.
- D04 legacy 816:44637 '민서윤 배정': [1조 선택]/[2조 선택] open the save dialog, and the chosen group should carry into the save message (Figma sets D04/target, not P10/pickedGroup). D04 v2 is the build target.
- Copy note for the save dialog 816:44654 (from UX 검수): the title is '추가 배정을 저장할까요?', so in code the primary button should read **[배정 저장]** (not '편성 저장') to match the title.
- OTP resend ('인증번호 다시 받기', 565:3914): while the countdown runs, the link is disabled (`text/disabled` at 100%) and the countdown uses `text/secondary`. When active it is `text/brand` at 100%. Don't fake disabled with opacity anywhere.
