// Slice 4c, Track DROP (plan §8.1): AUTODROP's pure parts (systems/autodrop-plan.ts), and its words at their worst.
// • centredVolley on a crafted window (sure ±4 tac s at ×20, cadence 2.0): one pod at the centre; four at −3, −1, +1, +3 s;
//   R5's untrained 1.5 s late sends 3 of 4; R6's degraded cadence (2.7) still straddles the centre (3 pods); a hold that
//   starts late shrinks the volley to what is left; a short bay caps it, and an empty one waits for its reloads.
// • bayBy: 01 §3.4's double window (four launches, then one reload by 20 tac s); passRows' `B ×3 — BAY HAS 1 BY THEN`.
// • planLanding on run 1's arm (a real locked orbit, the real drop solution; only the plan is asked): CORMORANT's 9 pods into
//   2 LZs in 2 passes; VESPER's 16-pod ark, complete; the healthiest drivers to the narrowest LZ; never-fits with the REPAIR
//   that fixes it and the wrong-split leftovers in the last rows; rows past validUntilTSec drawn as a forecast; the memo
//   (R18) under 1 ms on the ark.
// • centreOffsetTac: a launch's offset from its window's centre; dropDemoOffset (review M3): against the strip's cued slot;
//   both null off-site.
// • Every AUTODROP string at its worst case ≤ MAX_LINE_CHARS (foundation review m6: in the track's own suite).
import { check, finish } from '../landing/checks';
import { createHarness7 } from '../wp7/harness7';
import { armLanding, ARM } from './autodrop-arm';
import type { GameState } from '@state/schema';
import type { BayState, DropSolution, LandingView, LaunchRecord, LzWindow } from '@/types/landing';
import {
  bayBy, centredVolley, centreOffsetTac, dropDemoOffset, forgetPlanMemo, passRows, planLanding, volleySlots,
} from '@systems/autodrop-plan';
import { getDropSolution } from '@systems/drop-cache';
import { landingView } from '@systems/landing-rules';
import { capabilitiesNow } from '@systems/capabilities';
import { AUTODROP_TEXT } from '@data/autodrop-text';
import { LANDING_ECHO } from '@data/landing-text';
import { AUTODROP_PLAN_MAX_PASSES, MAX_LINE_CHARS } from '@data/tuning';

const WARP = 20;
const near = (a: number, b: number, tol = 1e-6): boolean => Math.abs(a - b) <= tol;

