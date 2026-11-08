// Slice 4c–4e: Track ORBIT owns this file (docs/phase3/impl/slice-4cde-plan.md §2.1, §5, §7.2). Pure: AUTOBURN v3's
// LANDING ORBIT, the highest round orbit on the V3_STEP_KM grid where every LZ that still needs pods gets a sure window, its
// top-up rule against decay, and its words. The machine that flies it is autoburn.ts (which imports this module; never
// the other way round), the planner predict.ts (which this module reads, and which never reads it).
// Module-level state allowed here (plan §2.3): the landingOrbitAim memo (a cache keyed on every input it reads).
//
// • THE AIM (03 §3.6 step 1, plan §5.1, R12). Round orbits from one step under the band's top (a circle at ring.max itself
//   would leave the ring on ROUND's own tolerance) down by V3_STEP_KM to ring.min + V3_FLOOR_MARGIN_KM. An LZ with room
//   fits where landing-orbit sureTacAt gives it LANDING_SURE_MIN_TAC, judged at LANDING_TACTICAL_WARP (the landing's warp,
//   in FLIGHT too: level.tacticalWarp only becomes 20 at the lock) with Sensor Interp's and Nav Plotter's factors now and
//   the worst driver among the next BAY_SLOTS pods in the LOAD NEXT order. The highest orbit where every one fits; else the
//   one that fits the most (ties: the most pods with room, then the higher), its misses named with the REPAIR that would
//   help (landing-rules bestRepairForDrop, L9's rule). Each candidate must leave AUTO_FUEL_RESERVE_PCT after the capture
//   (on an open path), the transfer (two apsis burns, vis-viva) and the expected holds (below the DRAG line: a kick's Δv a
//   pass, for the passes the pods aboard need); with none, the aim is null and v3 flies v2's modes (03: "it behaves like
//   v2, by v2's mode rule"). An orbit that fits no LZ at all is no landing orbit: null too.
// • THE TOP-UP (plan §5.3, R13). The planet does not rotate, so a top-up whose burn crosses an LZ's window crosses it on
//   every pass. When it does, v3 re-aims the held circle down to the other apsis's altitude if every LZ it fits still fits
//   there and that burn crosses no window ("goes lower", which 03 allows); else it burns anyway and names the window.
import type { GameState } from '@state/schema';
import type { DropFactors, LzState, RepairHint } from '@/types/landing';
import { secUntil, atCircle, planModeBurn, getPrediction, type Prediction } from '@systems/predict';
import { capabilitiesNow, skillLive, ROLE_LABEL, type Capabilities } from '@systems/capabilities';
import { bestRepairForDrop, burnSpanBlocks, dropFactors, launchQueue, lzRemaining, podCounts, decayWarnOrbits } from '@systems/landing-rules';
import { dragDvKmS, dragLineKm, sureTacAt } from '@systems/landing-orbit';
import { dropHalfWidthKm } from '@systems/landing-solve';
import { getDropSolution } from '@systems/drop-cache';
import { autoburnDemoSkill } from '@systems/skill-tree';
import { engineOpen } from '@state/selectors';
import { podCode } from '@data/landing-text';
import { V3_TEXT } from '@data/skill-text';
import {
  V3_STEP_KM, V3_FLOOR_MARGIN_KM, V3_AIM_ABOVE_DRAG, LANDING_TACTICAL_WARP, LANDING_SURE_MIN_TAC, AUTO_FUEL_RESERVE_PCT, BAY_SLOTS, RA_TARGET_FRAC,
  LOCK_RANGE_TAC,
} from '@data/tuning';

// v3's target (plan §5.1).
export interface LandingOrbitAim {
  targetKm: number;                                      // R*, on the V3_STEP_KM grid from ring.max down
  fits: string[];                                        // the LZs with room that get a sure window there
  misses: { lz: string; repair: RepairHint | null }[];   // the others, with the REPAIR that would help (L9's rule)
  dropKm: number;                                        // the widest dot half-width among them there (`DROP ±70 km`)
  fuelAfterPct: number;                                  // after the capture, the transfer and the expected holds
  belowDrag: boolean;
}

