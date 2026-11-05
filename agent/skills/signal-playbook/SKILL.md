---
name: signal-playbook
description: What you know about Silk Board junction and how to size signal greens. Use it for every plan, before you write any numbers.
---

# Signal playbook

## Measured discharge (vehicles per lane per hour of busy green, dry weather)
- N (Hosur, city side): ~1650 per lane.
- E (ORR from HSR/Agara): ~1550 per lane.
- W (ORR from BTM): ~1450 per lane. It has only 2 lanes.
- S (Hosur from Electronic City): only ~1040 per lane. It is about 35% slower than N despite 3 lanes. Treat S as the bottleneck.
- Heavy rain or monsoon: multiply every flow by ~0.80 (N ~1300, E ~1250, S ~850, W ~1150).
- Storage is about 120 vehicles per approach. Past that, vehicles are turned away (gridlock). Gridlock is the worst outcome, so never let a queue reach ~100.

## Lessons from failures
- Greens in the last run were far too short (the four greens summed to only ~45-65 s). Lost time at each phase change (~3-4 s per phase) ate a large share of the cycle. Short cycles served too few vehicles, queues carried over from window to window, and waits reached hundreds of seconds.
- Splitting green in proportion to arrivals starved S. S needs about 1.6 times the green per vehicle that N needs. Split by demand ratio, not by raw arrivals.
- A slightly longer cycle costs a few seconds of wait. An undersized cycle costs hundreds of seconds and gridlock. When unsure, go longer.

## Method (do this every window)
1. Demand ratio per approach: y = arrivals_in_window × 4 / (lanes × flow_per_lane). Use the flows above, and add any backlog carried from the previous window to the arrivals.
2. Y = sum of the four y values. Lost time L ≈ 16 s per cycle (4 phases × ~4 s).
3. Cycle C = (1.5·L + 5) / (1 − Y). Keep Y below 0.9. If Y ≥ 0.85, use the maximum cycle the rules allow.
4. Typical cycles: Y of 0.6-0.7 gives ~90-110 s. Y of 0.75-0.9 gives 120 s or more, up to the rules' limit.
5. Total green = C − L. Give each approach green = total green × y / Y.
6. Pad S (and any approach with a growing queue) by 10-15% and take the green from the approach with the lowest y.
7. Enforce the rules' min and max green. If a max green binds on S, give S its max and shrink the others to their minimum viable share.
8. Check each approach: lanes × flow × green / C × (900 / C cycles per window) must exceed its arrivals by at least 10%. If it doesn't, lengthen the cycle.
9. The busiest window (peak 15 minutes) needs the longest cycle. Lighter windows, such as the first and last, can use shorter cycles of ~80-100 s so the queue from the peak can drain.
10. In rain, recompute everything with the 0.8 flows. Y rises sharply, so use long cycles from the first window and do not wait for queues to build.

## Approach notes
- Weekday morning: S and E are heavy, N and W are light. Give S the most green.
- Weekday evening: N is heaviest, then E. S is slower, so it still needs a proportionally large green despite lower arrivals. W is light but only has 2 lanes.
- Midday: S and N are heavy, with S the largest per-lane demand. Do not shortchange S.
- Check which approach has the highest y, not the highest arrivals. That approach gets the largest green.
