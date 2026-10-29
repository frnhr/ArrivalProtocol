// @ts-nocheck: TODO(slice1a-TESTS): this suite still reads phase 2's souls / printer (cluster codes, print results) and is
// moved onto the landing per slice-1a-plan §5. F2 turned type-checking off here so tsc over tests stays green meanwhile.
// WP9 review fixes, round 2: the lead's ruling for round 1 made whole, and the round-2 minors. Headless, on the real
// systems (harness9: every DOM-free system, KESTREL on its own).
// • Ruling 1: the dodge's deadline is a pace event. A SKIP runs up to SKIP_END_LEAD_TAC before it, then F says
//   DODGE THE DEBRIS FIRST; the last DODGE_TACTICAL_LEAD_TAC run at TACTICAL (real seconds), then CRUISE again.
// • Ruling 2: the countdown's last DODGE_WARN_TAC carry the warning flag (the strip's warning colour); the lapse is one
//   `dodge-lapsed` moment (the TOO LATE TO DODGE stamp and its thud, in the page).
// • Ruling 3: a timed HOLLOW wake waits while the dodge is open and WAKE_AFTER_DODGE_SEC after it closes, at any pace:
//   the never-corrector in amber, the same kid in blue (OVERCLOCK stretches the window's end), the hesitant tapper,
//   the early dodger; NEXT BITE shows no time while it is held.
// • Ruling 4: the first seed's clock stands still while the flight is at TACTICAL (an alarm here); later seeds keep
//   their rhythm; for a late corrector and a never-corrector the first telegraph comes under no NOW line.
// • Minor: letting go during `KEEP HOLDING — dodge DEBRIS C` offers `NOT CLEAR YET — hold [SPACE] · m:ss to dodge`;
//   holding again dodges; waiting it out lapses (once) and the rack is hit.
// • Minor: two REPAIRs started in the window do not move the deadline (it is judged at the engine's own power).
// • Minor: the dodge search has no 2-letter names and no precision literals in rule code; every new line fits.
import { readFileSync } from 'node:fs';
import { check, finish } from '../../wp1/harness';
import { createHarness9 } from '../harness9';
import { followDirector } from '../../wp2/harness2';
import { getPrediction } from '@systems/predict';
import { requestSkip, SKIP_REFUSAL_DODGE } from '@systems/pace';
import { setMode } from '@systems/mode';
import { raiseAlert, clearAlert } from '@systems/alerts';
import { installTool } from '@systems/licences';
import { biteClock } from '@systems/hollow-hud';
import { actionRepair, setIntegrity } from '@state/actions';
import { getOps } from '@systems/ops-core';
import { getByRole, hasIntegrity } from '@state/selectors';
import { segmentStarts, mergeAdjacentFree, freeSegment } from '@systems/memory-ops';
import { objectiveStructure } from '@systems/director';
import { ZONE_STAMP_TEXT } from '@data/zone-text';
import { getShip } from '@data/ships';
import {
  SKIP_END_LEAD_TAC, DODGE_TACTICAL_LEAD_TAC, DODGE_WARN_TAC, WAKE_AFTER_DODGE_SEC, MAX_LINE_CHARS, TICK_MS,
} from '@data/tuning';
import { KESTREL } from '../harness9';

const h = createHarness9(5);
const state = () => h.store.getState();
const warp = () => state().level.tacticalWarp;
const tacNow = (): number => state().clock.tSec / warp();
const TICK = TICK_MS / 1000;
const debrisHit = () => getPrediction().zoneHits.find((hit) => hit.kind === 'debris') ?? null;
const dodgeOpen = (): boolean => debrisHit()?.correctionClears === true;
// The absolute deadline (tactical s since the flight began), or null while none is ahead.
const deadlineTac = (): number | null => {
  const hit = debrisHit();
  if (!hit || hit.correctionClears !== true || hit.dodgeInSec === null) return null;
  return (getPrediction().asOfTSec + hit.dodgeInSec) / warp();
};
const lapses = (): number => h.events.filter((event) => event.name === 'dodge-lapsed').length;
const ensureTool = (kind: 'repair' | 'move'): void => {
  if (!state().run.licences.includes(kind)) installTool(h.store, kind);
};
const correctIn = (): void => {
  h.keyDown('Space');
  h.stepUntil(() => /^RELEASE/.test(h.objective()?.text ?? ''), 60);
  h.keyUp('Space');
  h.step();
};
// C09 and C10 moved behind WALLs (the kid's MOVEs), so the wake's bites fizzle and no alarm holds the flight.
const wallOffRoot = (): void => {
  h.store.update((d) => {
    const starts = segmentStarts(d.memory);
    d.memory = d.memory.map((seg, i) => (seg.type === 'driver' && (seg.cluster === 'C09' || seg.cluster === 'C10') && starts[i]! < 192 ? freeSegment(seg.size) : seg));
    mergeAdjacentFree(d.memory);
    d.ui.memoryRev++;
  });
};