// What the aim reads, all of it (the memo's key is made from these and nothing else).
interface AimInputs {
  lzs: LzState[];                    // the LZs with room, in the ship's order
  room: Record<string, number>;
  factors: DropFactors;
  aboard: number;
  cadenceTac: number;
  fuelPct: number;
  capturePct: number;                // the planned capture an open path flies first (always flown, plan 4 R4), % of the tank
  loop: { rp: number; ra: number };  // the loop the transfer starts from (after that capture on an open path)
}

function aimInputs(state: Readonly<GameState>, pred: Readonly<Prediction>): AimInputs | null {
  if (pred.outcome === 'impact' || state.landing.ended !== null) return null;
  const room = lzRemaining(state);
  const lzs = state.landing.lzs.filter((lz) => (room[lz.label] ?? 0) > 0);
  const aboard = podCounts(state).aboard;
  const caps = capabilitiesNow(state);
  if (lzs.length === 0 || aboard === 0 || caps.bay.cadenceTac === null) return null;
  const { ring } = state.level;
  const bp = pred.burnPoint;
  const open = pred.outcome === 'open';
  const capturePct = open && bp !== null && (bp.reason === 'capture' || bp.reason === 'missed') ? (bp.dvKmS / state.level.dvBudgetKmS) * 100 : 0;
  // The capture aims ▲ at RA_TARGET_FRAC of the band's top (predict computeBurnPoint), ▼ staying where it is.
  const loop = open ? { rp: pred.fit.rp, ra: Math.max(pred.fit.rp, RA_TARGET_FRAC * ring.max) } : { rp: pred.fit.rp, ra: pred.fit.ra };
  return { lzs, room, factors: worstFactors(state, caps), aboard, cadenceTac: caps.bay.cadenceTac, fuelPct: state.burn.fuelPct, capturePct, loop };
}

// Sensor Interp and Nav Plotter now, and the worst driver among the pods the bay would send next (03 §3.6: "the LOAD NEXT
// order"); a driver factor of 1 with no pod queued.
function worstFactors(state: Readonly<GameState>, caps: Readonly<Capabilities>): DropFactors {
  const queue = launchQueue(state).slice(0, BAY_SLOTS);
  const driver = Math.max(1, ...queue.map((pod) => dropFactors(caps, pod).driver));
  return { ...dropFactors(caps, null), driver };
}

function aimKey(state: Readonly<GameState>, input: Readonly<AimInputs>): string {
  const { ring } = state.level;
  return [
    // Slice 6 (R13): sitesRev, so an LZ SURVEY moved re-aims (the fit reads the LZs' widths).
    state.run.rev, state.run.phase, state.landing.sitesRev, ring.min, ring.max, state.landing.drag,
    input.lzs.map((lz) => `${lz.label}:${input.room[lz.label]}`).join(','), input.aboard, input.cadenceTac,
    input.factors.sensor, input.factors.plotter, input.factors.driver, Math.round(input.fuelPct), Math.round(input.capturePct),
    Math.round(input.loop.rp / 10), Math.round(input.loop.ra / 10),
  ].join('|');
}

let memo: { key: string; aim: LandingOrbitAim | null } | null = null;

// Δv (km/s) from the loop ▼ rp × ▲ ra to the circle of radius R by circleStep's two apsis burns: at ▲ to bring ▼ to R, then
// at R to bring the other side to R (impulsive, vis-viva: the plan's NEEDED reads the same way).
export function circleTransferDvKmS(mu: number, rp: number, ra: number, R: number): number {
  const speed = (r: number, a: number): number => Math.sqrt(mu * (2 / r - 1 / a));
  const first = Math.abs(speed(ra, (rp + ra) / 2) - speed(ra, (R + ra) / 2));
  const second = Math.abs(speed(R, (R + ra) / 2) - Math.sqrt(mu / R));
  return first + second;
}

// The sure window of each LZ on a circle of radius R (tac s at the landing's warp).
function sureOn(state: Readonly<GameState>, R: number, lzs: readonly LzState[], factors: Readonly<DropFactors>): number[] {
  const { planet } = state.level;
  const speed = Math.sqrt(planet.mu / R);
  return lzs.map((lz) => sureTacAt(R, speed, lz, factors, planet.R, LANDING_TACTICAL_WARP));
}

