---
title: handover snapshot is not a product decision
author: BeomhyunPark
date: 2026-10-20
branch: docs/handover-2026-10-20
touches:
  - docs/handover/2026-10-20.md
  - docs/README.md
---

## Decided
- The 2026-10-20 handover lives at docs/handover/2026-10-20.md and is linked from docs/README.md. It records main da91a00: which screens call the server, which APIs have no screen, and which routes do not exist.
- The next slice is not chosen. The nearest hole to the finished participant flow is the operator application list. The server can read applications. The participants screen still says nobody has applied.

## Tried and ruled out
- Editing PRODUCT_DECISIONS.md, PRODUCT_DEFINITION.md, or docs/architecture to make them match this snapshot.

## Watch out
- If this note and backend/docs/api.md disagree, api.md and the decision docs win. The handover is a status record.