// --- Ruling 1 and 2: the deadline as a pace event; the warning colour; the lapse ------------------------------------
{
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  h.step();
  const deadline = deadlineTac()!;
  const skip = requestSkip(h.store);
  h.stepUntil(() => state().clock.skipWarp === null, 60);
  const lead = deadline - tacNow();
  check('a SKIP with the dodge open runs to SKIP_END_LEAD_TAC before its deadline (and no further)', skip.ok && Math.abs(lead - SKIP_END_LEAD_TAC) < 1,
    `${JSON.stringify(skip)}, stopped ${lead.toFixed(2)} tac s before`);
  const near = requestSkip(h.store);
  check('…there F says DODGE THE DEBRIS FIRST, and the world is still at CRUISE', !near.ok && near.reason === SKIP_REFUSAL_DODGE
    && state().clock.pace === 'cruise', `${JSON.stringify(near)} ${state().clock.pace}`);
  const beforeWarn = state().director.shown;
  check(`…the countdown is not in the warning colour yet (more than ${DODGE_WARN_TAC} s left)`, beforeWarn?.id.startsWith('F8-debris') === true
    && beforeWarn.warn !== true, `${beforeWarn?.id} ${beforeWarn?.text} warn=${beforeWarn?.warn}`);
  h.stepUntil(() => deadline - tacNow() <= DODGE_TACTICAL_LEAD_TAC - 1, 20);
  const shown = state().director.shown;
  check(`the last ${DODGE_TACTICAL_LEAD_TAC} tac s run at TACTICAL (the tactical warp, real seconds)`, state().clock.pace === 'tactical'
    && state().clock.speedTarget === warp(), `${state().clock.pace} ×${state().clock.speedTarget}`);
  check('…the strip\'s countdown carries the warning flag (`· 0:0n to dodge DEBRIS C`), and it is a structural change',
    shown?.warn === true && /· 0:0\d to dodge DEBRIS C$/.test(shown.text) && objectiveStructure(shown) !== objectiveStructure(beforeWarn),
    `${shown?.text} warn=${shown?.warn}`);
  const stretchStartWall = h.wall();
  h.stepUntil(() => lapses() > 0, 30);
  const stretchWall = h.wall() - stretchStartWall;
  check('…which take about as many wall seconds (at CRUISE ×80 they took 3)', Math.abs(stretchWall - (DODGE_TACTICAL_LEAD_TAC - 1)) < 1,
    `${stretchWall.toFixed(2)} wall s for ${DODGE_TACTICAL_LEAD_TAC - 1} tac s`);
  h.stepFor(1);
  check('the lapse is one dodge-lapsed moment (the TOO LATE TO DODGE stamp in the page); then CRUISE again, no warning flag',
    lapses() === 1 && state().clock.pace === 'cruise' && state().director.shown?.warn !== true
    && state().director.shown?.text === 'TOO WIDE — hold [SPACE] · too late to dodge DEBRIS C',
    `${lapses()} ${state().clock.pace} ${state().director.shown?.text}`);
  check('the stamp\'s words', ZONE_STAMP_TEXT.tooLate === 'TOO LATE TO DODGE');
}