interface Candidate {
  R: number;
  fits: LzState[];
  pods: number;
  fuelAfterPct: number;
  belowDrag: boolean;
}

function candidateAt(state: Readonly<GameState>, input: Readonly<AimInputs>, R: number): Candidate {
  const { ring, planet, dvBudgetKmS } = state.level;
  const sure = sureOn(state, R, input.lzs, input.factors);
  const fits = input.lzs.filter((_lz, i) => (sure[i] ?? 0) >= LANDING_SURE_MIN_TAC);
  const pods = fits.reduce((sum, lz) => sum + (input.room[lz.label] ?? 0), 0);
  const belowDrag = state.landing.drag && R < dragLineKm(ring);
  // The holds (plan §5.1): a kick's Δv a pass while ▼ is under the DRAG line, for the passes the pods aboard need, each
  // pass landing up to what each fitting LZ's sure window holds at the live cadence (and its room, and the bay's slots).
  const perPass = fits.reduce((sum, lz) => {
    const sureTac = sure[input.lzs.indexOf(lz)] ?? 0;
    return sum + Math.min(input.room[lz.label] ?? 0, BAY_SLOTS, 1 + Math.floor(sureTac / input.cadenceTac));
  }, 0);
  const passes = perPass > 0 ? Math.ceil(input.aboard / perPass) : 0;
  const holdsDv = belowDrag ? passes * dragDvKmS(R, ring) : 0;
  const transferDv = circleTransferDvKmS(planet.mu, input.loop.rp, input.loop.ra, R);
  const fuelAfterPct = input.fuelPct - input.capturePct - ((transferDv + holdsDv) / dvBudgetKmS) * 100;
  return { R, fits, pods, fuelAfterPct, belowDrag };
}

// The grid (plan R12): one step under the band's top, then down by V3_STEP_KM to the floor.
export function landingOrbitGrid(ring: Readonly<{ min: number; max: number }>): number[] {
  const floor = ring.min + V3_FLOOR_MARGIN_KM;
  const out: number[] = [];
  for (let R = ring.max - V3_STEP_KM; R >= floor - 1e-6; R -= V3_STEP_KM) out.push(R);
  return out;
}

function computeAim(state: Readonly<GameState>, input: Readonly<AimInputs>): LandingOrbitAim | null {
  const caps = capabilitiesNow(state);
  const candidates = landingOrbitGrid(state.level.ring)
    .map((R) => candidateAt(state, input, R))
    .filter((c) => c.fits.length > 0 && c.fuelAfterPct >= AUTO_FUEL_RESERVE_PCT);
  if (candidates.length === 0) return null;
  // The grid runs from the top down, so the first of the best is the highest.
  const every = candidates.find((c) => c.fits.length === input.lzs.length);
  const highest = every ?? candidates.reduce((a, b) => (b.fits.length > a.fits.length || (b.fits.length === a.fits.length && b.pods > a.pods) ? b : a));
  const best = V3_AIM_ABOVE_DRAG === 'nearest' ? nearestAboveDrag(state, input, candidates, highest) : highest;
  const fitLabels = new Set(best.fits.map((lz) => lz.label));
  return {
    targetKm: best.R,
    fits: best.fits.map((lz) => lz.label),
    misses: input.lzs.filter((lz) => !fitLabels.has(lz.label)).map((lz) => ({ lz: lz.label, repair: bestRepairForDrop(state, caps, lz, best.R) })),
    dropKm: dropHalfWidthKm(best.R, state.level.planet.R, input.factors),
    fuelAfterPct: best.fuelAfterPct,
    belowDrag: best.belowDrag,
  };
}

// Review M5 (tuning V3_AIM_ABOVE_DRAG): among the candidates that fit as well as `highest` (the same LZs' count and pods)
// and lie above the DRAG line, the one whose transfer from the loop costs the least Δv; `highest` itself when none is above
// the line (below it the highest decays least, 03 §3.6's WHY). The highest is the first of the best, so when it is below
// the line every peer is too.
function nearestAboveDrag(state: Readonly<GameState>, input: Readonly<AimInputs>, candidates: readonly Candidate[], highest: Readonly<Candidate>): Candidate {
  const peers = candidates.filter((c) => !c.belowDrag && c.fits.length === highest.fits.length && c.pods === highest.pods);
  if (peers.length === 0) return highest;
  const dv = (c: Readonly<Candidate>): number => circleTransferDvKmS(state.level.planet.mu, input.loop.rp, input.loop.ra, c.R);
  return peers.reduce((a, b) => (dv(b) < dv(a) ? b : a));
}