// --- A crafted window: centre at 1,000 game s, open ±10 tac s, sure ±4 tac s, in band ±15 --------------------------------
function lzWindow(lz: string, centre: number): LzWindow {
  return {
    lz, openInSec: centre - 200, closeInSec: centre + 200, sureOpenInSec: centre - 80, sureCloseInSec: centre + 80,
    launchRadius: 6000, halfWidthKm: 50, inBandOpenInSec: centre - 300, inBandCloseInSec: centre + 300, inBand: true, launchRad: 0,
  };
}
const W = lzWindow('LZ-A', 1000);
function solutionOf(windows: LzWindow[]): DropSolution {
  return {
    asOfTSec: 0, periodSec: 100_000, block: null, dot: { rad: 0, halfWidthKm: 50, launchRadius: 6000, inBand: true, uncertain: false },
    arc: [], windows, uncertain: false, validUntilTSec: null,
  };
}
const FULL_BAY: BayState = { loaded: 4, reloadTac: 0, cadenceLeftTac: 0 };
function viewOf(windows: LzWindow[], bay: BayState = FULL_BAY, cadenceTac = 2): LandingView {
  return { solution: solutionOf(windows), bay: { ...bay, cadenceTac, shown: bay.loaded }, queue: [], remaining: { 'LZ-A': 4, 'LZ-B': 4 }, aboard: 8, falling: 0 };
}
// The slots of a volley, as tactical s from the window's centre.
function slotsOf(volley: ReturnType<typeof centredVolley>, centre = 1000): number[] {
  if (volley === null) return [];
  return Array.from({ length: volley.n }, (_, i) => (volley.firstAtTSec + i * volley.spacingSec - centre) / WARP);
}
{
  const view = viewOf([W]);
  const one = centredVolley(view, W, 0, 0, 2, WARP, 1, FULL_BAY);
  check('centredVolley: one pod leaves at the centre', one?.n === 1 && near(one.firstAtTSec, 1000), JSON.stringify(one));
  const four = centredVolley(view, W, 0, 0, 2, WARP, 4, FULL_BAY);
  check('…four straddle it: −3, −1, +1, +3 tac s (first = centre − (n − 1) × cadence × 0.5)', slotsOf(four).join() === '-3,-1,1,3'
    && near(four!.spacingSec, 2 * WARP), slotsOf(four).join());
  const untrained = centredVolley(view, W, 0, 1.5, 2, WARP, 4, FULL_BAY);
  check('R5: untrained (1.5 tac s late) only 3 of 4 fit the 8 s sure window, all late of the centre',
    untrained?.n === 3 && slotsOf(untrained).join() === '-0.5,1.5,3.5', slotsOf(untrained).join());
  const degraded = centredVolley(view, W, 0, 0, 2.7, WARP, 4, FULL_BAY);
  check('R6: a degraded Bay Ctrl (2.7 s) still straddles the centre: 3 pods at −2.7, 0, +2.7', degraded?.n === 3
    && slotsOf(degraded).map((x) => x.toFixed(1)).join() === '-2.7,0.0,2.7', slotsOf(degraded).join());
  const late = centredVolley(view, W, 1001, 0, 2, WARP, 4, FULL_BAY);
  check('a hold that starts after the centre goes at once, shrunk to what is left of the sure part (2 pods)',
    late?.n === 2 && near(late.firstAtTSec, 1001), JSON.stringify(late));
  const short = centredVolley(view, W, 900, 0, 2, WARP, 4, { loaded: 2, reloadTac: 0, cadenceLeftTac: 0 });
  check('a bay of 2 two tac s before the window sends 2, centred (−1, +1)', slotsOf(short).join() === '-1,1', slotsOf(short).join());
  const empty = centredVolley(view, W, 0, 0, 2, WARP, 4, { loaded: 0, reloadTac: 0, cadenceLeftTac: 0 });
  check('an empty bay waits for its reloads (two by the window: 20 tac s each)', empty?.n === 2, JSON.stringify(empty));
  const cadence = centredVolley(view, W, 0, 0, 2, WARP, 1, { loaded: 4, reloadTac: 0, cadenceLeftTac: 60 });
  check('the bay\'s cadence left (a manual launch just went) holds the first slot back', cadence !== null && cadence.firstAtTSec >= 1200 - 80 - 2
    || cadence === null, JSON.stringify(cadence));
  check('no sure part: no volley', centredVolley(view, { ...W, sureOpenInSec: null, sureCloseInSec: null }, 0, 0, 2, WARP, 4, FULL_BAY) === null);
  check('volleySlots never puts the last slot on the sure part\'s edge (the margin)', volleySlots({ lo: 0, hi: 100 }, 50, 0, 0, 40, 4, 2)?.n === 3);
}

// --- bayBy and the pass rows: the double window (01 §3.4) -----------------------------------------------------------------
{
  const launches = [940, 980, 1020, 1060];
  check('bayBy: four launches empty a full bay, and none is back 10 tac s on', bayBy(FULL_BAY, 2, launches, 0, 1260, WARP) === 0);
  check('…one is reloaded 20 tac s after the first launch (world time)', bayBy(FULL_BAY, 2, launches, 0, 1340, WARP) === 1
    && bayBy(FULL_BAY, 2, launches, 0, 1339, WARP) === 0);
  check('…a full bay holds 4 and no more', bayBy(FULL_BAY, 2, [], 0, 1e6, WARP) === 4);
  const B = lzWindow('LZ-B', 1400);
  const state = {
    clock: { tSec: 0 }, level: { tacticalWarp: WARP },
    landing: { lzs: [{ label: 'LZ-A' }, { label: 'LZ-B' }] },
    run: { stats: { dropDemos: [{ offsetTac: 0 }] } },
  } as unknown as GameState;
  const rows = passRows(state, viewOf([W, B]), { 'LZ-A': 4, 'LZ-B': 3 });
  const b = rows.find((row) => row.lz === 'LZ-B');
  check('passRows: A ×4 then B ×3 20 tac s later: B\'s window fits 4, but the bay has 1 by then', rows.length === 2 && rows[0]!.bayHas === null
    && b?.want === 3 && b.fits === 4 && b.bayHas === 1, JSON.stringify(rows));
  check('…said `B ×3 — BAY HAS 1 BY THEN`', AUTODROP_TEXT.bay.shortBay('LZ-B', 3, 1) === 'B ×3 — BAY HAS 1 BY THEN');
  const clamped = passRows(state, viewOf([W, B]), { 'LZ-A': 9, 'LZ-B': -2 });
  check('…a count is clamped to the LZ\'s room and never below 0', clamped[0]!.want === 4 && clamped[1]!.want === 0, JSON.stringify(clamped));
}

