// Slice 4, Track FLIGHT (plan §6; 03 §3.6–§3.7, decision 15): AUTOBURN's versioned modes, headless, on KESTREL.
// • v2 GREEN from the flyby with ▼ left TOO WIDE: one press; the correction row outranks the ARMED row and carries
//   ` · AUTO ARMED`; it captures, re-arms, trims at ▲ into the ring and says GREEN ORBIT; it holds no thread while it
//   waits, and the plan has no shrink while it is engaged.
// • ROUND in the flight (plan §7 R1, measured): after the capture its burn at ▼ is a whole loop away, so only LOCK 810
//   reaches it in the 3 s of HOLD STEADY; pressed then, it carries on into LANDING and rounds the orbit.
// • ROUND in LANDING from a locked ellipse, to e < ROUND_E_TOL (measured: FUEL, burns, wall time).
// • The other-apsis rule (plan §7 R2): with ▼'s burn across an LZ's window it rounds at ▲ (burnSpanBlocks; measured).
// • The fuel reserve (plan §7 R4): a trim or a ROUND burn that would leave < 20% ends it SAVING FUEL; never the capture.
// • The claim (plan §7 R6): every thread busy at T−8: `AUTOBURN NEEDS A THREAD … × AN OP`, and it fires late (measured).
// • While armed an IN/OUT correction does not cancel it (the claim selects RETRO once); SPACE on RETRO does. An IN
//   correction flown inside the claim window (T−5) stands, and it fires RETRO at its moment (review M2).
// • v2's later burns claim a thread each (review M1): every burn GREEN starts holds one; with every thread busy a trim
//   waits, `NEEDS A THREAD`, and fires late once one frees.
// • The kid's REPAIR of an armed file ends it plainly (`'offline'`, no klaxon: review m2); the LOCK chime sounds once per
//   way into the bracket, not on each flip of the refusal inside it (review m3).
// • GREEN pressed in LANDING across an LZ window says which window it costs (review (a)).
// • UNTRAINED (plan §7 R3): no demos fire 7.5 tac s late (measured against a trained skill).
// • Graded damage (4b): v2 → v1 mid-capture finishes the capture, then hands back (`'downgraded'`).
import { check, finish } from '../wp1/harness';
import { createHarness9 } from '../wp9/harness9';
import { lockOn, ensureLandingKeys } from '../landing/harness-landing';
import { giveSkillFile } from '../support/skills';
import { setLandingMode } from '../support/landing-instant';
import { autoburnRefusal, autoModeFor, autoburnFireInTac, previewModeBurn, roundAim, greenCostsLz } from '@systems/autoburn';
import { getPrediction, secUntil, loopEccentricity, planModeBurn } from '@systems/predict';
import { skillLive } from '@systems/capabilities';
import { threadsBusy, threadsTotal, reserveThread, releaseThread } from '@systems/ops-core';
import { getDropSolution } from '@systems/drop-cache';
import { burnSpanBlocks } from '@systems/landing-rules';
import { landingFlightOf } from '@systems/guidance';
import { ringFit, elementsFromState } from '@/types/orbit';
import { AUTOBURN_TEXT, AUTOBURN_REFUSAL } from '@data/skill-text';
import { DRIVER_RULES } from '@data/script';
import { ROUND_E_TOL, AUTO_FUEL_RESERVE_PCT, AUTOBURN_UNTRAINED_OFFSET_TAC, AUTO_THREAD_CLAIM_TAC } from '@data/tuning';
import { on } from '@systems/events';
import type { GameState } from '@state/schema';
import type { LockLevel, SkillVersion } from '@/types/skill';