// The landing orbit now, or null: nothing leaves AUTO_FUEL_RESERVE_PCT, no LZ with room or pod aboard, or an impact course,
// and MODES_BY_VERSION[3] falls back to v2's rule (03 §3.6). Memoised on everything it reads (aimKey): the LZs with room,
// the three drop factors, the ring, whole-percent FUEL, the loop to the nearest 10 km and the phase. Judged at
// LANDING_TACTICAL_WARP in FLIGHT too (R12).
export function landingOrbitAim(state: Readonly<GameState>, pred: Readonly<Prediction>): LandingOrbitAim | null {
  const input = aimInputs(state, pred);
  if (input === null) return null;
  const key = aimKey(state, input);
  if (memo?.key === key) return memo.aim;
  const aim = computeAim(state, input);
  memo = { key, aim };
  return aim;
}

// Review m12: why v3 has no landing orbit now, in the ghost's and the Skills row's words, or null (it has one, or nothing
// asks for one: no LZ with room, no pod aboard, an impact course). No orbit on the grid fits any LZ: the REPAIR that would
// give the first LZ a sure window at the grid's lowest circle (the narrowest dot), else that none fits; some fit, but none
// leaves the reserve: the FUEL.
export function v3NoAimLine(state: Readonly<GameState>, pred: Readonly<Prediction>): string | null {
  const input = aimInputs(state, pred);
  if (input === null || landingOrbitAim(state, pred) !== null) return null;
  const grid = landingOrbitGrid(state.level.ring);
  if (grid.some((R) => candidateAt(state, input, R).fits.length > 0)) return V3_TEXT.noOrbitFuel(AUTO_FUEL_RESERVE_PCT);
  const lowest = grid[grid.length - 1];
  const lz = input.lzs[0];
  const hint = lowest === undefined || lz === undefined ? null : bestRepairForDrop(state, capabilitiesNow(state), lz, lowest);
  return V3_TEXT.noOrbit(hint === null ? null : repairName(hint));
}

// For the memo's suite (v3-aim): the key the last call stored, and a way to drop it.
export function landingOrbitAimKey(): string | null {
  return memo?.key ?? null;
}

export function clearLandingOrbitMemo(): void {
  memo = null;
}

// Whether every LZ in `labels` gets a sure window on the circle of radius R with the aim's factors now.
function allFitAt(state: Readonly<GameState>, pred: Readonly<Prediction>, labels: readonly string[], R: number): boolean {
  const input = aimInputs(state, pred);
  if (input === null) return false;
  const lzs = state.landing.lzs.filter((lz) => labels.includes(lz.label));
  return sureOn(state, R, lzs, input.factors).every((sure) => sure >= LANDING_SURE_MIN_TAC);
}

// The LZ (of `labels`) that does not fit on the circle of radius R now but will at the aim: the one a GOES LOWER is for.
export function newlyFitting(state: Readonly<GameState>, pred: Readonly<Prediction>, labels: readonly string[], R: number): string | null {
  const input = aimInputs(state, pred);
  if (input === null) return null;
  const lzs = state.landing.lzs.filter((lz) => labels.includes(lz.label));
  const sure = sureOn(state, R, lzs, input.factors);
  return lzs.find((_lz, i) => (sure[i] ?? 0) < LANDING_SURE_MIN_TAC)?.label ?? null;
}

// What a planned top-up does about the windows (plan §5.3, R13): `lower` re-aims the held circle down to the other apsis's
// altitude (every LZ in `fits` still fits there); `costs-window` burns anyway and says `AUTOBURN v3: TOP-UP COSTS LZ-B's
// WINDOW`; `clear` crosses no window of an LZ with room.
export type V3TopUp =
  | { kind: 'lower'; toKm: number; lz: string }
  | { kind: 'costs-window'; lz: string }
  | { kind: 'clear' };