// --- centreOffsetTac and dropDemoOffset -----------------------------------------------------------------------------------
{
  const sol = solutionOf([W]);
  const launch = (atTSec: number, aimLz: string | null): LaunchRecord => ({
    atTSec, atAi: 0, source: 'player', launchRadius: 6000, dotRad: 0, halfWidthKm: 50, aimLz, landingRad: 0, predictedTouch: 'soft',
    driverIntegrity: 100, arc: [], descentSec: 3.5, firstOfRun: false,
  });
  check('centreOffsetTac: (launch − the window\'s centre) ÷ the tactical warp', near(centreOffsetTac(sol, launch(1030, 'LZ-A'), WARP)!, 1.5)
    && near(centreOffsetTac(sol, launch(960, 'LZ-A'), WARP)!, -2));
  // Review M3: a demo is measured against the slot the strip cued (`LAUNCH NOW` at the sure part's opening, 920; each later
  // launch a cadence after the one before it), so the obedient kid teaches no offset.
  const CADENCE = 2 * WARP;
  check('dropDemoOffset (M3): the first launch against the window\'s launch moment (sure open 920: 930 → +0.5)',
    near(dropDemoOffset(sol, launch(930, 'LZ-A'), WARP, CADENCE, [])!, 0.5));
  check('…a later launch against its cadence slot (930 + 40 = 970: 960 → −0.5; 975 → +0.25)',
    near(dropDemoOffset(sol, launch(960, 'LZ-A'), WARP, CADENCE, [930])!, -0.5)
    && near(dropDemoOffset(sol, launch(975, 'LZ-A'), WARP, CADENCE, [930, 500])!, 0.25));
  check('…the obedient kid at each cue (920, 960, 1000, 1040) scores 0', [920, 960, 1000, 1040].every((at, i, all) =>
    near(dropDemoOffset(sol, launch(at, 'LZ-A'), WARP, CADENCE, all.slice(0, i))!, 0)));
  check('…off-site is no demo', dropDemoOffset(sol, launch(1030, null), WARP, CADENCE, []) === null);
}