const KESTREL = 2;
const h = createHarness9(5);
// The landing is flown here (ROUND in LANDING), not skipped as other suites skip it.
setLandingMode('manual');
const state = (): GameState => h.store.getState();
const phase = () => state().burn.auto.phase;
const engaged = (): boolean => phase() === 'armed' || phase() === 'pointing' || phase() === 'burning';
const fitNow = () => ringFit(elementsFromState(state().orbit, state().level.planet.mu), state().level.ring);
const eNow = (): number => { const fit = fitNow(); return fit.closed ? loopEccentricity(fit) : Infinity; };
const tacTo = (inSec: number): number => secUntil(getPrediction(), inSec, state().clock.tSec) / state().level.tacticalWarp;
const said = (text: string): boolean => state().log.entries.some((entry) => entry.text === text);
const LANDING_DONE = [...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks'];

// KESTREL coasting toward its capture with AUTOBURN at `version` / `lock` and these demos; `corrected`: the IN correction
// held by hand until the strip says RELEASE (▼ in the ring), else ▼ stays TOO WIDE.
function kestrel(version: SkillVersion, offsets: number[], corrected: boolean, lock: LockLevel = 0): void {
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  h.store.update((d) => { d.run.stats.demos.push(...offsets.map((offsetTac) => ({ offsetTac }))); });
  giveSkillFile(h.store, 'autoburn', version, lock);
  if (corrected) {
    h.keyDown('Space');
    h.stepUntil(() => /^RELEASE/.test(h.objective()?.text ?? ''), 30);
    h.keyUp('Space');
  }
  h.step();
}

function untilOffered(maxWall = 200): boolean {
  return h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, maxWall) < maxWall;
}

// Steps while AUTOBURN is engaged, recording each burn it starts (with how late against its START BURN, in tac s), the
// most threads it held while armed and unclaimed, the strip's AUTOBURN lines (the flight table's and the director's) and
// whether the plan ever shrank. Armed with its burn far off it presses [F], as the strip offers (one SKIP per coast).
// `heldWhileWaiting` is sampled while armed with the burn still outside the claim window (review M1: sampled on `!claimed`,
// it measured nothing once the flag stuck after the first burn); `threads` is how many threads were busy as each burn began.
interface Flown {
  burns: { reason: string; fuelPct: number; lateTac: number; threads: number }[];
  heldWhileWaiting: number; lines: string[]; shrink: boolean; skips: number;
}
function flyEngaged(maxWall: number, each?: () => void): Flown {
  const flown: Flown = { burns: [], heldWhileWaiting: 0, lines: [], shrink: false, skips: 0 };
  const end = h.wall() + maxWall;
  while (h.wall() < end && engaged()) {
    const before = phase();
    const fireIn = autoburnFireInTac(state(), getPrediction());
    if (before === 'armed' && fireIn !== null && fireIn > AUTO_THREAD_CLAIM_TAC + 1) {
      flown.heldWhileWaiting = Math.max(flown.heldWhileWaiting, threadsBusy());
    }
    const bp = getPrediction().burnPoint;
    const lateTac = bp ? -tacTo(bp.inSec) : 0;
    if (before === 'armed' && state().clock.skipWarp === null && (h.shown()?.keys ?? []).includes('F') && lateTac < -30) {
      h.press('KeyF');
      flown.skips++;
    }
    h.step();
    each?.();
    if (getPrediction().burnPoint?.reason === 'shrink') flown.shrink = true;
    for (const text of [h.objective()?.text, h.shown()?.text]) {
      if (text && text.startsWith('AUTOBURN') && !/\d:\d\d/.test(text) && !flown.lines.includes(text)) flown.lines.push(text);
    }
    if (before === 'armed' && (phase() === 'pointing' || phase() === 'burning')) {
      flown.burns.push({ reason: bp?.reason ?? 'none', fuelPct: state().burn.fuelPct, lateTac, threads: threadsBusy() });
    }
  }
  return flown;
}

function describe(flown: Flown): string {
  return flown.burns.map((burn) => `${burn.reason}@${burn.fuelPct.toFixed(1)}% (+${burn.lateTac.toFixed(1)} tac)`).join(', ');
}

