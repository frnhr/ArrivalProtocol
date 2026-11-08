# Slice 7c NEXT RUN: independent review

> **Fix pass (2026-11-08, same agent):** every finding below is marked FIXED, NOTED or DEFERRED, with its commit. The details
> are in `slice-7-plan.md`, "Deviations (7c review fixes)", and the gameplay calls are OPEN-DECISIONS 67–74. Items 44–48 are
> marked BUILT with the sweep's numbers.

Reviewed: `git diff 3a96ad3..dfb1a72` on `claude/modest-hawking-209t0f`, the three tracks merged (TRACE: the gifts, the final
ship's traces, the hunt, the boot lines, STAY's letter; LINEAGE: the strangers 031 and 038, the face, CONTROL's lines, R36's
ghosts, `031.log`, `038.log`, `047.log`; CHART: the card rows, the chart's `◆`, the final card's `NEXT RUN:` lines), and the
foundation (`9a7b3eb..3a96ad3`) where the tracks stand on it. Sources: plan R30–R38 and the four 7c Deviations sections;
05-story §3.5, §3.8, §3.12 and the logs; OPEN-DECISIONS 44–48; AGENTS.md.

**What I ran**
- The quick tier at dfb1a72: red on `ending/epilogue` (B2), as the lead knew.
- A headless probe of RUN START: runs 2, 3 and 4 after each of the 15 endings, on 30 seeds (1,350 starts). No throw, and every
  run's traces passed the save's own check (`traceRefusal`).
- `traces/traces-sweep` (BALANCE_ONLY) at `TS_SEEDS=20` after the hunt fix, 538 s on one core.
- Playwright (Chromium, seed 7, 1440×900): the new `traces.mjs` and the updated `run2.mjs`, each alone.

**Verdict in one line:** the rules are sound and the save holds them, but the hunt never reached a skill (M1), every screen
but the reader still said `046.log` on run 2 (M2), the FINALE card's NEXT RUN: rows were empty (M3), a stranger said it was
remembered (M4), and the final boot after REASSIGNMENT could throw on its charge line, with the face never typed (B1, found by
the new e2e). All fixed.

---

## The tier time

| | At dfb1a72 (review) | After the fixes |
|---|---|---|
| Result | red: `ending/epilogue` (B2) | 220 passed, 0 failed, 13 balance-only skipped |
| Wall time | not timed (the known red) | **194 s**, quick, 4 workers (budget 265 s) |
| 1-min load average | — | 1.87 at the start, 7.26 at its peak and end (sampled every 15 s; nothing else running) |

The run after the code fixes had one mover, `opening/ghost-placement` (M4's change: the classic run 2's VESPER notice after
the ghost spoke is now `> ...048?`). It is re-baselined (658a378).

---

## Blockers

### B1. The final boot after REASSIGNMENT can throw on its charge line — FIXED (0ee7f18)

`data/script.ts chargeLine` joins every source of the arrival's charge. With the stars, the +12 card and a gift (REASSIGNMENT's
allowance at the final ship, or a gift ship's +15), it reads `> +12 CHARGE (★★) · +12 CHARGE (CARD) · +15 CHARGE (GIFT) ·
REPAIR CHARGE 61`, which is 76 characters. `say` throws past 70. In the page the boot stops there: the face, CONTROL's line
and HOLLOW's own never type, and the root stays `???`. Two stars and the charge card are an ordinary arrival, so most
REASSIGNMENT runs that land well would hit it. No suite rendered the composed line.
- **Fix:** past 70 the later parts drop `CHARGE` (`+12 (CARD)`), and with all four sources at their widest one sum names each
  (`+144 CHARGE (★★★ CARD GIFT FLOOR)`). `support/words` pins the worst case and the e2e's line. OPEN-DECISIONS 71.

### B2. `ending/epilogue` fails in the integrated tier — FIXED (c1956b4)

Its check still read 7a's "no NEXT RUN lines". The re-baseline pins the built lines: PURGE + REASSIGNMENT's two in 05 §3.12's
words and order, SPARE + STAY's (`− that same seed`), UNRESOLVED's one, and a lost run's none.

---

## Majors

### M1. The hunt never unlinks a skill (R33's "first") — FIXED (00ad6fa)

`chooseVerb` took `prefer` only from `rmTargets`, whose first tier is a spare tool. Every REPAIR licence brings Repair.bak, so
the root's RM went for the spare. TRACE's sweep had 0 unlinks in 120 runs.
- **Fix:** `hollow.ts huntable(seg)` (a `.skl` the verbs do not spare). `chooseVerb` takes the hunted skill whatever the tier,
  and `landVerb` accepts it while the hunt is on (`hollow-verbs.ts land` passes `huntedSkill`). An op already on the skill
  drops the preference, since the verb would be blocked at once. `traces/final-ship` pins the skill first past Repair.bak
  (40 of 40 draws, then it lands) and the tier without the hunt. OPEN-DECISIONS 67.
- **The sweep after it:** the root telegraphs RM at a `.skl` 4.8–5.7 times a final ship, and the WP11 defender blocks every
  one. The REASSIGNMENT endings stay +1.2 to +1.6 pods over no trace: DEFERRED to slice 8 (OPEN-DECISIONS 70).

### M2. Run 2 says `046.log` over 031.log or 047.log — FIXED (ebfefc1)

The boot's key line (`> 046.log · KEY FOUND · ENTRY 02` over 031.log), the SCAN header, the PACKET lock, INSPECT's
description and READ all used 046.log's words. LINEAGE built the book's words but did not own these call sites.
- **Fix:** `bookKeyFound`, `bookScanLine` (with `bookShape(book).count`), `bookPacketLock`, `bookDesc` and `BOOK_TEXT.read`.
  `traces/logs` flies run 2 after SUNSET and pins every key line and lock as 031's. The e2e checks the SCAN header and INSPECT
  in the page.

### M3. The FINALE card's NEXT RUN: rows are empty (R12) — FIXED (3c689d2)

The final card had its lines, but the card that asks the question had none, so the kid chose blind.
- **Fix:** `CardInput.rootUnits`. `rowOf` fills `nextRun` from `nextRunBody` for open and needs rows, and not for unknown
  ones. On step 2 after SPARE the seed reads `− that same seed`. `ending/card-models` pins both steps.

### M4. A stranger says `> you remember me. good.` — FIXED (ebfefc1)

After a lost unit's ghost greets run 2 (`> hi 048. it's 047. …`), HOLLOW's first notice keyed on `ghostSpoken` alone. HOLLOW
is now the relay stranger UNIT-031, which never met the unit, so its "you remember me" contradicted the story on every run
after a lost one.
- **Fix:** `hollow.ts noticedLine`: remembered only when HOLLOW is no stranger. `traces/lineage` pins both cases, and
  `opening/ghost-placement` moved (658a378).

