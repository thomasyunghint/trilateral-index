# TGFI Milestones — Demo Ready by Wed May 21, 2026

## DONE ✅

### M1: Data Pipeline (Phase 1+2)
- [x] 11 RSS sources confirmed working (0 paywall issues)
- [x] Neon PostgreSQL schema deployed
- [x] Vercel cron auto-ingesting every 30 min
- [x] Haiku extracting claims every 30 min (offset 5 min)
- [x] 150 articles, 55 claims in DB
- **Evidence:** `/api/status` returns live counts + `last_ingest` timestamp

---

## TODO (ordered by priority)

### M2: Historical Backfill — Due: Sun 5/18
**Task:** Scrape past 2 years from each source's archive page
**Deliverable:** 2000+ articles in DB, 500+ claims extracted
**Evidence:** `/api/status` shows article count jump from 150 → 2000+
**API cost:** ~$6-10 (within budget, can batch over 2 days)
**Method:** One script per source, paginate archive pages, run once

### M3: Detection Engine (Phase 3) — Due: Mon 5/19
**Task:** Cross-reference claims to find patterns
**Deliverable:** `/api/signals` endpoint returns detected patterns
**Evidence:** JSON response with signal objects (type, score, supporting claims)
**Detection types:**
1. Cross-bucket divergence (trade says X, investment says Y)
2. Rhetoric vs action gap
3. Temporal flip (direction changed in 30 days)
4. Bilateral asymmetry (CN-US score ≠ US-CN score)

### M4: Demo Frontend — Due: Tue 5/20
**Task:** Website shows insights, not raw JSON
**Deliverable:** 3 pages max (Dashboard, Signal Detail, Sources)
**Evidence:** Screenshot of working website with real data
**Design:** Dark bg, institutional-grade, no emojis, 3D viz optional

### M5: Demo Prep — Due: Wed 5/21 morning
**Task:** Verify end-to-end, prepare talking points
**Deliverable:** Live demo showing: "here's what the system found this week"
**Evidence:** Prof Jin sees real insights from real papers she knows

---

## NOT for this sprint (after demo)

- Phase 4: Debate swarm (5 Opus agents) — expensive, needs Opus budget
- Phase 5: Full output system
- Phase 6: Lifecycle management
- Full backfill of CN-language sources (needs translation)
- Knowledge graph construction