// --- v2 GREEN from a flyby with ▼ TOO WIDE: capture, then trim at ▲ -------------------------------------------------------
{
  kestrel(2, [0, 0], false);
  check('setup: v2 works as v2, the path open with ▼ above the ring', skillLive(state().memory, 'autoburn').version === 2
    && getPrediction().outcome === 'open' && getPrediction().fit.rp > state().level.ring.max);
  check('[B] would fly GREEN from the flyby', autoModeFor(state(), getPrediction(), skillLive(state().memory, 'autoburn')) === 'green');
  untilOffered();
  const fuel0 = state().burn.fuelPct;
  const wall0 = h.wall();
  h.press('KeyB');
  h.step();
  check('one press: armed in GREEN, no thread held', phase() === 'armed' && state().burn.auto.mode === 'green' && threadsBusy() === 0,
    `${phase()} ${state().burn.auto.mode} threads ${threadsBusy()}`);
  const strip = h.objective();
  check('…the correction row (TOO WIDE) outranks the ARMED row, with ` · AUTO ARMED`', strip?.id.startsWith('F8') === true
    && strip.text.endsWith(AUTOBURN_TEXT.armedTail), `${strip?.id} ${strip?.text}`);
  const flown = flyEngaged(600);
  h.step();
  console.log(`INFO GREEN on KESTREL from TOO WIDE: ${describe(flown)}; FUEL ${fuel0.toFixed(1)} → ${state().burn.fuelPct.toFixed(1)}%; `
    + `${(h.wall() - wall0).toFixed(1)} wall s; end ${state().burn.auto.end}; lines ${flown.lines.join(' | ')}`);
  check('GREEN flew the capture, re-armed, trimmed, and ended GREEN ORBIT in the ring', state().burn.auto.end === 'green' && fitNow().inRing
    && flown.burns[0]?.reason === 'capture' && flown.burns.length >= 2 && said(AUTOBURN_TEXT.green), `${state().burn.auto.end} ${describe(flown)}`);
  check('…no thread held while it only waited; no shrink planned while engaged', flown.heldWhileWaiting === 0 && !flown.shrink,
    `${flown.heldWhileWaiting} shrink ${flown.shrink}`);
  check('…TRIMMING while it trimmed', flown.lines.includes(AUTOBURN_TEXT.trimming), flown.lines.join(' | '));
  check('…every burn it flew held one Core thread (the trims claim theirs too: review M1)', flown.burns.every((burn) => burn.threads === 1),
    flown.burns.map((burn) => `${burn.reason}:${burn.threads}`).join(' '));
  // ROUND in the flight lives HOLD STEADY's 3 AI s (plan §7 R1): its burn at ▼ is a loop away, past LOCK 90.
  const pred = getPrediction();
  const roundBurn = previewModeBurn(state(), 'round', pred);
  const roundIn = roundBurn ? tacTo(roundBurn.inSec) : null;
  console.log(`INFO ROUND in the flight (KESTREL after GREEN): e ${eNow().toFixed(4)}; its burn at ▼ in ${roundIn?.toFixed(0)} tac s `
    + `(LOCK 90/270/810: ${autoburnRefusal(state(), pred) ?? 'offered'})`);
  check('…on a green loop with e ≥ 0.01 [B] would round it, but its burn is past LOCK 90 (R1: ROUND is a landing tool)',
    eNow() < ROUND_E_TOL || autoburnRefusal(state(), pred) === AUTOBURN_REFUSAL.tooFar, String(autoburnRefusal(state(), pred)));
}

// --- ROUND pressed in the flight's HOLD STEADY with LOCK 810 carries on into LANDING ----------------------------------------
{
  kestrel(2, [0, 0], true, 2);
  untilOffered();
  h.press('KeyB');
  flyEngaged(400);
  h.step();
  const e0 = eNow();
  const fuel1 = state().burn.fuelPct;
  const wall1 = h.wall();
  const offered = autoburnRefusal(state(), getPrediction());
  const line = h.objective()?.text ?? '';
  h.press('KeyB');
  h.step();
  check('LOCK 810: in HOLD STEADY the line offers ROUND and [B] arms it, its circle at ▼', offered === null && line === 'HOLD STEADY… · or [B] ROUND'
    && phase() === 'armed' && state().burn.auto.mode === 'round' && Math.abs((state().burn.auto.targetKm ?? 0) - getPrediction().fit.rp) < 1,
    `${offered} "${line}" ${phase()} ${state().burn.auto.mode}`);
  h.stepUntil(() => state().run.phase === 'landing', 10);
  check('…the flight locks under it, and ROUND stays armed into LANDING', state().run.phase === 'landing' && phase() === 'armed', `${state().run.phase} ${phase()}`);
  h.store.update((draft) => { draft.director.done.push(...LANDING_DONE); });
  ensureLandingKeys(h);
  const round = flyEngaged(400);
  console.log(`INFO ROUND from the flight's HOLD STEADY (KESTREL, LOCK 810): e ${e0.toFixed(4)} → ${eNow().toFixed(4)}; ${describe(round)}; `
    + `FUEL ${fuel1.toFixed(1)} → ${state().burn.fuelPct.toFixed(1)}%; ${(h.wall() - wall1).toFixed(1)} wall s; end ${state().burn.auto.end}`);
  check('…and rounds it in LANDING: ROUND ORBIT, e < ROUND_E_TOL', state().burn.auto.end === 'round' && eNow() < ROUND_E_TOL
    && said(AUTOBURN_TEXT.roundLanding), `${state().burn.auto.end} e ${eNow().toFixed(4)}`);
}