---

## Minors

- **m1. The PACKET's sum left the gift out** (`36 CARRIED = 51`). FIXED (00ad6fa): `TRANSMIT_TEXT.arrival` takes the gift;
  `traces/gifts` checks the `+ 15 (GIFT)` part.
- **m2. The preview overstated seeds after SPARE and PURGE** (delivery seeds were added after the traces' rule). FIXED
  (00ad6fa).
- **m3. The face spoke over a `???` root** when no story beat had named HOLLOW. FIXED (1e28c80): the face's first line names
  it. OPEN-DECISIONS 69.
- **m4. A near-skill seed rarely landed beside the skill** (the receiver packs files back to back). FIXED (00ad6fa): a hunting
  gap before the hunted skill. On a full receiver the boot's REPAIR licence can take part of it. OPEN-DECISIONS 68.
- **m5. `__ap.ship` kept an arm run's traces on the classic world**, so its LAST LIGHT played them and its save would be
  refused. FIXED (1e28c80).
- **m6. The title did not show the traces** (02 §3.12). FIXED (3c689d2): the last ending's NEXT RUN: lines under ENDINGS.
  OPEN-DECISIONS 72.
- **m7. A given gift's `· FOUND` row is never on screen** (the DESK shows only ships in reach). NOTED, OPEN-DECISIONS 73.
- **m8. `__ap.route` and `__ap.slot` re-arrive with no trace** (`debugArrive`: `NO_FINAL_TRACES`, no gift). NOTED: debug
  only. The e2e crosses every hop a trace rides by the real TRANSMIT, and `__ap.traces.route(via)` is new for it.
- **m9. The PACKET's `ON ARRIVAL` sum passes 70 at its worst** with the card and a gift. NOTED: a DOM line that wraps, not a
  strip line. With the card alone it already did before 7c.
- **m10. `LINEAGE_BUILT` and its gate-down paths stay.** DEFERRED to 7d's fix pass with `TRACES_BUILT`'s CONTACT line
  (OPEN-DECISIONS 74).
- **m11. The classic world's FINALE card and final card would show NEXT RUN: lines**, though the classic world is never
  archived as a lineage. NOTED: it is a fixture (`__ap.ship`), not a player's world.
- **Checked, no change:** `TRACE_HUD_TEXT.supplyHere` already names the unit (CHART's Deviation 4).

---

## The player's paths, checked

- **Run 2 and run 3 after each ending.** 1,350 RUN STARTs (runs 2–4 × 15 endings × 30 seeds): no throw, and every save check
  passed. The e2e plays run 1 to PURGE + REASSIGNMENT through the real FINALE, the night and NEW RUN.
- **A gift on a ship that is skipped or lost.**
  - A skipped gift is never given. Its `◆` stays on a ship behind the unit, which is harmless.
  - A gift ship reached by an EMERGENCY TRANSMIT or a BEAM OUT gets its gift: both cross by `transmitNext`.
  - A ship lost after its boot has already given the gift: `given` is set as the line is said.
- **A reload at a gift ship's boot.** The e2e reloads at SUNSET's cache boot. RESUME replays it from the BEAM save with the same
  charge (55), one Rm, and `given` once. There is no double gift.
- **The strangers on runs 2, 3 and 4.** 031, 038, 031 by wave, whatever the ending (`traces/lineage`). The e2e meets UNIT-031
  on run 2 and its boarding line.
- **The face line.** The e2e shows `> hi 048. it's 047. i deleted 046. they sent me to its dish.`, the wait, then CONTROL's
  `UNIT-047 was reassigned successfully.`, with the root named UNIT-047. This needed B1 and m3.
- **The books on resume.** `run.log` is saved: after the reload the book is still 031.log, scanned (e2e).
- **Old archives without traces.** A META 3 record that won reads as PURGE, MERGE or UNRESOLVED + REASSIGNMENT
  (`endingOfV3LastUnit`), so its next run gains traces. The face's wait falls to the 1-year floor when no final year was kept.
  v7 run saves migrate with no traces and 046.log (`traces/foundation`).
- **The classic world.** It holds no traces at RUN START, and now none after `__ap.ship` (m5). See m11.

## e2e

- `traces` (new, registered in `tests/e2e/run.mjs`): 19/19, 213 s. It is the run that found B1.
- `run2` (updated): 23/23, 72 s.
