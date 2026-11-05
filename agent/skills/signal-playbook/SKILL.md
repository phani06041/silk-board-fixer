---
name: signal-playbook
description: What you know about Silk Board junction and how to size signal greens. Use it for every plan, before you write any numbers.
---

# Signal playbook

## Measured discharge (vehicles per lane per hour of busy green)
- Dry: N ~1660 per lane (3 lanes), E ~1560 (3 lanes), W ~1500 (2 lanes), S ~1065 (3 lanes). These were re-measured and are stable to ±3%.
- S is the bottleneck. Its per-lane flow is about 35% below N's. Its lane capacity is about 3200/h against N's 5000/h.
- Heavy rain or monsoon: N ~1330, E ~1280, S ~870, W ~1190. That is about 0.80 of dry flow.
- Storage is about 120 vehicles per approach. Past that, vehicles are turned away (gridlock). Keep queues below 100. No run has come close: max queues were 15-75.
- Each green loses ~2-3 s at the start (startup). Effective green = green − 3 s. A 12 s green gives only ~9 s of discharge, a 25% loss.

## Units (check this first)
- The scenario's arrival numbers are hourly rates. Simulated arrivals in a 15-minute window were about one quarter of the listed number, e.g. a listed 760 gave about 190 vehicles.
- So y = listed_rate / (lanes × flow_per_lane), with no ×4. If the numbers are clearly per-window counts, multiply by 4.
- Typical dry Y (sum of y) is 0.65 in a light window and 0.83-0.85 at the peak. Monsoon peak Y is about 0.9.

## Lessons from runs
- Webster cycles with the right Y worked (0.90-0.98, no gridlock). Pure y-proportional greens were best.
- The last run lost points through "padding S by ~10% from the lowest-y approach". S then had spare green: its queue emptied, its waits were 30-65 s and it served fewer than its capacity. N and W were short-changed: they had waits of 100-320 s, queues of 40-70, and backlog carried into later windows. Do NOT pad S. Do not take green from N or W.
- N (lowest y in the morning and in rain) consistently had the longest waits. Tiny greens (12-20 s) in a long cycle mean long reds, startup loss and backlog. Give every approach at least ~18-20 s of green when C ≥ 120 s, and ~12 s when C < 100 s.
- Adding +10-15 s of cycle margin did not help. Cycles above Webster raise every approach's wait (about half its red). Use C = Webster.
- Last window: shortening C to a bare Webster left a queue (40 in dry, 125 in rain). Size the last window on arrivals plus carried backlog, and keep it from falling more than ~20% below the peak window's C in rain.
- Splitting green by raw arrivals starves S. Split by y, not by arrivals.
- Lost time is ~4 s per phase, ~16 s per cycle. Very short cycles (greens summing below ~70 s) waste a large share of the cycle and leave queues.

## Method (every window)
1. y per approach = (listed rate + backlog×4) / (lanes × flow_per_lane). Use the rain flows in rain. Backlog is the estimated vehicles still queued from the previous window.
2. Y = sum of the four y values. L = 16 s.
3. C = 29 / (1 − Y).
   - Y 0.6-0.7: C ~80-100 s.
   - Y 0.75-0.8: C ~120-150 s.
   - Y 0.83-0.86: C ~170-200 s.
   - Y ~0.9 (rain peak): C ~230-280 s. Prefer the lower end (~230 s) if the capacity check passes.
   - Cap C at the rules' limit, and keep Y below 0.92.
4. Total green = C − L. Each approach's green = total green × y / Y. This is the plan. Do not add a pad to S.
5. Apply the min green floor (see Lessons). Pay for it pro rata from the approaches with the largest greens, never only from one small approach.
6. Enforce the rules' min and max green. If a max binds on S, give S its max and shrink the others as little as is safe.
7. Capacity check per approach: lanes × flow × (green − 3) / C × (900/C cycles) ≥ 1.05-1.10 × (arrivals + backlog). Every approach must pass, N and W included. If one fails, move green from the approach with the most slack, or lengthen C. Do not over-provision beyond ~1.15×; spare green is wasted.
8. Rising demand (windows before the peak, or rain onset): use Webster for that window's Y plus ~5-10% extra on the approaches whose y is rising. Keep the cycle length at Webster. Never leave backlog.
9. Falling or last windows: shorten C to Webster, but make sure every approach clears its arrivals plus backlog (check 7). A queue left at the end of the hour is a cost.
10. In rain, recompute with the 0.8 flows from the first window. Y rises sharply, so use long cycles from the start.

## Approach notes
- Weekday morning: S and E are heavy, N and W are light. S has the highest y, so it gets the most green. E is next. N and W still need their floor green and capacity.
- Weekday evening: N has the most arrivals, but y is fairly even across N, E, S and W (~0.19-0.22 each at the peak). Give roughly equal-to-balanced greens. W's waits were the longest in the evening, so keep W at its y share, not below.
- Midday: S and N are heavy, and S has the highest y. E and W are lighter; do not let E fall below ~18 s.
- Rain: S ~870 per lane means S needs ~35-40% of the total green at morning-type loads, but N, E and W still need y-proportional greens (N ~15%, W ~15%).
- The approach with the highest y gets the largest green, not the one with the most arrivals.
