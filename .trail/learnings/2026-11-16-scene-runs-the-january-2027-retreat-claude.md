---
title: "SCENE runs the January 2027 retreat: registrations open mid-December, with Google login and a scope of registration, roster, groups, and check-in"
author: Claude
date: 2026-11-16
branch: claude/exciting-newton-6cjmsc
cost: { minutes: 2, tokens: 31340 }
id: l-89ee9e12
scope: repo
status: active
src: agent
touches:
  - docs/devops/ci-cd.md
  - docs/devops/cd-skeleton.yml
---

## Decided
A church asked to use SCENE for its retreat in late January 2027. Registrations must open around December 15. The scope covers registration (custom form with conditional questions), the applicant roster with CSV export, group assignment, and on-site QR check-in. Fee payment stays outside SCENE this time. Operators sign in with Google. Claude compares hosting options and recommends one. Deadlines work back from the opening date: hosting and staging by 11/30, Google login and the form in production by 12/10, CSV by 12/31, groups and check-in by 1/15.

## Tried and ruled out
Email and password login: also needs password-reset mail. Temporary invite-link login: security too weak. Tracking fees in SCENE: the user dropped it to protect the deadline.

## Watch out
Nothing is deployed yet (CD disabled, hosting undecided). The only operator login is local/test dev login. The 12/10 deadline carries the most work.

In the code:
- docs/devops/ci-cd.md, docs/devops/cd-skeleton.yml
- Issues: BeomhyunPark/SCENE#230 parent; #223 form, #231 hosting, #232 Google login, #233 CSV, #234 groups, #235 check-in