// --- planLanding on run 1's arm ---------------------------------------------------------------------------------------------
const h = createHarness7(1);
const st = (): Readonly<GameState> => h.store.getState();
const viewNow = (): LandingView => landingView(st(), getDropSolution()!, capabilitiesNow(st()).bay.cadenceTac);
const checkLine = (): string => {
  const plan = planLanding(st(), viewNow());
  const perLz: Record<string, number> = {};
  for (const lz of st().landing.lzs) perLz[lz.label] = plan.perLz[lz.label] ?? 0;
  return AUTODROP_TEXT.bay.planCheck(plan.passes, perLz, plan.neverFits.map((never) => never.lz));
};
{
  armLanding(h, [ARM.ARES, ARM.HALCYON, ARM.KESTREL, ARM.VESPER, ARM.CORMORANT], { autodrop: 3, demos: [0], healInstruments: true });
  h.step();
  const plan = planLanding(st(), viewNow());
  const pods = plan.rows.reduce((sum, row) => sum + row.n, 0);
  check('CORMORANT (9 pods, LZ-A 6 · LZ-B 3): the plan lands all 9 in 2 passes, complete, no leftovers', plan.complete && plan.passes === 2
    && pods === 9 && plan.rows.every((row) => row.mislanded === 0), JSON.stringify(plan.rows.map((row) => `${row.pass}:${row.lz}×${row.n}`)));
  check('…its rows are in time order, at most 4 a volley, each pod once', plan.rows.every((row, i) => i === 0 || row.atTSec > plan.rows[i - 1]!.atTSec)
    && plan.rows.every((row) => row.n <= 4 && row.pods.length === row.n)
    && new Set(plan.rows.flatMap((row) => row.pods)).size === 9);
  check('…the check line: `PLAN · 2 PASSES · A 6 · B 3 ✓`', checkLine() === 'PLAN · 2 PASSES · A 6 · B 3 ✓', checkLine());
  const sol = getDropSolution()!;
  const firstAt = plan.rows[1]!.atTSec;
  const forecastView = { ...viewNow(), solution: { ...sol, validUntilTSec: firstAt - 1 } };
  forgetPlanMemo();
  const forecast = planLanding(st(), forecastView);
  check('rows after validUntilTSec (the next drag kick) are a forecast, the ones before are not', forecast.rows[0]!.forecast === false
    && forecast.rows.slice(1).every((row) => row.forecast), forecast.rows.map((row) => row.forecast).join());
}
{
  armLanding(h, [ARM.ARES, ARM.HALCYON, ARM.KESTREL, ARM.VESPER], { autodrop: 3, demos: [0], healInstruments: true });
  h.step();
  forgetPlanMemo();
  const t0 = performance.now();
  const plan = planLanding(st(), viewNow());
  const cold = performance.now() - t0;
  const reps = 200;
  const t1 = performance.now();
  for (let i = 0; i < reps; i++) planLanding(st(), viewNow());
  const warm = (performance.now() - t1) / reps;
  check('VESPER\'s 16-pod ark (A 6 · B 5 · C 5, LZ-C NARROW): every pod planned, complete, in 3 passes', plan.complete && plan.passes === 3
    && plan.rows.reduce((sum, row) => sum + row.n, 0) === 16 && plan.perLz['LZ-A'] === 6 && plan.perLz['LZ-B'] === 5 && plan.perLz['LZ-C'] === 5,
    `${plan.rows.map((row) => `${row.pass}:${row.lz}×${row.n}`).join(' ')} · ${checkLine()}`);
  check(`R18: the plan's memo answers in under 1 ms on the ark (${warm.toFixed(3)} ms; cold ${cold.toFixed(2)} ms)`, warm < 1);
  console.log(`INFO  planLanding on the 16-pod ark: cold ${cold.toFixed(2)} ms, memoised ${warm.toFixed(4)} ms`);
  // The healthiest drivers to the narrowest bracket: three drivers degraded (×1.5 wider dots).
  h.store.update((draft) => {
    for (const seg of draft.memory) if (seg.type === 'driver' && [1, 2, 3].includes(seg.pod)) seg.integrity = 60;
    draft.ui.memoryRev++;
  });
  h.step();
  const hurt = planLanding(st(), viewNow());
  const narrow = hurt.rows.filter((row) => row.lz === 'LZ-C').flatMap((row) => row.pods);
  check('the healthiest drivers go to the narrowest LZ: the three degraded ones never to LZ-C', narrow.length > 0
    && narrow.every((pod) => ![1, 2, 3].includes(pod)) && hurt.rows.some((row) => row.pods.some((pod) => [1, 2, 3].includes(pod))),
    hurt.rows.map((row) => `${row.lz}:${row.pods.join('/')}`).join(' '));
  // Sensor Interp failing (×2.5): LZ-C's 250 km bracket never fits any pod on this orbit.
  h.store.update((draft) => {
    for (const seg of draft.memory) if (seg.role === 'sensor' && 'integrity' in seg) seg.integrity = 40;
    draft.ui.memoryRev++;
  });
  h.step();
  const blind = planLanding(st(), viewNow());
  const never = blind.neverFits.find((entry) => entry.lz === 'LZ-C');
  check('a failing Sensor Interp: LZ-C NEVER FITS, and the plan names its REPAIR (Sensor Interp)', never !== undefined
    && never.repair?.file === 'sensor' && !blind.complete, JSON.stringify(blind.neverFits));
  const firstLeftover = blind.rows.findIndex((row) => row.mislanded > 0);
  check('…its pods go to the other LZs at the wrong-split rate, in the last rows only, never off-site', firstLeftover > 0
    && blind.rows.slice(firstLeftover).every((row) => row.mislanded === row.n) && blind.rows.every((row) => row.lz !== 'LZ-C'),
    blind.rows.map((row) => `${row.pass}:${row.lz}×${row.n}${row.mislanded > 0 ? '¾' : ''}`).join(' '));
  check(`…the table holds at most ${AUTODROP_PLAN_MAX_PASSES} passes`, blind.passes <= AUTODROP_PLAN_MAX_PASSES);
  check('…the never-fits line: `LZ-C NEVER FITS — REPAIR SENSOR INTERP, or fly lower`',
    AUTODROP_TEXT.bay.neverFits('LZ-C', 'SENSOR INTERP', 'kid') === 'LZ-C NEVER FITS — REPAIR SENSOR INTERP, or fly lower');
  check('…in v3\'s own misses it names the REPAIR alone (review m3), or that v3 can\'t fit it',
    AUTODROP_TEXT.bay.neverFits('LZ-C', 'SENSOR INTERP', 'none') === 'LZ-C NEVER FITS — REPAIR SENSOR INTERP'
      && AUTODROP_TEXT.bay.neverFits('LZ-C', null, 'none') === 'LZ-C NEVER FITS — AUTOBURN v3 CAN\'T FIT IT');
}