// The LZ whose in-band window a planned burn's span crosses (landing-rules burnSpanBlocks), or null.
function spanBlocks(state: Readonly<GameState>, pred: Readonly<Prediction>, bp: Readonly<{ inSec: number; estBurnSec: number }> | null): string | null {
  const sol = getDropSolution();
  if (sol === null || bp === null) return null;
  return burnSpanBlocks(state, sol, secUntil(pred as Prediction, bp.inSec, state.clock.tSec), Number.isFinite(bp.estBurnSec) ? bp.estBurnSec : 0);
}

// The top-up's verdict for the burn the prediction plans now while v3 holds its circle, or null with no top-up planned
// (not holding, or no circle burn planned). `aim`: the aim whose LZs must still fit at the other apsis.
export function v3TopUp(state: Readonly<GameState>, pred: Readonly<Prediction>, aim: Readonly<LandingOrbitAim>): V3TopUp | null {
  const auto = state.burn.auto;
  const bp = pred.burnPoint;
  if (!auto.holding || auto.mode !== 'landing-orbit' || auto.targetKm === null || bp === null || bp.reason !== 'round') return null;
  const blocked = spanBlocks(state, pred, bp);
  if (blocked === null) return { kind: 'clear' };
  // The other apsis: a burn at ▲ (bringing ▼ back up) leaves ▼'s altitude, one at ▼ leaves ▲'s.
  const otherKm = bp.event === 'apo' ? pred.fit.rp : pred.fit.ra;
  const floorKm = state.level.ring.min + V3_FLOOR_MARGIN_KM;
  if (otherKm < auto.targetKm && otherKm >= floorKm && allFitAt(state, pred, aim.fits, otherKm)
    && spanBlocks(state, pred, planModeBurn(state, pred as Prediction, 'landing-orbit', otherKm)) === null) {
    return { kind: 'lower', toKm: otherKm, lz: blocked };
  }
  return { kind: 'costs-window', lz: blocked };
}

// The armed AUTOBURN is v3 flying (or holding) its landing orbit in LANDING.
function v3Engaged(state: Readonly<GameState>): boolean {
  const auto = state.burn.auto;
  const engaged = auto.phase === 'armed' || auto.phase === 'pointing' || auto.phase === 'burning';
  return engaged && auto.mode === 'landing-orbit' && auto.targetKm !== null && state.run.phase === 'landing';
}

// L9's slot while v3 is engaged in its landing orbit (guidance.ts landingFlightOf carries it to the landing table every
// tick, on the prediction the table is built on; R16): `AUTOBURN v3 GOES LOWER — LZ-B's dot will fit` while it flies down
// to a circle where an LZ with room fits that does not fit on the loop it is on now (judged at ▲, the widest drop); null
// otherwise (L9 says its own line, or nothing).
export function v3LowerLine(state: Readonly<GameState>, pred: Readonly<Prediction>): string | null {
  if (!v3Engaged(state) || state.burn.auto.holding || pred.outcome !== 'closed') return null;
  const targetKm = state.burn.auto.targetKm!;
  if (!(pred.fit.ra > targetKm)) return null;
  const aim = landingOrbitAim(state, pred);
  if (aim === null) return null;
  const lz = newlyFitting(state, pred, aim.fits, pred.fit.ra);
  return lz === null ? null : V3_TEXT.lower(lz);
}

// The prediction's next burn as the armed machine will fire it: tac s to START BURN plus the learned offset (autoburn.ts
// fireInTac's rule; this module may not import autoburn.ts).
function fireInTac(state: Readonly<GameState>, pred: Readonly<Prediction>, inSec: number): number {
  return secUntil(pred as Prediction, inSec, state.clock.tSec) / state.level.tacticalWarp + autoburnDemoSkill(state.run.stats).learnedOffsetTac;
}