// --- ROUND in LANDING, from a locked ellipse; the other-apsis rule -----------------------------------------------------------
function landingOn(e: number, argPeriDeg: number): void {
  h.shipAlone(KESTREL, 1);
  h.store.update((draft) => {
    draft.hollow.phase = 'dormant';
    draft.director.done.push(...LANDING_DONE);
    for (const seg of draft.memory) if ('integrity' in seg) (seg as { integrity: number }).integrity = 100;
  });
  giveSkillFile(h.store, 'autoburn', 2);
  ensureLandingKeys(h);
  const ring = state().level.ring;
  lockOn(h, { r: ring.min + 0.35 * (ring.max - ring.min), e, argPeriDeg });
  h.stepFor(0.2);
}

{
  landingOn(0.05, 0);
  check('LANDING, a locked ellipse: [B] would fly ROUND', autoModeFor(state(), getPrediction(), skillLive(state().memory, 'autoburn')) === 'round');
  check('…far from its burn it is TOO FAR, and L13 says nothing of ROUND', autoburnRefusal(state(), getPrediction()) === AUTOBURN_REFUSAL.tooFar
    || autoburnRefusal(state(), getPrediction()) === null, String(autoburnRefusal(state(), getPrediction())));
  h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, 200);
  const line = h.shown()?.text ?? '';
  const fuel0 = state().burn.fuelPct;
  const e0 = eNow();
  const wall0 = h.wall();
  const aim = roundAim(state(), getPrediction());
  const aimAt = aim.targetKm === getPrediction().fit.rp ? '▼' : '▲';
  const rows: string[] = [];
  h.press('KeyB');
  h.step();
  const round = flyEngaged(400, () => {
    const row = landingFlightOf(state(), getPrediction()).row?.text;
    if (state().burn.firing && row && !rows.includes(row)) rows.push(row);
  });
  console.log(`INFO ROUND in LANDING (KESTREL, e ${e0.toFixed(3)}): ${describe(round)}; e → ${eNow().toFixed(4)}; FUEL ${fuel0.toFixed(1)} → `
    + `${state().burn.fuelPct.toFixed(1)}%; ${(h.wall() - wall0).toFixed(1)} wall s; circle at ${aimAt} `
    + `${aim.costsLz ? `costs ${aim.costsLz}` : 'no window crossed'}; strip before the press "${line}"`);
  check('ROUND in LANDING: one burn at ▼, ROUND ORBIT, e < ROUND_E_TOL', state().burn.auto.end === 'round' && eNow() < ROUND_E_TOL
    && round.burns.length >= 1 && round.burns[0]!.reason === 'round', `${state().burn.auto.end} e ${eNow().toFixed(4)} ${describe(round)}`);
  check('…the landing L2 row is AUTOBURN ROUNDING while it rounds', rows.includes(AUTOBURN_TEXT.rounding), JSON.stringify(rows));
  check('…the drop width is the same every pass now: ▼ and ▲ within 1% of each other', Math.abs(fitNow().ra - fitNow().rp) / fitNow().rp < 2 * ROUND_E_TOL);
}

// The other-apsis rule: the orbit turned so that ▼'s burn crosses an in-band window of an LZ with room.
{
  let found: { argDeg: number; lz: string } | null = null;
  for (let argDeg = 0; argDeg < 360 && found === null; argDeg += 10) {
    landingOn(0.05, argDeg);
    const pred = getPrediction();
    const sol = getDropSolution();
    const low = planModeBurn(state(), pred, 'round', pred.fit.rp);
    if (!sol || !low) continue;
    const blocks = burnSpanBlocks(state(), sol, secUntil(pred, low.inSec, state().clock.tSec), low.estBurnSec);
    if (blocks !== null) found = { argDeg, lz: blocks };
  }
  check('setup: an orbit whose ▼ burn crosses an LZ window', found !== null);
  if (found !== null) {
    const pred = getPrediction();
    const aim = roundAim(state(), pred);
    console.log(`INFO the other-apsis rule (KESTREL, ▼ at ${found.argDeg}°): ▼'s burn crosses ${found.lz}'s window → circle at `
      + `${aim.targetKm === pred.fit.ra ? '▲' : '▼'} (${(aim.targetKm - state().level.planet.R).toFixed(0)} km), ${aim.costsLz ? `costs ${aim.costsLz}` : 'no window lost'}`);
    check('…ROUND rounds at ▲ instead (or, with ▲ blocked too, at ▼ and names the window)', aim.targetKm === pred.fit.ra
      || (aim.targetKm === pred.fit.rp && aim.costsLz === found.lz), JSON.stringify(aim));
  }
}

