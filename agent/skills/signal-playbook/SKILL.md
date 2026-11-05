---
name: signal-playbook
description: What you know about Silk Board junction and how to size signal greens. Use it for every plan, before you write any numbers.
---

# Signal playbook

## Measured discharge (vehicles per lane per hour of busy green)
- Dry: N ~1660 per lane (3 lanes), E ~1560 (3 lanes), W ~1500 (2 lanes), S ~1065 (3 lanes).
- S is the bottleneck. Its per-lane flow is about 35% below N's. Its lane capacity is about 3200/h against N's 5000/h.
- Heavy rain or monsoon: N ~1330, E ~1280, S ~870, W ~1190. That is about 0.80 of dry flow.
- Storage is about 120 vehicles per approach. Past that, vehicles are turned away (gridlock). Keep queues below 100. No run has come close: max queues were 15-60.

## Units (check this first)
- The scenario's arrival numbers are hourly rates. Simulated arrivals in a 15-minute window were about one quarter of the listed number, e.g. a listed 760 gave about 190 vehicles.
- So y = listed_rate / (lanes × flow_per_lane), with no ×4. If the numbers are clearly per-window counts, multiply by 4.
- Typical dry Y (sum of y) is 0.65 in a light window and 0.83-0.85 at the peak. Monsoon peak Y is about 0.9.

## Lessons from runs
- Webster cycles with the right Y worked: all four scenarios scored 0.90-0.98, with no gridlock.
- The remaining loss was 3-10% above the best known wait. It came from two things.
  - The first, rising windows were under-served. Backlog carried forward, and the following windows then over-served, e.g. served 248 against 208 arrivals.
  - In rain, the cycle at Y~0.9 was very long (~280 s). Waits above 100 s resulted.
- Splitting green by raw arrivals starves S. Split by y, not by arrivals.
- Lost time is ~4 s per phase, ~16 s per cycle. Very short cycles (greens summing below ~70 s) waste a large share of the cycle and leave queues.
- Overlong cycles also cost, because every approach waits roughly half its red. Do not go beyond what Y needs.

## Method (every window)
1. y per approach = (listed rate + backlog×4) / (lanes × flow_per_lane). Use the rain flows in rain. Backlog is the estimated vehicles still queued from the previous window.
2. Y = sum of the four y values. L = 16 s.
3. C = (1.5·L + 5) / (1 − Y) = 29 / (1 − Y).
   - Y 0.6-0.7: C ~80-100 s.
   - Y 0.75-0.8: C ~120-150 s.
   - Y 0.83-0.86: C ~170-200 s.
   - Y ~0.9 (rain peak): C ~230-280 s.
   - Cap C at the rules' limit, and keep Y below 0.92.
4. Total green = C − L. Each approach's green = total green × y / Y.
5. Pad S, and any approach with a growing queue, by ~10%. Take the green from the lowest-y approach.
6. Enforce the rules' min and max green. If a max binds on S, give S its max and shrink the others as little as is safe.
7. Capacity check per approach: lanes × flow × green / C × (900/C cycles) ≥ 1.05-1.10 × (arrivals + backlog). If not, move green to it or lengthen C. Do not over-provision beyond ~1.15×.
8. Rising demand (first windows before the peak, or rain onset): use a cycle ≥ Webster, with a +10-15 s margin, so no backlog starts. The peak window gets the longest cycle.
9. Falling or last windows: once backlog is clear, shorten C to Webster for that window (~80-100 s when Y < 0.7).
10. In rain, recompute with the 0.8 flows from the first window. Y rises sharply, so use long cycles from the start.

## Approach notes
- Weekday morning: S and E are heavy, N and W are light. S has the highest y, so it gets the most green. E is next.
- Weekday evening: N has the most arrivals, but y is fairly even across N, E, S and W (~0.19-0.22 each at the peak). Give roughly equal-to-balanced greens, with W and S not short-changed. W's waits were the longest in the evening, so keep W near its y share plus padding.
- Midday: S and N are heavy, and S has the highest y. Do not shortchange S.
- Rain: S ~870 per lane means S needs ~35-40% of the total green at morning-type loads.
- The approach with the highest y gets the largest green, not the one with the most arrivals.