// --- Ruling 3: HOLLOW never wakes inside the window, at any pace -----------------------------------------------------
// A kid who never corrects (`mode`: the screen they sit on), or taps the IN burn (0.3 AI s on, 8 off): when the dodge
// last stood open, when the hold ended, when HOLLOW woke, whether the bite clock showed a time during the hold.
interface WakeRun { lastOpenAi: number; holdEndedAi: number | null; wakeAi: number | null; openAtWake: boolean; clockWhileHeld: boolean; overclocked: boolean }
function wakeRun(kid: 'still-amber' | 'still-blue' | 'tapper'): WakeRun {
  h.kestrel(5, { sensorHealed: true });
  ensureTool('repair');
  if (kid === 'still-blue') setMode(h.store, 'memory');
  const run: WakeRun = { lastOpenAi: 0, holdEndedAi: null, wakeAi: null, openAtWake: false, clockWhileHeld: false, overclocked: false };
  let phaseSec = 0;
  let holding = false;
  while (state().clock.aiSec < 160 && run.wakeAi === null) {
    h.step();
    const ai = state().clock.aiSec;
    const open = dodgeOpen();
    if (open) run.lastOpenAi = ai;
    if (state().clock.overclock) run.overclocked = true;
    if (state().hollow.wakeHeld && biteClock(state()).secLeft !== null) run.clockWhileHeld = true;
    if (state().hollow.phase === 'awake') { run.wakeAi = ai; run.openAtWake = open; }
    if (kid !== 'tapper') continue;
    const correcting = /^F[678]/.test(h.objective()?.id ?? '');
    if (ai < 10 || !correcting) { if (holding) { h.keyUp('Space'); holding = false; } continue; }
    phaseSec += TICK;
    if (holding && phaseSec >= 0.3) { h.keyUp('Space'); holding = false; phaseSec = 0; } else if (!holding && phaseSec >= 8) { h.keyDown('Space'); holding = true; phaseSec = 0; }
  }
  if (holding) h.keyUp('Space');
  run.holdEndedAi = state().hollow.wakeHoldEndedAtAi;
  return run;
}
for (const kid of ['still-amber', 'still-blue', 'tapper'] as const) {
  const run = wakeRun(kid);
  const after = run.wakeAi !== null && run.holdEndedAi !== null && run.wakeAi >= run.holdEndedAi + WAKE_AFTER_DODGE_SEC - TICK
    && run.wakeAi > run.lastOpenAi && !run.openAtWake;
  check(`${kid}: HOLLOW wakes only after the dodge closed, WAKE_AFTER_DODGE_SEC later; NEXT BITE showed no time while held`
    + (kid === 'still-blue' ? ' (OVERCLOCK stretched the window\'s end)' : ''), after && !run.clockWhileHeld && (kid !== 'still-blue' || run.overclocked),
  `last open ${run.lastOpenAi.toFixed(1)}, hold ended ${run.holdEndedAi?.toFixed(1)}, woke ${run.wakeAi?.toFixed(1)} (open then: ${run.openAtWake}), clock while held ${run.clockWhileHeld}`);
}
{
  // The early dodger: the hold ends when the correction takes the path off the cloud; the coast's wake (coast + 5 s)
  // or the quiet after the dodge, whichever is later.
  h.kestrel(5, { sensorHealed: true });
  ensureTool('repair');
  correctIn();
  const ended = state().hollow.wakeHoldEndedAtAi;
  h.press('KeyS');
  h.stepUntil(() => state().hollow.phase === 'awake', 60);
  const coastAt = state().burn.coastAtAi;
  const lead = getShip(KESTREL).hollow.wake;
  const coastLead = typeof lead === 'string' ? 0 : lead.coastLeadSec ?? 0;
  const expected = Math.max((coastAt ?? Infinity) + coastLead, (ended ?? -Infinity) + WAKE_AFTER_DODGE_SEC);
  check('the early dodger: HOLLOW wakes at the later of coast + 5 s and the dodge\'s close + WAKE_AFTER_DODGE_SEC',
    ended !== null && coastAt !== null && Math.abs(state().clock.aiSec - expected) < 2 * TICK,
    `hold ended ${ended?.toFixed(1)}, coast ${coastAt?.toFixed(1)}, woke ${state().clock.aiSec.toFixed(1)}`);
}