// Review (a): GREEN pressed in LANDING on an accepted orbit fires its trim at the apsis whatever the window, and the radio
// names the window it costs at the press (ROUND's pattern), so the kid can drop it first.
function acceptedOn(argPeriDeg: number): void {
  landingOn(0, 0);
  const ring = state().level.ring;
  lockOn(h, { r: ring.min + 0.35 * (ring.max - ring.min), e: 0.15, argPeriDeg, status: 'accepted' });
  h.stepFor(0.2);
}
{
  let costs: string | null = null;
  for (let argDeg = 0; argDeg < 360 && costs === null; argDeg += 10) {
    acceptedOn(argDeg);
    if (autoModeFor(state(), getPrediction(), skillLive(state().memory, 'autoburn')) !== 'green') continue;
    h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, 200);
    if (autoburnRefusal(state(), getPrediction()) === null) costs = greenCostsLz(state(), getPrediction());
  }
  check('setup: an accepted orbit in LANDING whose GREEN trim crosses an LZ window', costs !== null);
  if (costs !== null) {
    h.press('KeyB');
    h.step();
    check('…[B] arms GREEN and the radio says `AUTOBURN: GREEN COSTS LZ-x\'s WINDOW`', phase() === 'armed' && state().burn.auto.mode === 'green'
      && said(AUTOBURN_TEXT.greenCostsWindow(costs)), `${phase()} ${state().burn.auto.mode} ${costs}`);
    h.press('KeyB');
    h.step();
  }
}

// --- The fuel reserve: never the capture, always a trim or ROUND -----------------------------------------------------------
{
  landingOn(0.05, 0);
  h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, 200);
  const bp = previewModeBurn(state(), 'round', getPrediction())!;
  const costPct = (bp.dvKmS / state().level.dvBudgetKmS) * 100;
  h.store.update((draft) => { draft.burn.fuelPct = AUTO_FUEL_RESERVE_PCT + costPct / 2; });
  check('the reserve: a ROUND burn that would leave < 20% is refused SAVING FUEL', autoburnRefusal(state(), getPrediction()) === AUTOBURN_REFUSAL.reserve,
    String(autoburnRefusal(state(), getPrediction())));
  h.store.update((draft) => { draft.burn.fuelPct = AUTO_FUEL_RESERVE_PCT + costPct + 1; });
  h.press('KeyB');
  h.step();
  check('…with enough over the reserve it arms', phase() === 'armed' && state().burn.auto.mode === 'round', phase());
  h.store.update((draft) => { draft.burn.fuelPct = AUTO_FUEL_RESERVE_PCT + costPct / 2; });
  h.step();
  h.step();
  check('…and when the FUEL falls under it while armed: GREEN, NOT ROUND — SAVING FUEL', phase() === 'done' && state().burn.auto.end === 'reserve'
    && said(AUTOBURN_TEXT.reserveRound) && threadsBusy() === 0, `${phase()} ${state().burn.auto.end}`);
}
{
  kestrel(2, [0, 0], false);
  untilOffered();
  h.store.update((draft) => { draft.burn.fuelPct = AUTO_FUEL_RESERVE_PCT + 5; });
  check('the capture is never refused for the reserve (plan §7 R4)', autoburnRefusal(state(), getPrediction()) === null,
    String(autoburnRefusal(state(), getPrediction())));
}