// guidance.ts formatTac's m:ss (guidance imports this module, so it cannot be imported back).
function clock(tacSec: number): string {
  const whole = Math.max(0, Math.ceil(tacSec));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// L10's slot (foundation review M4): while v3 holds its landing orbit below the DRAG line, its words outrank L10's `ORBIT
// DECAYING` (the decay is what it is handling): `AUTOBURN v3 TOPS UP AT ▼ IN 3:10 — it holds the orbit` once a top-up is
// planned, `AUTOBURN v3 HOLDS THE ORBIT — it tops up against the decay` while the decay is warned before one is. null: not
// holding under the line, or nothing to say (L10 says its own line, or none).
export function v3DecayLine(state: Readonly<GameState>, pred: Readonly<Prediction>): string | null {
  if (!v3Engaged(state) || !state.burn.auto.holding || !state.landing.drag) return null;
  if (!(pred.fit.rp < dragLineKm(state.level.ring))) return null;
  const bp = pred.burnPoint;
  if (bp !== null && bp.reason === 'round') return V3_TEXT.decayTopUp(bp.event === 'apo' ? '▲' : '▼', clock(fireInTac(state, pred, bp.inSec)));
  return decayWarnOrbits(state) !== null ? V3_TEXT.decayHolds : null;
}

// A REPAIR's name on the ghost's label (L9's words: `POD 05`, `SENSOR INTERP`, `NAV PLOTTER`).
function repairName(hint: Readonly<RepairHint>): string {
  switch (hint.file) {
    case 'driver': return podCode(hint.pod);
    case 'sensor': return ROLE_LABEL.sensor;
    case 'navplot': return ROLE_LABEL.navplot;
  }
}

// The NAV PLOT's label on the ghost circle (flight-hud.ts autoGhost): `LANDING ORBIT · EVERY LZ FITS · DROP ±70 km · FUEL
// −9%`, or `LANDING ORBIT · LZ-A, LZ-B FIT · REPAIR POD 05 FOR LZ-C` (the first miss a REPAIR helps; else the first miss).
export function v3GhostLabel(state: Readonly<GameState>, aim: Readonly<LandingOrbitAim>): string {
  if (aim.misses.length === 0) {
    const costPct = Math.max(0, Math.ceil(state.burn.fuelPct - aim.fuelAfterPct));
    return V3_TEXT.ghostEvery(Math.round(aim.dropKm), costPct);
  }
  const helped = aim.misses.find((miss) => miss.repair !== null);
  if (helped?.repair) return V3_TEXT.ghostSome(aim.fits, repairName(helped.repair), helped.lz);
  return V3_TEXT.ghostSome(aim.fits, null, aim.misses[0]!.lz);
}

// Whether v3's once-only lesson is due now (data/script.ts SKILL_4CDE_RULES: tut-autoburn-v3): the file works as v3, it
// is not engaged, no SKIP runs, and [B] would fly a landing orbit whose first burn is inside the LOCK RANGE (the lesson
// never offers a press that would be refused; autoburn.ts autoburnRefusal is the full rule, and this module may not
// import it). Reads the cached prediction.
export function v3TutorialDue(state: Readonly<GameState>): boolean {
  const live = skillLive(state.memory, 'autoburn');
  const auto = state.burn.auto;
  if (live.version !== 3 || live.lock === null || !engineOpen(state) || state.clock.paused || state.clock.skipWarp !== null) return false;
  if (auto.phase === 'armed' || auto.phase === 'pointing' || auto.phase === 'burning') return false;
  const pred = getPrediction();
  const aim = landingOrbitAim(state, pred);
  if (aim === null || (pred.outcome === 'closed' && atCircle(pred.fit, aim.targetKm))) return false;
  const bp = planModeBurn(state, pred as Prediction, 'landing-orbit', aim.targetKm);
  return bp !== null && secUntil(pred as Prediction, bp.inSec, state.clock.tSec) / state.level.tacticalWarp <= LOCK_RANGE_TAC[live.lock];
}

// `__ap.v3()`: the aim (R*, fits, misses, the fuel line, the ghost's label) and its memo key.
export function v3Debug(state: Readonly<GameState>, pred: Readonly<Prediction>): { aim: LandingOrbitAim | null; key: string | null; label: string | null } {
  const aim = landingOrbitAim(state, pred);
  return { aim, key: landingOrbitAimKey(), label: aim === null ? null : v3GhostLabel(state, aim) };
}