// --- Ruling 4: the first seed waits for a calm flight ---------------------------------------------------------------
{
  h.kestrel(5, { sensorHealed: true });
  ensureTool('repair');
  ensureTool('move');
  correctIn();
  wallOffRoot();
  h.store.update((d) => { d.hollow.cfg = { ...d.hollow.cfg, wake: { afterAiSec: 0, coastLeadSec: null } }; });
  h.stepUntil(() => state().hollow.phase === 'awake', WAKE_AFTER_DODGE_SEC + 3);
  h.press('KeyS');
  h.stepFor(2);
  const before = state().hollow.seedInSec!;
  raiseAlert(h.store, { id: 'fix2-test-alarm', layer: 'ship', severity: 'alarm', text: 'TEST ALARM', inhibitsSkip: true });
  h.stepFor(5);
  const held = state().hollow.seedInSec!;
  check('the first seed\'s clock stands still while the flight is at TACTICAL (an alarm)', state().clock.pace === 'tactical'
    && Math.abs(held - before) < 1e-9, `${before.toFixed(2)} → ${held.toFixed(2)} (${state().clock.pace})`);
  clearAlert(h.store, 'fix2-test-alarm');
  h.stepFor(5);
  const resumed = state().hollow.seedInSec!;
  check('…and runs on once the flight is calm again', state().clock.pace !== 'tactical' && Math.abs(held - resumed - 5) < 0.2,
    `${held.toFixed(2)} → ${resumed.toFixed(2)}`);
  h.stepUntil(() => state().hollow.seedMoments === 1, 40);
  h.stepFor(1);
  const second = state().hollow.seedInSec!;
  raiseAlert(h.store, { id: 'fix2-test-alarm', layer: 'ship', severity: 'alarm', text: 'TEST ALARM', inhibitsSkip: true });
  h.stepFor(3);
  clearAlert(h.store, 'fix2-test-alarm');
  check('later seeds keep their rhythm through TACTICAL (they are the pressure, the first is the lesson)',
    Math.abs(second - state().hollow.seedInSec! - 3) < 0.2, `${second.toFixed(2)} → ${state().hollow.seedInSec!.toFixed(2)}`);
}
{
  // ?debug's seedNow sets the clock to zero: the hold freezes the count, not the moment, so it still fires at once.
  h.kestrel(5, { sensorHealed: true });
  ensureTool('repair');
  ensureTool('move');
  correctIn();
  wallOffRoot();
  h.store.update((d) => { d.hollow.cfg = { ...d.hollow.cfg, wake: { afterAiSec: 0, coastLeadSec: null } }; });
  h.stepUntil(() => state().hollow.phase === 'awake', WAKE_AFTER_DODGE_SEC + 3);
  raiseAlert(h.store, { id: 'fix2-test-alarm', layer: 'ship', severity: 'alarm', text: 'TEST ALARM', inhibitsSkip: true });
  h.step();
  h.store.mutate((d) => { d.hollow.seedInSec = 0; });
  h.step();
  check('a first-seed clock already at zero (?debug seedNow) telegraphs at once, even at TACTICAL', state().clock.pace === 'tactical'
    && state().hollow.seedTelegraph !== null, `${state().clock.pace} ${JSON.stringify(state().hollow.seedTelegraph)}`);
  clearAlert(h.store, 'fix2-test-alarm');
}
for (const kid of [{ name: 'late corrector (46 AI s)', delayAi: 46 }, { name: 'never-corrector', delayAi: Infinity }]) {
  h.kestrel(5, { arrivalDamage: true });
  ensureTool('repair');
  ensureTool('move');
  let telegraphUrgency: string | null = null;
  let telegraphLine = '';
  let seen = 0;
  followDirector(h, {
    reactionSec: 0.4, maxWall: 900,
    mistake: (_harness, ctl) => {
      h.defend9();
      for (; seen < h.events.length; seen++) {
        if (h.events[seen]!.name === 'seed-telegraph' && telegraphUrgency === null) {
          telegraphUrgency = h.objective()?.urgency ?? '?';
          telegraphLine = h.objective()?.text ?? '';
        }
      }
      if (state().clock.aiSec < kid.delayAi && /^F[678]/.test(h.objective()?.id ?? '')) { ctl.setHolding(false); return true; }
      return false;
    },
  });
  check(`${kid.name}: the first seed's telegraph (DELETE's licence) comes under no NOW line`, telegraphUrgency !== null && telegraphUrgency !== 'now',
    `${telegraphUrgency} "${telegraphLine}"`);
}