// --- The claim: every thread busy at T−8 (R6: hack or burn, no pre-emption) ------------------------------------------------
{
  kestrel(1, [0, 0], true);
  untilOffered();
  h.press('KeyB');
  h.step();
  const owners: string[] = [];
  for (let i = 0; i < threadsTotal(); i++) if (reserveThread(`test-op-${i}`)) owners.push(`test-op-${i}`);
  h.stepUntil(() => state().burn.auto.waitingSinceTSec !== null, 120);
  const waitLine = h.objective()?.text ?? '';
  check('every thread busy at the claim: it waits (`AUTOBURN NEEDS A THREAD IN 0:0n — [TAB], × AN OP`, urgent)', state().burn.auto.waitingSinceTSec !== null
    && !state().burn.auto.claimed && /^AUTOBURN NEEDS A THREAD IN 0:0\d — \[TAB\], × AN OP$/.test(waitLine) && h.objective()?.urgency === 'now', waitLine);
  // The kid frees a thread 3 tac s after the burn was due.
  h.stepUntil(() => (autoburnFireInTac(state(), getPrediction()) ?? 0) <= -3, 60);
  const lateLine = h.objective()?.text ?? '';
  for (const owner of owners) releaseThread(owner);
  const bp = getPrediction().burnPoint;
  const lateBy = bp ? -tacTo(bp.inSec) : NaN;
  h.stepUntil(() => phase() !== 'armed', 10);
  console.log(`INFO the thread claim: every thread busy from T−8, one freed ${lateBy.toFixed(1)} tac s after START BURN: the capture fired then`);
  check('…overdue it says NOW; freed, it claims and fires at once, late', lateLine === AUTOBURN_TEXT.threadWaitLateShip && (phase() === 'burning' || phase() === 'pointing')
    && state().burn.auto.claimed && threadsBusy() === 1, `"${lateLine}" ${phase()}`);
  flyEngaged(200);
  console.log(`INFO …the late capture ended ${state().burn.auto.end}, loop ${fitNow().closed ? 'closed' : 'open'}, FUEL ${state().burn.fuelPct.toFixed(1)}%`);
}

// --- Review M1: a GREEN trim with every thread busy waits for one ---------------------------------------------------------
{
  kestrel(2, [0, 0], false, 2);
  untilOffered();
  h.press('KeyB');
  h.stepUntil(() => phase() === 'burning', 300);
  h.stepUntil(() => phase() !== 'burning' && phase() !== 'pointing', 300);
  const afterCapture = { phase: phase(), claimed: state().burn.auto.claimed, threads: threadsBusy(), next: getPrediction().burnPoint?.reason };
  check('M1: re-armed after the capture, the claim is cleared and no thread is held', afterCapture.phase === 'armed' && !afterCapture.claimed
    && afterCapture.threads === 0, JSON.stringify(afterCapture));
  const owners: string[] = [];
  for (let i = 0; i < threadsTotal(); i++) if (reserveThread(`trim-op-${i}`)) owners.push(`trim-op-${i}`);
  let waitLine = '';
  let firedWhileBusy = false;
  const end = h.wall() + 400;
  while (h.wall() < end && phase() === 'armed' && state().burn.auto.waitingSinceTSec === null) {
    const fireIn = autoburnFireInTac(state(), getPrediction()) ?? 0;
    if (state().clock.skipWarp === null && (h.shown()?.keys ?? []).includes('F') && fireIn > 30) h.press('KeyF');
    h.step();
  }
  waitLine = h.objective()?.text ?? '';
  const waiting = state().burn.auto.waitingSinceTSec !== null;
  // Hold every thread until 2 tac s past its moment: it must not fire.
  h.stepUntil(() => { firedWhileBusy ||= phase() === 'burning' || phase() === 'pointing'; return (autoburnFireInTac(state(), getPrediction()) ?? 0) <= -2; }, 60);
  const lateLine = h.objective()?.text ?? '';
  for (const owner of owners) releaseThread(owner);
  h.stepUntil(() => phase() !== 'armed', 10);
  console.log(`INFO M1: the trim (${getPrediction().burnPoint?.reason}) waited "${waitLine}", then "${lateLine}"; freed 2 tac s late: ${phase()}`);
  check('…with every thread busy its trim waits: `AUTOBURN NEEDS A THREAD IN 0:0n`, and does not fire', waiting && !firedWhileBusy
    && /^AUTOBURN NEEDS A THREAD IN 0:0\d/.test(waitLine), `${waiting} ${firedWhileBusy} "${waitLine}"`);
  check('…overdue it says NOW; a thread freed, the trim claims it and fires late', /^AUTOBURN NEEDS A THREAD NOW/.test(lateLine)
    && (phase() === 'burning' || phase() === 'pointing') && state().burn.auto.claimed && threadsBusy() === 1, `"${lateLine}" ${phase()}`);
  flyEngaged(300);
}