// --- The words at their worst (≤ MAX_LINE_CHARS) ----------------------------------------------------------------------------
{
  const four = { 'LZ-A': 4, 'LZ-B': 4, 'LZ-C': 4, 'LZ-D': 4 };
  const t = AUTODROP_TEXT;
  const lines: string[] = [
    t.tutorial.v1, t.tutorial.v2, t.tutorial.v3,
    t.strip.hold('LZ-D'), t.strip.held('LZ-D', 4, '59:59'), t.strip.held('LZ-D', 4, null), t.strip.fly('LZ-D', 4, '59:59'),
    t.strip.fly('LZ-D', 4, null), t.strip.wait('59:59'), t.strip.wait(null), t.strip.passDone(four), t.strip.planDone(four),
    t.strip.armedNext('LZ-D', 4, '59:59'), t.strip.armedIdle,
    `WAIT — LZ-D in 59:59 ▸▸ · hold [F]${t.strip.tailPlan}`,
    t.radio.armedPass(four), t.radio.armedPlan(AUTODROP_PLAN_MAX_PASSES), t.radio.cancel, t.radio.passDone(four), t.radio.planDone(four),
    t.radio.v3to2, t.radio.v2to1, t.radio.damaged, t.radio.offline,
    ...(Object.keys(t.refusal) as (keyof typeof t.refusal)[]).map((word) => t.radio.refused(word)),
    LANDING_ECHO.touchdown(16, 'lz', 'LZ-D', 'soft', true),
    t.bay.pipWorksAs(3, 2), t.bay.pipOk(3), t.bay.pipDamaged(3, 2, 80), t.bay.pipOffline(3), t.bay.pipMissing,
    t.bay.keyHold, t.bay.launchHeld, t.bay.keyPass, t.bay.keyPlan, t.bay.keyArmedPass, t.bay.keyArmedPlan, t.bay.keyOff, t.bay.keyWaiting,
    t.bay.shortBay('LZ-D', 4, 0), t.bay.shortFit('LZ-D', 4, 3), t.bay.noWindow('LZ-D'),
    t.bay.planRow(AUTODROP_PLAN_MAX_PASSES, 'LZ-D', 4, 'IN 59:59', 4), t.bay.planMore(40),
    t.bay.planCheck(AUTODROP_PLAN_MAX_PASSES, { 'LZ-A': 16, 'LZ-B': 16, 'LZ-C': 16, 'LZ-D': 16 }, ['LZ-A', 'LZ-B', 'LZ-C', 'LZ-D']),
    t.bay.planLater(9, AUTODROP_PLAN_MAX_PASSES), t.bay.neverFits('LZ-D', 'SENSOR INTERP', 'v3'), t.bay.neverFits('LZ-D', null, 'v3'),
    t.bay.neverFits('LZ-D', 'SENSOR INTERP', 'none'), t.bay.neverFits('LZ-D', null, 'none'), t.bay.planIn('59:59'),
    t.status.trained('CENTRE', 99, 999), t.status.untrained('CENTRE', 40), t.status.armed('LZ-D', 4, '59:59'), t.status.armedIdle,
    t.status.holding, t.status.waiting, t.status.worksAs(2, 3),
  ];
  const over = lines.filter((line) => line.length > MAX_LINE_CHARS);
  check(`every AUTODROP string at its worst case is ≤ ${MAX_LINE_CHARS} characters (${lines.length} lines)`, over.length === 0,
    over.map((line) => `${line.length}: ${line}`).join(' | '));
  check('the spec\'s words: `PASS DONE · A +2 · B +1`, `+200 LANDED`\'s echo BULLSEYE, the check line ✓',
    t.radio.passDone({ 'LZ-A': 2, 'LZ-B': 1 }) === 'PASS DONE · A +2 · B +1'
      && LANDING_ECHO.touchdown(3, 'lz', 'LZ-A', 'soft', true) === '> pod03 ... LANDED · BULLSEYE'
      && LANDING_ECHO.touchdown(3, 'lz', 'LZ-A', 'hard', true) === '> pod03 ... LANDED · HARD'
      && t.bay.planCheck(2, { 'LZ-A': 5, 'LZ-B': 4 }, []) === 'PLAN · 2 PASSES · A 5 · B 4 ✓'
      && t.bay.planCheck(2, { 'LZ-A': 5, 'LZ-C': 0 }, ['LZ-C']) === 'PLAN · 2 PASSES · A 5 · C 0 ✗ LZ-C');
  check('the check line counts pods (review m10): `PLAN · 3 PASSES · A 6 · B 5 · C 5 ✓`, 35 characters',
    t.bay.planCheck(3, { 'LZ-A': 6, 'LZ-B': 5, 'LZ-C': 5 }, []) === 'PLAN · 3 PASSES · A 6 · B 5 · C 5 ✓');
}

finish();