// --- Minor: letting go during KEEP HOLDING — dodge DEBRIS C ---------------------------------------------------------
function releaseInDodge(): void {
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  ensureTool('move');
  h.stepUntil(() => state().clock.aiSec >= 40, 60);
  h.keyDown('Space');
  h.stepUntil(() => h.objective()?.id === 'F6-dodge', 60);
  h.keyUp('Space');
  h.stepFor(0.5);
}
{
  releaseInDodge();
  const resume = state().director.shown;
  check('let go in the sweet zone before the path clears: `NOT CLEAR YET — hold [SPACE] · m:ss to dodge DEBRIS C` (urgent)',
    h.objective()?.id === 'F6-resume' && /^NOT CLEAR YET — hold \[SPACE\] · \d:\d\d to dodge DEBRIS C$/.test(resume?.text ?? '')
    && resume?.urgency === 'now' && lapses() === 0, `${h.objective()?.id} "${resume?.text}" ${resume?.urgency}`);
  h.keyDown('Space');
  h.step();
  check('…holding again: KEEP HOLDING — dodge DEBRIS C', h.objective()?.text === 'KEEP HOLDING — dodge DEBRIS C', h.objective()?.text);
  h.keyUp('Space');
  h.step();
  h.flyDefending9(900);
  check('…the strip-follower finishes the dodge from there: 0 debris hits, locked', h.zoneHits().length === 0 && h.status() === 'locked',
    `${h.zoneHits().length} hits, ${h.status()}`);

  releaseInDodge();
  h.stepUntil(() => !dodgeOpen(), 120);
  h.stepFor(1);
  check('…waited out: one lapse (the TOO LATE TO DODGE stamp), and the strip moves on (no NOT CLEAR YET)', lapses() === 1
    && h.objective()?.id !== 'F6-resume', `${lapses()} ${h.objective()?.id}`);
  h.flyDefending9(900);
  check('…and the rack is hit', h.zoneHits().length === 1, `${h.zoneHits().length} hits`);
}

// --- Minor: busy threads do not move the deadline -------------------------------------------------------------------
{
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  ensureTool('repair');
  h.store.update((d) => {
    for (const role of ['telemetry', 'comms'] as const) {
      const seg = d.memory.find((candidate) => candidate.role === role);
      if (seg && hasIntegrity(seg)) setIntegrity(seg, 20);
    }
  });
  const deadlines = new Set<string>();
  let started = 0;
  let busySeen = false;
  while (dodgeOpen() && state().clock.aiSec < 120) {
    h.step();
    if (started === 0 && state().clock.aiSec >= 20) {
      for (const role of ['telemetry', 'comms'] as const) if (actionRepair(h.store, getByRole(state(), role)!) === null) started++;
    }
    if (getOps().length >= 2) busySeen = true;
    const deadline = deadlineTac();
    if (deadline !== null) deadlines.add(deadline.toFixed(2));
  }
  check('two REPAIRs (THRUST LIMIT 50%) started and ended in the window: one deadline throughout', started === 2 && busySeen && deadlines.size === 1,
    `${started} repairs, busy ${busySeen}, deadlines ${[...deadlines].join(', ')}`);
}

// --- Quality: the dodge search's names and literals; the new lines --------------------------------------------------
{
  const source = readFileSync(new URL('../../../../src/systems/predict.ts', import.meta.url), 'utf8');
  const search = source.slice(source.indexOf('function dodgeKey'), source.indexOf('// What the drawn path does with each zone'));
  check('predict.ts: the dodge search names its bounds (no `lo` / `hi`) and its memo key has no precision literals',
    // (`sweet.lo` / `sweet.hi` are the sweet zone's own fields, predict.ts sweetZone, not the search's bounds.)
    search.length > 0 && !/(?<!\.)\b(lo|hi)\b/.test(search) && !/toFixed\(\d/.test(search));
  const resume = 'NOT CLEAR YET — hold [SPACE] · 99:59 to dodge DEBRIS C';
  check('every new line fits the strip (≤ 70) with a worst-case countdown', resume.length <= MAX_LINE_CHARS, `${resume.length}`);
}

finish();