// --- Review M2: an IN correction inside the claim window stands; RETRO is taken back at the fire moment --------------------
{
  kestrel(1, [0, 0], false);
  untilOffered();
  h.press('KeyB');
  h.step();
  h.stepUntil(() => state().burn.auto.claimed, 200);
  const atClaim = state().burn.sasMode;
  h.stepUntil(() => (autoburnFireInTac(state(), getPrediction()) ?? 0) <= 5, 30);
  h.press('KeyA');
  h.step();
  h.step();
  const afterA = state().burn.sasMode;
  h.stepUntil(() => !state().burn.presetAligning, 10);
  h.keyDown('Space');
  h.stepFor(0.4);
  const whileIn = { phase: phase(), sas: state().burn.sasMode, end: state().burn.auto.end };
  h.keyUp('Space');
  h.stepUntil(() => phase() !== 'armed', 30);
  check('M2: inside the claim window [A] stands (no re-select over it)', atClaim === 'retrograde' && afterA === 'radial-in', `${atClaim} → ${afterA}`);
  check('…the kid\'s IN burn at T−5 is no takeover', whileIn.phase === 'armed' && whileIn.sas === 'radial-in', JSON.stringify(whileIn));
  check('…and at its moment it takes RETRO back and flies the capture', (phase() === 'pointing' || phase() === 'burning')
    && state().burn.sasMode === 'retrograde' && state().burn.firingSource === 'auto', `${phase()} ${state().burn.sasMode} ${state().burn.firingSource}`);
  flyEngaged(300);
}

// --- Review m2: the kid's REPAIR takes an armed file offline: a plain end, no klaxon --------------------------------------
{
  kestrel(1, [0, 0], false);
  untilOffered();
  h.press('KeyB');
  h.step();
  const file = skillLive(state().memory, 'autoburn').file!;
  h.store.update((draft) => { const seg = draft.memory.find((candidate) => candidate.id === file.id); if (seg && 'integrity' in seg) seg.state = 'repairing'; });
  h.step();
  const alarm = state().alerts.list.some((alert) => alert.id === 'autoburn-lost');
  check('m2: repaired while armed it ends \'offline\' with its own line, no drop and no klaxon', phase() === 'idle' && state().burn.auto.end === 'offline'
    && !alarm && said(AUTOBURN_TEXT.offline.repairing) && threadsBusy() === 0, `${phase()} ${state().burn.auto.end} alarm ${alarm}`);
  h.store.update((draft) => { const seg = draft.memory.find((candidate) => candidate.id === file.id); if (seg && 'integrity' in seg) seg.state = 'intact'; });
}

// --- Review m3: the LOCK chime sounds once on the way in, not on each flip inside the bracket -------------------------------
{
  let chimes = 0;
  const off = on('autoburn-in-lock', () => { chimes++; });
  kestrel(1, [0, 0], false);
  untilOffered();
  h.step();
  const atEntry = chimes;
  // Inside the bracket the kid flies an IN correction (the refusal flips to YOU ARE BURNING and back), twice.
  for (let i = 0; i < 2; i++) {
    h.press('KeyA');
    h.stepUntil(() => !state().burn.presetAligning, 10);
    h.keyDown('Space');
    h.stepFor(0.3);
    h.keyUp('Space');
    h.stepFor(0.3);
  }
  off();
  check('m3: one chime into the bracket, none for the flips while the kid burns inside it', atEntry === 1 && chimes === 1, `${atEntry} ${chimes}`);
}

// --- Takeovers while armed: IN/OUT is not one, RETRO is ----------------------------------------------------------------------
{
  kestrel(1, [0, 0], false);
  untilOffered();
  h.press('KeyB');
  h.step();
  h.press('KeyA');
  h.stepUntil(() => !state().burn.presetAligning, 10);
  h.keyDown('Space');
  h.stepFor(0.5);
  const whileIn = phase();
  h.keyUp('Space');
  h.step();
  check('armed: the kid\'s IN correction does not cancel it', whileIn === 'armed' && phase() === 'armed' && state().burn.sasMode === 'radial-in', `${whileIn} ${phase()}`);
  h.stepUntil(() => state().burn.auto.claimed, 120);
  check('…at the claim it re-selects RETRO itself', state().burn.sasMode === 'retrograde' && phase() === 'armed', `${state().burn.sasMode} ${phase()}`);
  h.stepUntil(() => !state().burn.presetAligning, 10);
  h.keyDown('Space');
  h.step();
  h.keyUp('Space');
  h.step();
  check('…SPACE on RETRO while armed is a takeover', phase() === 'idle' && state().burn.auto.end === 'takeover' && threadsBusy() === 0, `${phase()} ${state().burn.auto.end}`);
}

// --- UNTRAINED (R3): 7.5 tac s late, against a trained skill -------------------------------------------------------------
// The trained run is also WP9's acceptance at quick depth (wp9/autoburn-sim flies its offsets −8, 0, +8 at full depth only,
// slice 4 plan §7 R11): its own throttle, BRAKING, FUEL ≥ 25% at loop-closed, the hand-back, and no demo of its own.
for (const offsets of [[] as number[], [0, 0]]) {
  kestrel(1, offsets, true);
  untilOffered();
  const demosBefore = state().run.stats.demos.length;
  h.press('KeyB');
  let fuelAtClosed: number | null = null;
  let ownThrottle = false;
  const flown = flyEngaged(300, () => {
    if (fuelAtClosed === null && fitNow().closed) fuelAtClosed = state().burn.fuelPct;
    if (phase() === 'burning' && state().burn.firing) ownThrottle ||= state().burn.firingSource === 'auto';
  });
  h.step();
  if (offsets.length > 0) {
    const end = state().burn.auto.end;
    const handBack = end === 'in-ring' ? AUTOBURN_TEXT.inRing : AUTOBURN_TEXT.braked;
    check('trained: its own throttle (\'auto\'), BRAKING on the strip, FUEL ≥ 25% at loop-closed', ownThrottle
      && flown.lines.includes(AUTOBURN_TEXT.burning) && fuelAtClosed !== null && fuelAtClosed >= 25, `${ownThrottle} ${fuelAtClosed}`);
    check('…it flies the capture through and hands back (thread let go, the radio says so); its capture is no demo',
      phase() === 'done' && (end === 'in-ring' || end === 'braked') && threadsBusy() === 0 && said(handBack)
      && state().run.stats.demos.length === demosBefore, `${phase()} ${end}`);
  }
  const lateTac = flown.burns[0]?.lateTac ?? NaN;
  const fit = fitNow();
  console.log(`INFO ${offsets.length === 0 ? 'UNTRAINED (40%)' : 'trained [0, 0] (99%)'}: fired ${lateTac.toFixed(1)} tac s after START BURN; `
    + `end ${state().burn.auto.end}; ▼ ${(fit.rp - state().level.planet.R).toFixed(0)} km ▲ ${(fit.ra - state().level.planet.R).toFixed(0)} km; FUEL ${state().burn.fuelPct.toFixed(1)}%`);
  const want = offsets.length === 0 ? AUTOBURN_UNTRAINED_OFFSET_TAC : 0;
  check(`${offsets.length === 0 ? 'UNTRAINED fires 7.5 tac s late' : 'a trained skill fires on the tick'} (or at ▼ if that comes first)`,
    Math.abs(lateTac - want) < 0.7 || (want > 0 && lateTac > 5), lateTac.toFixed(2));
}

// --- Graded damage (4b): v2 → v1 mid-capture finishes the capture, then hands back ---------------------------------------
{
  kestrel(2, [0, 0], false);
  untilOffered();
  h.press('KeyB');
  h.stepUntil(() => phase() === 'burning', 120);
  const file = skillLive(state().memory, 'autoburn').file!;
  h.store.update((draft) => { const seg = draft.memory.find((candidate) => candidate.id === file.id); if (seg && 'integrity' in seg) seg.integrity = 64; });
  h.step();
  check('v2 → v1 mid-capture (64%): it brakes on', skillLive(state().memory, 'autoburn').version === 1 && phase() === 'burning', phase());
  flyEngaged(200);
  check('…then hands back: DAMAGED TO v1 — CAPTURED, trim it green yourself', phase() === 'done' && state().burn.auto.end === 'downgraded'
    && said(AUTOBURN_TEXT.downgradedCaptured) && fitNow().closed, `${phase()} ${state().burn.auto.end}`);
}

finish();
