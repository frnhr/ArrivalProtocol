// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): only if the window rule needs more
// than the state argument. Others ask by message.
import type { Store } from '@state/store';
import type { GameState, Pace, LevelState, SkipWaypoint } from '@state/schema';
import { onPreTick, isActivePhase, isLivePhase, setPaused, setFastForwardRamp } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { isBurnHeld, isGhostFiring, ghostDueInSec, laterBurstWindow } from '@systems/orbit-sim';
import {
  getPrediction, currentPrediction, secUntil, isFinishingBurn, skipWarp, type BurnPoint, type Prediction, type ZoneHit,
} from '@systems/predict';
import { ZONE_WORD } from '@data/zone-text';
import { ghostBurstsThisPhase, spreadPaused } from '@state/selectors';
import { capabilitiesNow, ghostRefusesSkip } from '@systems/capabilities';
import { registerKeys } from '@systems/input';
import { emit } from '@systems/events';
import { getDropSolution } from '@systems/drop-cache';
import { landingMoment, podCounts, type LandingMoment } from '@systems/landing-rules';
import { activeLandingController, controllerLaunchInSec, windowRuleHolds } from '@systems/landing-controller';
import { offerInTac, landingBurnOffer, declineKey } from '@systems/landing-orbit';
import type { DropSolution } from '@/types/landing';
import { LANDING_SKIP_REFUSAL } from '@data/landing-text';
import {
  TICK_MS, TACTICAL_LEAD_BURN_TAC, SKIP_END_LEAD_TAC, SKIP_MIN_JUMP_TAC, SKIP_LANDING_TOLERANCE_SEC, DEBUG_WARP_MAX, SKIP_EASE_OUT_SEC,
  OVERCLOCK_FACTOR, IGNORED_NOW_TAC, ZONE_TACTICAL_LEAD_TAC, DODGE_TACTICAL_LEAD_TAC, WINDOW_TACTICAL_LEAD_TAC,
  FF_LEG_WALL_SEC, FF_DECADE_SEC, FF_SOFT_DWELL_SEC, FF_ZONE_PASS_WALL_SEC, FF_PASSED_MATCH_TAC,
} from '@data/tuning';

// The director's pace (§6.1). A kid should never have to discover time warp: the game runs
// TACTICAL (real-second countdowns) whenever something is happening or about to, CRUISE
// through quiet coasts, and SKIP when the player asks to jump to the next event.
//
// This module is the ONLY writer of clock.speedTarget. It runs in the clock's pre-tick, ahead
// of the "halted" early-out, so it can always lift a stop; pause, terminal outcomes and the
// ?debug ladder only toggle clock.paused / clock.debugWarp and pace turns them into a target.
//
// LEAD-2, the coast SKIP: a SKIP is a pure coast (nothing fires, by hand or by itself), so the sim flies it in
// exact jumps along the orbit (orbit-sim.ts) and no warp is too fast. The warp is the gap / SKIP_DIVISOR with no
// ceiling, so every SKIP takes the same few seconds whatever it crosses (49 tactical days included), and its last
// tick is shortened to land exactly on its end point: SKIP_END_LEAD_TAC before the event, or the start of the
// next ghost burst (the sim fires it on the tick after, at the game time it was drawn for).

// Countdowns are in TACTICAL seconds: one formula, so a countdown never jumps when the pace
// changes; it just ticks faster in CRUISE/SKIP (shown with ▸▸).
export function tac(gameSec: number, tacticalWarp: number): number {
  return gameSec / tacticalWarp;
}

// Game seconds from now to the next START BURN tick, or null when no burn is planned.
function burnPointInSec(state: Readonly<GameState>, pred: Prediction): number | null {
  const burnPoint = pred.burnPoint;
  return burnPoint ? secUntil(pred, burnPoint.inSec, state.clock.tSec) : null;
}

// A missed ▼ the kid has let ride for IGNORED_NOW_TAC without burning (WP1-rules 3a): it no
// longer holds the world at TACTICAL, and SKIP may jump to the escape. The strip still says how
// to save it, and holding SPACE again brings TACTICAL straight back.
function isMissedBurnIgnored(state: Readonly<GameState>, pred: Prediction): boolean {
  return pred.burnPoint?.reason === 'missed' && state.burn.missedIdleTac >= IGNORED_NOW_TAC;
}

// --- Hazard zones (WP9, §6.8) ---------------------------------------------------------------------------
// TACTICAL from ZONE_TACTICAL_LEAD_TAC before a zone entry until the exit, so a contact is always seen at
// real-second speed; SKIP stops short of an entry and is refused inside. Read from the TRUE path: under
// PATH UNCERTAIN the world still slows for a cloud the kid can't see clearly.

// Game seconds from now to a zone's next entry and to its exit (null: none on the drawn path).
interface ZoneWindow {
  hit: ZoneHit;
  toEntry: number | null;
  toExit: number | null;
}

function zoneWindows(state: Readonly<GameState>, pred: Prediction): ZoneWindow[] {
  const now = state.clock.tSec;
  return pred.zoneHits.map((hit) => ({
    hit,
    toEntry: hit.enterInSec === null ? null : secUntil(pred, hit.enterInSec, now),
    toExit: hit.exitInSec === null ? null : secUntil(pred, hit.exitInSec, now),
  }));
}

// The ship is inside a zone now: it started inside (the prediction's first point) or its entry has passed
// since, and its exit has not.
function isInside(window: ZoneWindow): boolean {
  const entered = window.hit.insideNow || (window.toEntry !== null && window.toEntry <= 0);
  return entered && (window.toExit === null || window.toExit > 0);
}

// The zone the ship is in, if any (a spent debris cloud counts until the ship is out of it).
export function zoneInside(state: Readonly<GameState>, pred: Prediction): ZoneHit | null {
  return zoneWindows(state, pred).find(isInside)?.hit ?? null;
}

// The next zone that can still hurt, and the game seconds to its entry (null: none ahead on the drawn path).
export function nextZoneEntry(state: Readonly<GameState>, pred: Prediction): { hit: ZoneHit; inSec: number } | null {
  let best: { hit: ZoneHit; inSec: number } | null = null;
  for (const window of zoneWindows(state, pred)) {
    if (window.hit.spent || window.toEntry === null || window.toEntry <= 0 || isInside(window)) continue;
    if (!best || window.toEntry < best.inSec) best = { hit: window.hit, inSec: window.toEntry };
  }
  return best;
}

// A zone entry within the TACTICAL lead, or the ship inside one.
function zoneClose(state: Readonly<GameState>, pred: Prediction): ZoneHit | null {
  const inside = zoneInside(state, pred);
  if (inside) return inside;
  const next = nextZoneEntry(state, pred);
  return next !== null && tac(next.inSec, state.level.tacticalWarp) <= ZONE_TACTICAL_LEAD_TAC ? next.hit : null;
}

// --- The debris dodge's deadline (WP9 review round 2: the lead's ruling for fix round 1, item 1) -----------------
// The last moment the ▼ correction still takes the path off a debris cloud (predict.ts debrisDodge, the strip's
// `· 0:24 to dodge DEBRIS C`) is a pace event, like a burn: TACTICAL for its last DODGE_TACTICAL_LEAD_TAC, so the
// countdown's last seconds are real seconds, and a SKIP ends ahead of it, so the kid always gets to make the choice.
// Read from the TRUE path, like the zones: a blind kid can't see the dodge, but it is there to save until it runs out.

// Game seconds from now to the nearest dodge deadline still ahead, or null (no cloud the correction can still dodge).
// While the correction is held the deadline is "now" (predict.ts asks only whether holding on dodges): not ahead.
function dodgeDeadlineInSec(state: Readonly<GameState>, pred: Prediction): number | null {
  const now = state.clock.tSec;
  let nearest: number | null = null;
  for (const hit of pred.zoneHits) {
    if (hit.kind !== 'debris' || hit.correctionClears !== true || hit.dodgeInSec === null) continue;
    const inSec = secUntil(pred, hit.dodgeInSec, now);
    if (inSec > 0 && (nearest === null || inSec < nearest)) nearest = inSec;
  }
  return nearest;
}

// What SKIP jumps to: the START BURN tick, or a debris dodge's deadline or a hazard zone's entry when that comes
// first (§6.1: SKIP ends before it), or, when no burn is possible on an open path (an empty tank, or a missed ▼ the
// kid let ride), the escape. During the LANDING: the next awaited window (01-landing §3.12), or a zone's entry first.
// null when there is nothing ahead. A ghost burst (C2) is not a plan: it only stops a SKIP on its way (skipLandsInSec).
interface NextEvent {
  kind: 'burn' | 'escape' | 'zone' | 'dodge' | 'window';
  inSec: number;  // game seconds from now
}

// How far ahead of an event SKIP ends, in tactical seconds: SKIP_END_LEAD_TAC, or for a zone its TACTICAL lead
// (the world must already be at real-second speed there, so the SKIP must not run into the lead by a tick). A dodge's
// TACTICAL lead is shorter than SKIP_END_LEAD_TAC today; the max keeps that true if either is retuned. A window's is its
// TACTICAL lead: the SKIP lands straight into GET READY, with no CRUISE dead time before it (§3.12).
function endLeadTac(event: NextEvent): number {
  if (event.kind === 'zone') return ZONE_TACTICAL_LEAD_TAC;
  if (event.kind === 'dodge') return Math.max(SKIP_END_LEAD_TAC, DODGE_TACTICAL_LEAD_TAC);
  if (event.kind === 'window') return WINDOW_TACTICAL_LEAD_TAC;
  return SKIP_END_LEAD_TAC;
}

// --- The landing's pace (01-landing §3.12) ----------------------------------------------------------------------------
// No burn, no dodge and no escape after the lock (risk 1: no engine in LANDING in 1a): the landing's events are its
// windows. The window the landing WAITS ON, and when its launch moment comes, are landing-rules landingMoment's (the one
// answer pace, the table, the beeps and the chips share): an in-band window of an LZ with projected room, or, once no
// in-band window has room, the next in-band one (its launch lands MISLANDED: L3b), and only while the landing goes on
// with a pod aboard that can launch some day. A full LZ's window passes at CRUISE while another in band has room, and
// does not hold up a SKIP to it. "Open now" is state.landing.window (landing.ts writes it); the times come from the drop
// cache's solution, rebased to now.

function isLanding(state: Readonly<GameState>): boolean {
  return state.run.phase === 'landing';
}

function momentNow(state: Readonly<GameState>, sol: Readonly<DropSolution> | null = getDropSolution()): LandingMoment {
  return landingMoment(state, sol, state.clock.tSec, capabilitiesNow(state).bay.offline);
}

// The window the landing waits on is open now (state.landing.window).
export function awaitedWindowOpen(state: Readonly<GameState>): boolean {
  return isLanding(state) && momentNow(state).open?.awaited === true;
}

// Game seconds from now until the awaited window's launch moment (landing-rules launchMomentInSec: where its whole dot
// first fits in the band, else its in-band opening; ≤ 0: it has come), or null: none (the landing over, no pod aboard
// that can launch some day, no drop solution, no in-band window on this orbit). The TACTICAL lead, the SKIP's landing
// point, GET READY and its beeps all count to this one moment, so the 8 s of GET READY end on LAUNCH NOW (§3.2's
// 24–30 s per window).
export function windowLaunchInSec(state: Readonly<GameState>, sol: Readonly<DropSolution> | null = getDropSolution()): number | null {
  if (!isLanding(state)) return null;
  return momentNow(state, sol).target?.launchInSec ?? null;
}

// §3.12: TACTICAL while a pod is falling, with thrust, an alarm or a zone close (the flight's rules), and, by the window
// rule, while an awaited window is open or its launch moment is within WINDOW_TACTICAL_LEAD_TAC. The window rule is for hand drops and
// for a controller that holds TACTICAL (§3.14: a higher AUTODROP drops inside a SKIP). The lead is judged one CRUISE
// tick ahead, as the dodge's is (choosePace), so the world is at TACTICAL by the 8 s mark, never a tick past it; a SKIP
// needs no look-ahead: it lands WINDOW_TACTICAL_LEAD_TAC before the launch moment by itself (skipLandsInSec).
// Slice 1b (§3.12, plan §1.4): with the engine open, also TACTICAL on an impact course and while the OFFERED burn's START
// BURN is within TACTICAL_LEAD_BURN_TAC (or due), judged one CRUISE tick ahead like the window lead. Only the offer
// (landing-orbit landingBurnOffer): a declined trim or GO LOWER costs no second TACTICAL pass (risk 2). No 'kick' event:
// a drag kick stops neither pace nor a SKIP (risk 4; orbit-sim splits the SKIP's jump exactly at each kick).
function landingPace(state: Readonly<GameState>, pred: Prediction, skipActive: boolean, dtWall: number): Pace {
  if (thrustHoldsTactical(state)) return 'tactical';
  if (podCounts(state).falling > 0) return 'tactical';
  if (hasAlarm(state)) return 'tactical';
  if (zoneClose(state, pred) !== null) return 'tactical';
  if (pred.outcome === 'impact' && state.landing.ended === null) return 'tactical';
  const tickAheadSec = skipActive ? 0 : state.level.cruiseWarp * Math.max(dtWall, TICK_MS / 1000);
  const toBurnTac = offerInTac(state, pred, tickAheadSec);
  if (toBurnTac !== null && toBurnTac <= TACTICAL_LEAD_BURN_TAC) return 'tactical';
  if (windowRuleHolds(state)) {
    if (awaitedWindowOpen(state)) return 'tactical';
    const toWindow = windowLaunchInSec(state);
    if (toWindow !== null && tac(toWindow - tickAheadSec, state.level.tacticalWarp) <= WINDOW_TACTICAL_LEAD_TAC) return 'tactical';
    // Slice 4c review B2: the controller's own next launch is a window too (its LZ may be one the landing does not wait on).
    const toLaunch = controllerLaunchInSec(state);
    if (toLaunch !== null && tac(toLaunch - tickAheadSec, state.level.tacticalWarp) <= WINDOW_TACTICAL_LEAD_TAC) return 'tactical';
  }
  return skipActive ? 'skip' : 'cruise';
}

// The landing's SKIP stops at its window, a zone, the offered burn (SKIP_END_LEAD_TAC before its START BURN, as a flight
// burn) and, on an open path, the escape (as in flight: nothing else is ahead of a ship leaving).
function landingNextEvent(state: Readonly<GameState>, pred: Prediction): NextEvent | null {
  const candidates: NextEvent[] = [];
  const zone = nextZoneEntry(state, pred);
  if (zone !== null) candidates.push({ kind: 'zone', inSec: zone.inSec });
  const toWindow = windowLaunchInSec(state);
  if (toWindow !== null) candidates.push({ kind: 'window', inSec: toWindow });
  // Slice 4c review B2: a SKIP stops before a TACTICAL-holding controller's next launch (null for one that drops in a SKIP).
  const toLaunch = controllerLaunchInSec(state);
  if (toLaunch !== null) candidates.push({ kind: 'window', inSec: toLaunch });
  const toBurnTac = offerInTac(state, pred);
  if (toBurnTac !== null) candidates.push({ kind: 'burn', inSec: toBurnTac * state.level.tacticalWarp });
  if (candidates.length > 0) return candidates.reduce((first, candidate) => (candidate.inSec < first.inSec ? candidate : first));
  if (pred.escapeInSec !== null) return { kind: 'escape', inSec: secUntil(pred, pred.escapeInSec, state.clock.tSec) };
  return null;
}

// Why SKIP can't run during the landing, beyond the inhibitors it shares with the flight (null: none of these).
function landingSkipInhibitor(state: Readonly<GameState>): string | null {
  const falling = podCounts(state).falling > 0;
  if (state.landing.ended !== null) return falling ? LANDING_SKIP_REFUSAL.podsInFlight : LANDING_SKIP_REFUSAL.over;
  if (windowRuleHolds(state) && awaitedWindowOpen(state)) return LANDING_SKIP_REFUSAL.windowOpen;
  if (falling) return LANDING_SKIP_REFUSAL.podsInFlight;
  return null;
}

function nextEvent(state: Readonly<GameState>, pred: Prediction): NextEvent | null {
  // Playtest 1 (§3.1): a leg of the held [F] runs to the fast-forward's next stop (its soft stops passed this hold left out,
  // the landing's offers in), so the SKIP engine below lands it there.
  if (ff.leg) return ffNextStop(state, pred);
  if (isLanding(state)) return landingNextEvent(state, pred);
  const toBurn = isMissedBurnIgnored(state, pred) ? null : burnPointInSec(state, pred);
  const zone = nextZoneEntry(state, pred);
  const toDodge = dodgeDeadlineInSec(state, pred);
  const candidates: NextEvent[] = [];
  if (toDodge !== null) candidates.push({ kind: 'dodge', inSec: toDodge });
  if (zone !== null) candidates.push({ kind: 'zone', inSec: zone.inSec });
  if (toBurn !== null) candidates.push({ kind: 'burn', inSec: toBurn });
  if (candidates.length > 0) return candidates.reduce((first, candidate) => (candidate.inSec < first.inSec ? candidate : first));
  if (pred.escapeInSec !== null) return { kind: 'escape', inSec: secUntil(pred, pred.escapeInSec, state.clock.tSec) };
  return null;
}

// Game seconds from now to where a running SKIP lands: its event's end lead, or the FIRST ghost burst of the flight or of
// the landing (review M2: selectors ghostBurstsThisPhase) when that comes first, with no lead (the alarm moment the kid must see; orbit-sim.ts ghostDueInSec draws it exactly
// as the sim would, so asking moves nothing). A later burst is no landing (WP10, the lead's ruling): the SKIP flies
// through it (skipWaypointTSec). null: nothing to land on. (Named apart from the LANDING phase: this is where a SKIP
// lands. The landing has its ghost bursts too since 1b: its engine is open.)
export function skipLandsInSec(state: Readonly<GameState>, pred: Prediction): number | null {
  const event = nextEvent(state, pred);
  // Slice 5 (review m4): a corrupted resident's own first burst is its alarm moment too, even after Thrust Ctrl's bursts
  // (CorruptedState.bursts counts the resident's alone; the next burst is the resident's while it fires: ghostBy).
  const corrupted = state.resident.corrupted;
  const residentFirst = corrupted !== null && corrupted.bursts === 0 && capabilitiesNow(state).thrustCtrl.ghostBy === 'resident';
  const ghostInSec = ghostBurstsThisPhase(state) === 0 || residentFirst ? ghostDueInSec(state) : null;
  const toEvent = event === null ? null : event.inSec - endLeadTac(event) * state.level.tacticalWarp;
  if (ghostInSec === null) return toEvent;
  return toEvent === null ? ghostInSec : Math.min(toEvent, ghostInSec);
}

// What a running SKIP is flying to (WP10: a later ghost burst re-checks it, systems/ghost-thrust.ts): the next event's
// kind and the game time it falls on, or null when nothing is ahead.
export interface SkipTarget {
  kind: NextEvent['kind'];
  atTSec: number;
}

export function skipTarget(state: Readonly<GameState>, pred: Prediction): SkipTarget | null {
  const event = nextEvent(state, pred);
  return event === null ? null : { kind: event.kind, atTSec: state.clock.tSec + event.inSec };
}

// The thrust that holds the world at TACTICAL (§6.1): the kid's or AUTOBURN's held burn, and the engine firing by itself
// on the FIRST burst of the flight or of the landing (the alarm moment) or on a sticky one (it runs until the kid presses SPACE). A later burst
// changes no pace (§9 WP10 item 2): at CRUISE it lasts a third of a second, and a SKIP flies through it.
function thrustHoldsTactical(state: Readonly<GameState>): boolean {
  if (isBurnHeld(state)) return true;
  const ghost = state.burn.ghost;
  return ghost !== null && (ghost.sticky || ghostBurstsThisPhase(state) <= 1);
}

// Tactical seconds to the next event a SKIP would run to (the next burn point, a zone entry or a dodge's deadline,
// or flying away), or null when nothing is coming.
export function tacToNextEvent(state: Readonly<GameState>, pred: Prediction): number | null {
  const event = nextEvent(state, pred);
  return event === null ? null : tac(event.inSec, state.level.tacticalWarp);
}

function hasAlarm(state: Readonly<GameState>): boolean {
  return state.alerts.list.some((alert) => alert.severity === 'alarm');
}

// `dtWall`: the wall seconds of the tick about to run (the clock's pre-tick hands it over).
export function choosePace(state: Readonly<GameState>, pred: Prediction, skipActive: boolean, dtWall: number): Pace {
  // The landing has its own rules (01-landing §3.12): phase 2's "in the ring, so TACTICAL" must not hold there.
  if (isLanding(state)) return landingPace(state, pred, skipActive, dtWall);
  // A held burn counts while its preset is still aligning: thrust starts mid-tick. So does the engine firing by itself
  // on its first (or a sticky) burst (C2, thrustHoldsTactical).
  if (thrustHoldsTactical(state)) return 'tactical';
  if (pred.outcome === 'impact') return 'tactical';
  const toBurn = burnPointInSec(state, pred);
  if (toBurn !== null && tac(toBurn, state.level.tacticalWarp) <= TACTICAL_LEAD_BURN_TAC
    && !isMissedBurnIgnored(state, pred)) return 'tactical';
  if (pred.fit.inRing || state.burn.lockHoldAiSec > 0) return 'tactical';
  if (hasAlarm(state)) return 'tactical';
  if (zoneClose(state, pred) !== null) return 'tactical';
  // The dodge's last DODGE_TACTICAL_LEAD_TAC run at TACTICAL in full (LEAD-2): pace is chosen from the state at the
  // start of the tick, and a CRUISE tick is 0.16 tac s on KESTREL (the world used to slow at 9.84 tac s left), so the
  // deadline is judged one CRUISE tick ahead: this tick's real length, at least a nominal tick. Not at the speed the
  // world runs now (LEAD-2 review round 1): that is the pace this rule chooses, so it fed back on itself (TACTICAL,
  // CRUISE, TACTICAL at 0:10), and during a SKIP it reached far ahead and dropped the SKIP for a tick. A SKIP needs
  // no look-ahead: it lands SKIP_END_LEAD_TAC before the deadline by itself (skipLandsInSec).
  const toDodge = dodgeDeadlineInSec(state, pred);
  const tickAheadSec = skipActive ? 0 : state.level.cruiseWarp * Math.max(dtWall, TICK_MS / 1000);
  if (toDodge !== null && tac(toDodge - tickAheadSec, state.level.tacticalWarp) <= DODGE_TACTICAL_LEAD_TAC) return 'tactical';
  return skipActive ? 'skip' : 'cruise';
}

function warpFor(level: LevelState, pace: Pace, skipWarp: number | null, overclock: boolean, fastWarp: number | null): number {
  if (pace === 'tactical') return overclock ? level.tacticalWarp * OVERCLOCK_FACTOR : level.tacticalWarp;
  if (pace === 'cruise') return level.cruiseWarp;
  if (pace === 'fast') {
    if (fastWarp === null) throw new Error('warpFor: FAST pace without a capped warp');
    return fastWarp;
  }
  if (skipWarp === null) throw new Error('warpFor: SKIP pace without a skip warp');
  return skipWarp;
}

// OVERCLOCK (§3.2, §6.1): jacking in while something is happening slows the WORLD to a quarter
// of the tactical warp; the mind's ops run on AI time, so they keep full speed. In CRUISE and
// SKIP blue runs the world at full speed (hacking a coast never stretches it), and jacking in
// never cancels a SKIP. The ?debug ladder overrides it like every pace. The landing overclocks like the flight
// (01-landing §3.12): TAB during a window slows the world to ¼, so the window (and the bay's reload with it, both world
// time) lasts four times as long in real seconds while the kid repairs; the descents run on AI time and do not stretch.
export function isOverclocked(state: Readonly<GameState>, pace: Pace, _pred: Prediction): boolean {
  if (pace !== 'tactical' || state.ui.mode !== 'memory' || state.clock.debugWarp !== null) return false;
  return state.run.phase === 'flight' || state.run.phase === 'landing';
}

// SKIP's refusal when ACCEPT ORBIT is the only way on (Prediction.acceptOnly, LEAD-1 and the lead's Rule 4):
// no burn the FUEL left can make saves the ship. The strip names ACCEPT ORBIT in the same words.
export const SKIP_REFUSAL_STRANDED = 'NOT ENOUGH FUEL';
// SKIP's refusal in the few seconds between the coast's start and a coast-tied wake (the WALLS stage on).
export const SKIP_REFUSAL_WAKING = 'SOMETHING IS WAKING UP';
// SKIP's refusal in the last SKIP_END_LEAD_TAC before a debris dodge's deadline (WP9 review round 2; round 1 refused
// it for the whole window), as the kid sees it: the countdown on the strip (`· 0:12 to dodge DEBRIS C`), or, while
// the plot is blind, the PATH UNCERTAIN line.
export const SKIP_REFUSAL_DODGE = 'DODGE THE DEBRIS FIRST';
export const SKIP_REFUSAL_BLIND_DODGE = 'PATH UNCERTAIN';

function dodgeRefusal(state: Readonly<GameState>): string {
  const mode = capabilitiesNow(state).plot.mode;
  return mode === 'exact' || mode === 'approx' ? SKIP_REFUSAL_DODGE : SKIP_REFUSAL_BLIND_DODGE;
}
// SKIP's refusal on a seeding ship until its first seed has come (WP9 review round 1).
export const SKIP_REFUSAL_SEED_COMING = 'SOMETHING IS COMING';
// Slice 3b review (item 1, the lead's decision): on the arm, once the engine has fired by itself and no Swap is aboard to
// stop it, a flight's SKIP is refused while the frequent bursts are due (capabilities ghostRefusesSkip: Thrust Ctrl failing
// or dead; once REPAIR has it in the degraded band its rare twitch is flown through as WP10 ruled). A SKIP used to fly
// through every later burst (WP10's ruling, made when SWAP always came with the first burst): on VESPER flown without Swap
// about 40 bursts went by in a few wall seconds, each costing FUEL, and the tank was gone before the kid saw why. At
// CRUISE every burst is seen (the whump, ▼ DRIFT, the counter) and the strip's fix comes after it. Stopping the SKIP at
// each burst instead would mean a press of F every few seconds (a burst every 10 tac s on average, 4 s at CRUISE ×80).
export const SKIP_REFUSAL_ENGINE_FAULT = 'ENGINE FAULT — NO SKIP';
// ...near a hazard zone and inside it (WP9): `DEBRIS AHEAD`, `IN THE DEBRIS`.
export function skipRefusalZoneAhead(kind: ZoneHit['kind']): string {
  return `${ZONE_WORD[kind]} AHEAD`;
}
export function skipRefusalInZone(kind: ZoneHit['kind']): string {
  return `IN THE ${ZONE_WORD[kind]}`;
}

// A seeding HOLLOW is awake and this ship's first seed has not come yet (hollow.ts counts every seed moment, also
// one with nowhere to land, so a full memory never holds SKIP for good). WP11: the same for LAST LIGHT's first verb (its
// coast is the stage for `> unlink repair.bak ... 4`; hollow-verbs.ts counts a turn HOLLOW skips as a moment too).
function firstSeedComing(state: Readonly<GameState>): boolean {
  const hollow = state.hollow;
  if (hollow.phase !== 'awake') return false;
  return (hollow.cfg.seed !== null && hollow.seedMoments === 0) || (hollow.cfg.verbs !== null && hollow.verbMoments === 0);
}

// HOLLOW sleeps, the coast has begun, and its wake is tied to the coast (ShipDef wake.coastLeadSec).
function hollowWaking(state: Readonly<GameState>): boolean {
  const wake = state.hollow.cfg.wake;
  if (state.hollow.phase !== 'asleep' || typeof wake === 'string' || wake.coastLeadSec === null) return false;
  return state.burn.coastAtAi !== null;
}

// Why SKIP can't run right now (the button shows it struck out), ignoring the "too close"
// rule, which only matters when a skip is requested. null = nothing in the way. A pause is
// not in here: it freezes a running skip instead of ending it (see mountPace).
function skipInhibitor(state: Readonly<GameState>, pred: Prediction): string | null {
  const base = skipInhibitorBase(state, pred);
  if (base !== null) return base;
  if (nextEvent(state, pred) === null) return 'NOTHING TO SKIP TO';
  return null;
}

// skipInhibitor without its last rule (nothing ahead): the fast-forward finds its own next stop.
function skipInhibitorBase(state: Readonly<GameState>, pred: Prediction): string | null {
  const landing = isLanding(state);
  if (!landing && state.burn.status !== 'approaching') return 'FLIGHT OVER';
  if (isBurnHeld(state) || isGhostFiring(state)) return 'ENGINE FIRING';
  if (!landing && pred.outcome === 'impact') return 'IMPACT COURSE';
  const alarm = state.alerts.list.find((alert) => alert.severity === 'alarm');
  if (alarm) return alarm.text;
  const blocker = state.alerts.list.find((alert) => alert.inhibitsSkip);
  if (blocker) return blocker.text;
  // The landing (§3.12): WINDOW OPEN and PODS IN FLIGHT. ACCEPT ORBIT's latch is the flight's (an accepted orbit lands).
  const landingRefusal = landing ? landingSkipInhibitor(state) : null;
  if (landingRefusal !== null) return landingRefusal;
  if (!landing && pred.acceptOnly) return SKIP_REFUSAL_STRANDED;
  // From the ship's first burst (the alarm moment, which a SKIP still lands on) while no Swap can stop the bursts.
  if (!landing && state.burn.ghostBursts > 0 && ghostRefusesSkip(state)) return SKIP_REFUSAL_ENGINE_FAULT;
  // A hazard zone is close or the ship is in it (WP9): the world runs TACTICAL there, and a SKIP would
  // only pretend to (it ends as the TACTICAL lead begins, earlier than §6.8's 15 s; see tuning.ts).
  const inside = zoneInside(state, pred);
  if (inside) return skipRefusalInZone(inside.kind);
  const close = zoneClose(state, pred);
  if (close) return skipRefusalZoneAhead(close.kind);
  // (A debris dodge still open is not an inhibitor: its deadline is the SKIP's next event, and the SKIP ends ahead of
  // it, so the world never skips through the choice; see nextEvent and skipBlockReason.)
  // A coast-tied wake (WP7, phase 2's HALCYON): the coast has begun and HOLLOW wakes within moments of it (its wake's coastLeadSec):
  // a SKIP now would carry the kid past the fight the coast is for.
  if (hollowWaking(state)) return SKIP_REFUSAL_WAKING;
  // KESTREL (seeds): HOLLOW is awake and its first seed is still to come. A kid who walls the first bites and SKIPs
  // to the capture met it mid-burn (DELETE's licence, `> sorry. i'm so hungry.` and the RM THE SEED lesson under
  // the shrink's NOW lines); held here, it lands on the coast as §5.1 tells it (then the seed's own alert, or none).
  // Not while an ACCEPTed DEAL holds HOLLOW's spread and seeds (WP12 p3, WP10 verify): SKIP sat struck out for the
  // whole 60 s pause, dead time with nothing coming; the first seed's clock waits at TACTICAL anyway (hollow.ts).
  if (firstSeedComing(state) && !spreadPaused(state.hollow, state.clock.aiSec)) return SKIP_REFUSAL_SEED_COMING;
  return null;
}

// The full refusal for a new SKIP request (null = allowed).
export function skipBlockReason(state: Readonly<GameState>, pred: Prediction): string | null {
  if ((state.burn.status === 'approaching' || isLanding(state)) && state.clock.paused) return 'PAUSED';
  const inhibitor = skipInhibitor(state, pred);
  if (inhibitor) return inhibitor;
  const event = nextEvent(state, pred);
  if (event === null) return 'NOTHING TO SKIP TO';
  if (event.inSec - endLeadTac(event) * state.level.tacticalWarp <= SKIP_MIN_JUMP_TAC * state.level.tacticalWarp) {
    if (event.kind === 'escape') return 'NOTHING TO SKIP TO';
    if (event.kind === 'dodge') return dodgeRefusal(state);
    if (event.kind === 'window') return LANDING_SKIP_REFUSAL.windowSoon;
    if (event.kind === 'zone' && isLanding(state)) {
      const zone = nextZoneEntry(state, pred);
      if (zone === null) throw new Error('skipBlockReason: a zone event with no zone ahead');
      return skipRefusalZoneAhead(zone.hit.kind);
    }
    return event.inSec <= 0 ? 'BURN NOW' : 'BURN COMING UP';
  }
  return null;
}

export type SkipResult = { ok: true } | { ok: false; reason: string };

// SKIP to the next event: warp = game seconds to it / SKIP_DIVISOR, at least CRUISE (predict.ts skipWarp).
// Fixed at request time so the fast-forward reads as one steady jump; the clock glides up to it, and its last
// tick lands on the end point (mountPace). Both come from a prediction of this very moment (currentPrediction):
// the end point only moves nearer, so one taken from an older refresh would stick.
export function requestSkip(store: Store<GameState>): SkipResult {
  const state = store.getState();
  if (state.clock.skipWarp !== null) return { ok: true };
  const pred = currentPrediction();
  const reason = skipBlockReason(state, pred) ?? (nextEvent(state, pred) === null ? 'NOTHING TO SKIP TO' : null);
  if (reason) {
    emit('refused', { reason });
    return { ok: false, reason };
  }
  const event = nextEvent(state, pred);
  if (event === null) throw new Error('requestSkip: no next event after skipBlockReason allowed the skip');
  const warp = skipWarp(event.inSec, state.level.cruiseWarp);
  store.update((draft) => { draft.clock.skipWarp = warp; });
  return { ok: true };
}

// A burn input pressed while a SKIP runs (SPACE, the BURN button, AUTOBURN's [B]) stops the SKIP. Whether it does
// anything else is the line's: SPACE and the BURN button burn only under a line that asks for SPACE
// (flight-controls.ts holdThrottle), and [B] cancels an armed AUTOBURN but engages nothing (autoburn.ts
// pressAutoburn). The lead's ruling for LEAD-2 review round 2 dropped every such press: a stray SPACE far out on a
// just-captured loop, under a WAIT, burned at once, and a 0.3 s RETRO tap there stranded a ship with most of its FUEL
// (obeying the lift line afterwards could end ESCAPED). The lead's ruling for review round 3 narrowed it to the lines
// that do not ask for the press, because a SKIP also runs under lines that do: the ▼ correction (TOO WIDE on HALCYON
// and KESTREL, with KESTREL's dodge countdown) and the SKIP to FLEW AWAY under `MISSED ▼ — hold [SPACE] NOW`. There a
// dropped press left the strip asking for SPACE over a held SPACE that burned nothing, until rack C was hit or the
// ship flew away. A dropped hold still down when the line starts asking for SPACE burns from then on (flight-controls.ts
// burnSkipStopHoldsWhenAsked).
// True when a SKIP was running (and is now stopped). The callers refuse a press while paused (pause is look-only)
// before they get here. The stop itself is stopSkip's; this name is kept as the presses' one entry point, where the
// rule above is written down (WP10: stopSkip also serves a later ghost burst that changed the plan).
// Playtest 1 (§3.1): under a held [F] the press also spends the hold (STOPPED), so the next tick does not start another leg
// over the kid's own controls; a fresh [F] goes on.
export function stopSkipOnPress(store: Store<GameState>): boolean {
  if (ff.held && ff.spent === null) spendHold(store, FF_TEXT.stopped);
  return stopSkip(store);
}

// Ends a running SKIP where the world stands (a press, or WP10: a later ghost burst that changed the plan). The next
// tick runs at the pace the moment calls for. false when no SKIP was running.
export function stopSkip(store: Store<GameState>): boolean {
  if (store.getState().clock.skipWarp === null) return false;
  store.update((draft) => {
    draft.clock.skipWarp = null;
    draft.clock.skipEndTSec = null;
    draft.clock.skipWaypoint = null;
  });
  return true;
}

function sameWaypoint(before: SkipWaypoint | null, after: SkipWaypoint | null): boolean {
  return before === after
    || (before !== null && after !== null && before.startTSec === after.startTSec && before.endTSec === after.endTSec);
}

// WP10: a later ghost burst a SKIP flew through left its plan as it was (systems/ghost-thrust.ts): the SKIP flies on
// to its target as the fresh prediction `pred` now times it. The end point is set anew (it may now lie later: the
// burst moved the path), unlike the 10 Hz re-plan, which only ever moves it nearer. A plain number: mutate.
export function replanSkip(store: Store<GameState>, pred: Prediction): void {
  const state = store.getState();
  if (state.clock.skipWarp === null) return;
  const toEnd = skipLandsInSec(state, pred);
  store.mutate((draft) => {
    draft.clock.skipEndTSec = toEnd === null ? null : draft.clock.tSec + toEnd;
    draft.clock.skipWaypoint = null;
  });
}

// P / ❚❚. Resuming is refused once the flight is over (the result banner owns the screen).
export function togglePause(store: Store<GameState>): boolean {
  const ok = setPaused(store, !store.getState().clock.paused);
  if (!ok) emit('refused', { reason: 'FLIGHT OVER' });
  return ok;
}

// The ?debug ladder's override (null hands the warp back to the director). Both the header
// ladder and window.__ap set it through here.
export function setDebugWarp(store: Store<GameState>, warp: number | null): void {
  if (warp !== null && !(warp >= 1 && warp <= DEBUG_WARP_MAX)) {
    throw new Error(`setDebugWarp: ${warp} is outside 1..${DEBUG_WARP_MAX}`);
  }
  if (store.getState().clock.debugWarp !== warp) store.update((draft) => { draft.clock.debugWarp = warp; });
}

// --- Hold [F]: the fast-forward (playtest 1, Fran's notes 6 and 24; docs/phase3/impl/playtest-1-plan.md §3.1) ------------
// The tap SKIP is gone from the kid's hands: [F] (or the header's ▸▸ HOLD, by pointer) is HELD, and while it is the world
// fast-forwards from stop to stop. Each leg is a SKIP (the engine above, unchanged: Kepler jumps, its ramp, its ease onto
// the end point) to the next stop's lead (endLeadTac). Every stop is one of:
// • HARD, a decision the kid has not made: the flight's planned burn (a missed ▼ until it is ignored), a debris dodge's
//   deadline, the first entry into each zone on this ship, flying away; in the landing a safety burn or one AUTOBURN is
//   engaged for, and the awaited window the kid's own hands fly; and, at any moment, an alarm or the first ghost burst.
//   The hold is SPENT there: the director's pace takes over, holding on does nothing, the button reads the stop
//   (`BURN AHEAD`, `LZ-B WINDOW`), and a fresh press goes on.
// • SOFT, a stop the kid may let pass: a ring trim, GO LOWER or the lift the landing offers (note 6), a later entry into a
//   zone already met on this ship (note 24). The world slows to TACTICAL at its lead for FF_SOFT_DWELL_SEC with the strip
//   naming it, and the hold goes on: a passed offer is declined (landing.declined, as letting it pass does), a passed
//   zone entry is remembered.
// • WAIT, a window an armed controller flies (AUTODROP, the sleeper, MERGE) and its next launch: the director's TACTICAL
//   plays it, the hold is not spent, and once it has gone by the hold goes on by itself (AUTODROP v3's gaps).
// CAPPED: inside a zone met on this ship or in its lead, while the engine-fault bursts are due, while the story waits on
// wall time (the first seed, a coast-tied wake) or while pods fall, the world runs pace 'fast': the normal tick integrator
// (never the Kepler jump) at a capped warp, so every hit, burst and line is played. In a zone the cap takes the rest of the
// pass FF_ZONE_PASS_WALL_SEC; otherwise it is CRUISE.
// Refused (the hold spent at once, the button struck out with the reason): the engine firing, an impact course, an alarm,
// the HOLD STEADY count, a hand window open, the flight or the landing over, ACCEPT ORBIT the only way on. PAUSED freezes
// the hold instead. Letting go returns to the director's pace at once.
// The state is this module's (reset with the world), not the clock's: the clock's keys are pinned in the save shape.

// The button's words where the hold ends or waits (the others are the SKIP's refusals above, none of which names SKIP).
export const FF_TEXT = {
  burn: 'BURN AHEAD',
  window: (lz: string): string => `${lz} WINDOW`,
  escape: 'FLYING AWAY',
  holdSteady: 'HOLD STEADY',
  nothing: 'NOTHING AHEAD',
  // The engine-fault bursts are due (ghostRefusesSkip): the hold runs at CRUISE at most, so on a coast it adds nothing.
  engineFault: 'ENGINE FAULT',
  // A burn input (SPACE, BURN, [B]) pressed under the hold: it ends the hold as it ends a SKIP.
  stopped: 'STOPPED',
} as const;

type StopWeight = 'hard' | 'soft' | 'wait';

interface Stop extends NextEvent {
  weight: StopWeight;
  key: string;             // what a passed soft stop is remembered by
  label: string;           // the button's word when the hold ends or waits there
  zoneId: string | null;   // a zone entry's zone
  offer: BurnPoint | null; // a landing offer: what passing it declines
}

interface PassedStop {
  key: string;
  atTSec: number;  // the game time the stop fell on
}

interface FastForward {
  held: boolean;
  spent: string | null;    // the stop or refusal that ended this hold (null: it goes on)
  leg: boolean;            // the running SKIP is this hold's leg (nextEvent is the fast-forward's)
  dwell: { stop: Stop; untilAi: number; atTSec: number } | null;
  passed: PassedStop[];    // soft stops passed on this ship
  met: Set<string>;        // zones entered (or stopped at) on this ship: their later entries are soft
  zoneCap: { zoneId: string; warp: number } | null;  // the capped warp of the zone pass under way, fixed at its start
  capWarp: number | null;  // this tick's 'fast' warp (null: not capped)
}

const ff: FastForward = {
  held: false, spent: null, leg: false, dwell: null, passed: [], met: new Set(), zoneCap: null, capWarp: null,
};

function resetFastForward(): void {
  ff.held = false;
  ff.spent = null;
  ff.leg = false;
  ff.dwell = null;
  ff.passed = [];
  ff.met.clear();
  ff.zoneCap = null;
  ff.capWarp = null;
  setFastForwardRamp(null);
}

function autoEngaged(state: Readonly<GameState>): boolean {
  const phase = state.burn.auto.phase;
  return phase === 'armed' || phase === 'pointing' || phase === 'burning';
}

function stopLeadSec(state: Readonly<GameState>, stop: NextEvent): number {
  return stop.inSec - endLeadTac(stop) * state.level.tacticalWarp;
}

// The stop is close enough to count as reached: a leg lands on its lead, and one shorter than a SKIP would be offered
// (SKIP_MIN_JUMP_TAC) is not worth a leg.
function stopReached(state: Readonly<GameState>, stop: NextEvent): boolean {
  return stopLeadSec(state, stop) <= SKIP_MIN_JUMP_TAC * state.level.tacticalWarp;
}

function zoneStops(state: Readonly<GameState>, pred: Prediction): Stop[] {
  const stops: Stop[] = [];
  for (const window of zoneWindows(state, pred)) {
    if (window.hit.spent || window.toEntry === null || window.toEntry <= 0 || isInside(window)) continue;
    const met = ff.met.has(window.hit.zoneId);
    stops.push({
      kind: 'zone', inSec: window.toEntry, weight: met ? 'soft' : 'hard', key: `zone|${window.hit.zoneId}`,
      label: skipRefusalZoneAhead(window.hit.kind), zoneId: window.hit.zoneId, offer: null,
    });
  }
  return stops;
}

function plainStop(kind: NextEvent['kind'], inSec: number, weight: StopWeight, label: string): Stop {
  return { kind, inSec, weight, key: kind, label, zoneId: null, offer: null };
}

// Every stop ahead, passed or not, and the escape (a stop only when nothing else is ahead).
function ffStops(state: Readonly<GameState>, pred: Prediction): { stops: Stop[]; escape: Stop | null } {
  const stops = zoneStops(state, pred);
  if (isLanding(state)) {
    const controller = activeLandingController(state) !== null;
    const toWindow = windowLaunchInSec(state);
    const lz = momentNow(state).target?.lz ?? 'LZ';
    if (toWindow !== null) stops.push(plainStop('window', toWindow, controller ? 'wait' : 'hard', FF_TEXT.window(lz)));
    const toLaunch = controllerLaunchInSec(state);
    if (toLaunch !== null) stops.push(plainStop('window', toLaunch, 'wait', FF_TEXT.window(lz)));
    const offer = landingBurnOffer(state, pred);
    const toBurnTac = offerInTac(state, pred);
    if (offer !== null && toBurnTac !== null) {
      const declinable = offer.reason !== 'capture' && offer.reason !== 'missed' && !autoEngaged(state);
      stops.push({
        kind: 'burn', inSec: toBurnTac * state.level.tacticalWarp, weight: declinable ? 'soft' : 'hard',
        key: `offer|${declineKey(offer)}`, label: FF_TEXT.burn, zoneId: null, offer,
      });
    }
  } else {
    const toBurn = isMissedBurnIgnored(state, pred) ? null : burnPointInSec(state, pred);
    if (toBurn !== null) stops.push(plainStop('burn', toBurn, 'hard', FF_TEXT.burn));
    const toDodge = dodgeDeadlineInSec(state, pred);
    if (toDodge !== null) stops.push(plainStop('dodge', toDodge, 'hard', dodgeRefusal(state)));
  }
  const escape = pred.escapeInSec === null ? null
    : plainStop('escape', secUntil(pred, pred.escapeInSec, state.clock.tSec), 'hard', FF_TEXT.escape);
  return { stops, escape };
}

function wasPassed(state: Readonly<GameState>, stop: Stop): boolean {
  const atTSec = state.clock.tSec + stop.inSec;
  const match = FF_PASSED_MATCH_TAC * state.level.tacticalWarp;
  return ff.passed.some((passed) => passed.key === stop.key && Math.abs(passed.atTSec - atTSec) <= match);
}

// The hold's next stop: the nearest one not passed, else the escape, else null (nothing ahead).
function ffNextStop(state: Readonly<GameState>, pred: Prediction): Stop | null {
  const { stops, escape } = ffStops(state, pred);
  let best: Stop | null = null;
  for (const stop of stops) {
    if (wasPassed(state, stop)) continue;
    if (best === null || stop.inSec < best.inSec) best = stop;
  }
  return best ?? escape;
}

// The 'fast' warp when the hold runs capped now, or null. A zone's warp is fixed when its pass starts (ff.zoneCap), so the
// rest of the pass takes FF_ZONE_PASS_WALL_SEC instead of an ever-shrinking share of it.
// `reason`: the first CRUISE cap's SKIP refusal (null when only a zone caps it).
interface FfCap {
  warp: number;
  zoneId: string | null;
  reason: string | null;
}

function ffCapWarp(state: Readonly<GameState>, pred: Prediction): FfCap | null {
  const { cruiseWarp } = state.level;
  let warp: number | null = null;
  let zoneId: string | null = null;
  let reason: string | null = null;
  const take = (candidate: number, why: string | null = null): void => {
    warp = warp === null ? candidate : Math.min(warp, candidate);
    reason ??= why;
  };
  const close = zoneClose(state, pred);
  if (close !== null && ff.met.has(close.zoneId)) {
    zoneId = close.zoneId;
    if (ff.zoneCap?.zoneId === close.zoneId) take(ff.zoneCap.warp);
    else {
      const toExit = zoneWindows(state, pred).find((window) => window.hit.zoneId === close.zoneId)?.toExit ?? null;
      take(Math.max(cruiseWarp, (toExit ?? 0) / FF_ZONE_PASS_WALL_SEC));
    }
  }
  const landing = isLanding(state);
  if (!landing && state.burn.ghostBursts > 0 && ghostRefusesSkip(state)) take(cruiseWarp, FF_TEXT.engineFault);
  if (firstSeedComing(state) && !spreadPaused(state.hollow, state.clock.aiSec)) take(cruiseWarp, SKIP_REFUSAL_SEED_COMING);
  if (hollowWaking(state)) take(cruiseWarp, SKIP_REFUSAL_WAKING);
  if (landing && podCounts(state).falling > 0) take(cruiseWarp, LANDING_SKIP_REFUSAL.podsInFlight);
  return warp === null ? null : { warp, zoneId, reason };
}

// A refusal under the hold: `spend` ends the hold there (false: it waits, and goes on once the refusal clears).
interface FfRefusal {
  reason: string;
  spend: boolean;
}

function ffRefusal(state: Readonly<GameState>, pred: Prediction): FfRefusal | null {
  const spend = (reason: string): FfRefusal => ({ reason, spend: true });
  const landing = isLanding(state);
  if (!isLivePhase(state)) return spend(landing ? LANDING_SKIP_REFUSAL.over : 'FLIGHT OVER');
  if (isBurnHeld(state)) return spend('ENGINE FIRING');
  // The first burst (the alarm moment) or a sticky one; a later one is flown through, as a SKIP flies it.
  const ghost = state.burn.ghost;
  if (ghost !== null && (ghost.sticky || ghostBurstsThisPhase(state) <= 1)) return spend('ENGINE FIRING');
  if (pred.outcome === 'impact' && (!landing || state.landing.ended === null)) return spend('IMPACT COURSE');
  const alarm = state.alerts.list.find((alert) => alert.severity === 'alarm');
  if (alarm) return spend(alarm.text);
  const blocker = state.alerts.list.find((alert) => alert.inhibitsSkip);
  if (blocker) return spend(blocker.text);
  if (landing) {
    if (state.landing.ended !== null) return podCounts(state).falling > 0 ? null : spend(LANDING_SKIP_REFUSAL.over);
    // The awaited window open: the kid's hands' (HARD, read as the stop it is: `LZ-A WINDOW`) or a controller's (WAIT).
    if (windowRuleHolds(state) && awaitedWindowOpen(state)) {
      const hands = activeLandingController(state) === null;
      return { reason: hands ? FF_TEXT.window(momentNow(state).open?.lz ?? 'LZ') : LANDING_SKIP_REFUSAL.windowOpen, spend: hands };
    }
    return null;
  }
  if (pred.acceptOnly) return spend(SKIP_REFUSAL_STRANDED);
  if (pred.fit.inRing || state.burn.lockHoldAiSec > 0) return spend(FF_TEXT.holdSteady);
  return null;
}

type FfDecision =
  | { kind: 'refused'; reason: string; spend: boolean }
  | { kind: 'reached'; stop: Stop }
  | { kind: 'capped'; warp: number; zoneId: string | null }
  | { kind: 'leg'; stop: Stop };

// What holding [F] does now (pure apart from reading the hold's memory: the zones met, the stops passed).
function ffDecide(state: Readonly<GameState>, pred: Prediction): FfDecision {
  const refusal = ffRefusal(state, pred);
  if (refusal !== null) return { kind: 'refused', ...refusal };
  const stop = ffNextStop(state, pred);
  if (stop !== null && stopReached(state, stop)) return { kind: 'reached', stop };
  const cap = ffCapWarp(state, pred);
  // A CRUISE cap (no zone) where the director runs CRUISE anyway makes nothing faster: the hold waits there (the
  // button struck out with the SKIP's reason, the strip offering no `hold [F]`), and goes on once the cap lifts.
  if (cap !== null && cap.zoneId === null && cap.reason !== null && choosePace(state, pred, false, TICK_MS / 1000) !== 'tactical') {
    return { kind: 'refused', reason: cap.reason, spend: false };
  }
  if (cap !== null) {
    // Ease onto the next stop's lead, as a SKIP eases onto its end point, rather than overshoot it by a tick.
    const toLead = stop === null ? Infinity : stopLeadSec(state, stop);
    const warp = Math.min(cap.warp, Math.max(state.level.tacticalWarp, toLead / SKIP_EASE_OUT_SEC));
    return { kind: 'capped', warp, zoneId: cap.zoneId };
  }
  if (stop === null) return { kind: 'refused', reason: FF_TEXT.nothing, spend: true };
  // A later ghost burst running between ticks (a twitch of a degraded Thrust Ctrl): wait it out, the leg follows.
  if (isGhostFiring(state)) return { kind: 'refused', reason: 'ENGINE FIRING', spend: false };
  const inhibitor = skipInhibitorBase(state, pred);
  if (inhibitor !== null) return { kind: 'refused', reason: inhibitor, spend: true };
  return { kind: 'leg', stop };
}

function stopLeg(store: Store<GameState>): void {
  if (!ff.leg) return;
  ff.leg = false;
  stopSkip(store);
}

// A zone entry the hold stopped at HARD is met, and this entry counts as passed: a fresh press runs through it capped,
// with no soft dwell on top of the stop.
function meetZone(state: Readonly<GameState>, stop: Stop | null): void {
  if (stop?.zoneId == null) return;
  ff.met.add(stop.zoneId);
  ff.passed.push({ key: stop.key, atTSec: state.clock.tSec + stop.inSec });
}

function spendHold(store: Store<GameState>, reason: string, stop: Stop | null = null): void {
  ff.spent = reason;
  ff.dwell = null;
  ff.capWarp = null;
  ff.zoneCap = null;
  meetZone(store.getState(), stop);
  stopLeg(store);
}

// A soft stop the hold dwelt at goes by: an offer is declined (landing.ts declineTick's record, so neither pace nor the
// strip leads to it again until a launch or a new reason), anything else is remembered for this ship.
function passStop(store: Store<GameState>, stop: Stop, atTSec: number): void {
  const offer = stop.offer;
  if (offer === null) {
    ff.passed.push({ key: stop.key, atTSec });
    return;
  }
  const now = landingBurnOffer(store.getState(), getPrediction());
  if (now === null || declineKey(now) !== declineKey(offer)) return;
  const untilLz = offer.reason === 'go-low' ? offer.aimLz ?? null : null;
  store.update((draft) => { draft.landing.declined = { key: declineKey(offer), untilLz }; });
}

function startLeg(store: Store<GameState>): void {
  const state = store.getState();
  // A leg's warp and end point come from a prediction of this very moment, as requestSkip's do.
  const pred = currentPrediction();
  const stop = ffNextStop(state, pred);
  if (stop === null || stopReached(state, stop)) return;
  const warp = Math.max(state.level.cruiseWarp, stopLeadSec(state, stop) / FF_LEG_WALL_SEC);
  ff.leg = true;
  store.update((draft) => { draft.clock.skipWarp = warp; });
}

// The hold's part of the pre-tick, ahead of the SKIP's own upkeep (mountPace).
function fastForwardTick(store: Store<GameState>): void {
  const state = store.getState();
  const pred = getPrediction();
  ff.capWarp = null;
  if (ff.leg && state.clock.skipWarp === null) ff.leg = false;
  if (isLivePhase(state)) {
    const inside = zoneInside(state, pred);
    if (inside !== null) ff.met.add(inside.zoneId);
  }
  setFastForwardRamp(ff.held && ff.spent === null ? FF_DECADE_SEC : null);
  if (!ff.held || ff.spent !== null) return;
  if (state.clock.paused || !isActivePhase(state.run.phase)) return;
  const forget = state.clock.tSec - FF_PASSED_MATCH_TAC * state.level.tacticalWarp;
  if (ff.passed.some((passed) => passed.atTSec < forget)) ff.passed = ff.passed.filter((passed) => passed.atTSec >= forget);
  if (ff.dwell !== null) {
    if (state.clock.aiSec < ff.dwell.untilAi) return;
    const { stop, atTSec } = ff.dwell;
    ff.dwell = null;
    passStop(store, stop, atTSec);
  }
  // A leg runs until the SKIP's own upkeep lands it on its stop's lead or ends it (an inhibitor, a press): its end point
  // only moves nearer, and the next tick decides again from where it stopped.
  if (ff.leg) return;
  const now = store.getState();
  const decision = ffDecide(now, getPrediction());
  if (decision.kind !== 'capped') ff.zoneCap = null;
  switch (decision.kind) {
    case 'refused':
      if (decision.spend) spendHold(store, decision.reason);
      else stopLeg(store);
      return;
    case 'reached': {
      const { stop } = decision;
      if (stop.weight === 'hard') spendHold(store, stop.label, stop);
      else {
        stopLeg(store);
        if (stop.weight === 'soft') ff.dwell = { stop, untilAi: now.clock.aiSec + FF_SOFT_DWELL_SEC, atTSec: now.clock.tSec + stop.inSec };
      }
      return;
    }
    case 'capped':
      stopLeg(store);
      if (decision.zoneId !== null && ff.zoneCap?.zoneId !== decision.zoneId) ff.zoneCap = { zoneId: decision.zoneId, warp: decision.warp };
      ff.capWarp = decision.warp;
      return;
    case 'leg':
      // A SKIP a controller asked for (between AUTODROP's passes) runs on as it is; the hold waits for it.
      if (now.clock.skipWarp === null) startLeg(store);
      return;
  }
}

// The pace the hold sets this tick, or null for the director's: TACTICAL while it dwells at a soft stop, FAST while capped.
function fastForwardPace(): Pace | null {
  if (!ff.held || ff.spent !== null) return null;
  if (ff.dwell !== null) return 'tactical';
  if (ff.capWarp !== null) return 'fast';
  return null;
}

// [F] down (or the ▸▸ HOLD button pressed). Refused at once with the reason when holding can do nothing (the hold is then
// spent, so the button reads it while held); PAUSED keeps the hold, frozen, as a pause freezes a SKIP.
export function startFastForward(store: Store<GameState>): SkipResult {
  ff.held = true;
  ff.spent = null;
  ff.dwell = null;
  const state = store.getState();
  if (isLivePhase(state) && state.clock.paused) {
    emit('refused', { reason: 'PAUSED' });
    return { ok: false, reason: 'PAUSED' };
  }
  const decision = ffDecide(state, currentPrediction());
  let reason: string | null = null;
  if (decision.kind === 'refused' && decision.spend) reason = decision.reason;
  if (decision.kind === 'reached' && decision.stop.weight === 'hard') reason = decision.stop.label;
  if (reason === null) return { ok: true };
  ff.spent = reason;
  if (decision.kind === 'reached') meetZone(state, decision.stop);
  emit('refused', { reason });
  return { ok: false, reason };
}

// [F] up: the director's pace at once (the next tick). The stops passed and the zones met stay for this ship.
export function endFastForward(store: Store<GameState>): void {
  ff.held = false;
  ff.spent = null;
  ff.dwell = null;
  ff.capWarp = null;
  ff.zoneCap = null;
  stopLeg(store);
}

export interface FastForwardView {
  held: boolean;          // [F] or the button is down
  running: boolean;       // ...and the world is fast-forwarding on it (a leg, a dwell or capped)
  spent: string | null;   // ...or the hold ended at this stop
}

export function fastForwardView(): FastForwardView {
  const live = ff.held && ff.spent === null;
  return { held: ff.held, running: live && (ff.leg || ff.dwell !== null || ff.capWarp !== null), spent: ff.held ? ff.spent : null };
}

// Why holding [F] would do nothing now (null: it would fast-forward): the header button's struck-out reason and the
// strip's `hold [F]` tails. A hold already running answers null; a spent one, its stop.
export function fastForwardBlockReason(state: Readonly<GameState>, pred: Prediction): string | null {
  if (isLivePhase(state) && state.clock.paused) return 'PAUSED';
  if (ff.held && ff.spent !== null) return ff.spent;
  if (ff.held && (ff.leg || ff.dwell !== null || ff.capWarp !== null)) return null;
  const decision = ffDecide(state, pred);
  if (decision.kind === 'refused') return decision.reason;
  if (decision.kind === 'reached') return decision.stop.weight === 'soft' ? null : decision.stop.label;
  return null;
}

export type CountdownKind = 'impact' | 'burn' | 'peri' | 'apo';

export interface Countdown {
  kind: CountdownKind;
  gameSec: number;
  tacSec: number;
}

// The planned burn is being finished, or is due with its apsis here or behind (a shrink, a missed
// ▼, a late trim): the loop is about to change under it, so the time to the next pass of ▼ or ▲
// would only race. The header, the plot's ▼/▲ labels and Telemetry show no time then.
export function burnUnderWay(state: Readonly<GameState>, pred: Prediction): boolean {
  const burnPoint = pred.burnPoint;
  if (!burnPoint) return false;
  if (isFinishingBurn(burnPoint, state.burn.firing, state.burn.sasMode)) return true;
  const now = state.clock.tSec;
  return secUntil(pred, burnPoint.inSec, now) <= 0
    && (burnPoint.event === 'now' || secUntil(pred, burnPoint.eventInSec, now) <= 0);
}

// No time to the next ▼ or ▲ pass (the plot's labels, Telemetry, the strip's upcoming events) while a burn
// is under way, or once ACCEPT ORBIT is the only way on (Prediction.acceptOnly): there the next ▼ is up to
// 35,364 tactical minutes away and no burn there can still be flown, so its countdown beside the red
// STRANDED ACCEPT only invited a brake that can't save the ship (LEAD-1 review round 2).
export function apsisTimesHidden(state: Readonly<GameState>, pred: Prediction): boolean {
  return pred.acceptOnly || burnUnderWay(state, pred);
}

// The header's main countdown:
// • IMPACT if the path ends on the surface;
// • else the START BURN tick while it is still ahead;
// • once that burn is due, the apsis it is centred on while that is still ahead (the capture
//   counts down to ▼), and nothing once the burn is under way (see burnUnderWay);
// • with no burn planned (in the ring, empty tank), the next ▼, else ▲.
// null when nothing is ahead (an open path past ▼, or the flight is over), and once ACCEPT ORBIT is the
// only way on (Prediction.acceptOnly: no `BRAKE IN 35364:26` toward a burn that was dropped).
export function mainCountdown(state: Readonly<GameState>, pred: Prediction): Countdown | null {
  if (state.burn.status !== 'approaching' || pred.acceptOnly) return null;
  const now = state.clock.tSec;
  const warp = state.level.tacticalWarp;
  const pick = (kind: CountdownKind, eventInSec: number): Countdown => {
    const gameSec = Math.max(0, secUntil(pred, eventInSec, now));
    return { kind, gameSec, tacSec: tac(gameSec, warp) };
  };
  if (pred.impactInSec !== null) return pick('impact', pred.impactInSec);
  const burnPoint = pred.burnPoint;
  if (burnPoint) {
    if (burnUnderWay(state, pred)) return null;
    if (secUntil(pred, burnPoint.inSec, now) > 0) return pick('burn', burnPoint.inSec);
    return pick(burnPoint.event === 'apo' ? 'apo' : 'peri', burnPoint.eventInSec);
  }
  if (pred.periInSec !== null) return pick('peri', pred.periInSec);
  if (pred.apoInSec !== null) return pick('apo', pred.apoInSec);
  return null;
}

let mounted = false;

export function mountPace(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountPace: already mounted');
  mounted = true;
  const offPre = onPreTick((dtWall) => {
    // The held [F] first (§3.1): it may start or end a leg, decline an offer, or choose a capped warp for this tick.
    fastForwardTick(store);
    const state = store.getState();
    const pred = getPrediction();

    // SKIP lives until something inhibits it or it has landed on its end point (skipLandsInSec), which is
    // kept in clock.skipEndTSec: the clock never carries the world past it, so the last tick lands on it
    // exactly. With no warp ceiling one tick can be days of game time, so the old "end a tick early" was
    // no longer near enough. The end only ever moves nearer (a burst drawn or a zone found on the way):
    // the 10 Hz re-plan of the same coast must not chase its own rounding. A pause only freezes it
    // (§3.4: pause freezes both clocks), so it is re-checked once the world moves again.
    let skipWarp = state.clock.skipWarp;
    let skipEndTSec = skipWarp === null ? null : state.clock.skipEndTSec;
    let skipWaypoint: SkipWaypoint | null = skipWarp === null ? null : state.clock.skipWaypoint;
    if (skipWarp !== null && !state.clock.paused) {
      const toEnd = skipLandsInSec(state, pred);
      const landed = skipEndTSec !== null && state.clock.tSec >= skipEndTSec;
      if (landed || skipInhibitor(state, pred) !== null || toEnd === null || toEnd <= SKIP_LANDING_TOLERANCE_SEC) {
        skipWarp = null;
        skipEndTSec = null;
        skipWaypoint = null;
      } else {
        const endTSec = state.clock.tSec + toEnd;
        skipEndTSec = skipEndTSec === null ? endTSec : Math.min(skipEndTSec, endTSec);
        // WP10: a later ghost burst before the end point is flown through: the tick that reaches it lands on its end.
        const burst = laterBurstWindow(state);
        skipWaypoint = burst !== null && burst.endTSec < skipEndTSec ? burst : null;
      }
    }

    if (ff.leg && skipWarp === null) ff.leg = false;
    const pace = fastForwardPace() ?? choosePace(state, pred, skipWarp !== null, dtWall);
    const running = !state.clock.paused && isActivePhase(state.run.phase);
    const overclock = running && isOverclocked(state, pace, pred);
    const target = running ? state.clock.debugWarp ?? warpFor(state.level, pace, skipWarp, overclock, ff.capWarp) : 0;

    if (pace !== state.clock.pace || target !== state.clock.speedTarget || skipWarp !== state.clock.skipWarp
        || overclock !== state.clock.overclock) {
      store.update((draft) => {
        draft.clock.pace = pace;
        draft.clock.speedTarget = target;
        draft.clock.skipWarp = skipWarp;
        draft.clock.skipEndTSec = skipEndTSec;
        draft.clock.skipWaypoint = skipWaypoint;
        draft.clock.overclock = overclock;
      });
    } else if (skipEndTSec !== state.clock.skipEndTSec || !sameWaypoint(skipWaypoint, state.clock.skipWaypoint)) {
      // Numbers the clock reads each tick, not a discrete change: no fan-out.
      store.mutate((draft) => {
        draft.clock.skipEndTSec = skipEndTSec;
        draft.clock.skipWaypoint = skipWaypoint;
      });
    }
  });
  const offReset = onWorldReset('pace-ff', resetFastForward, () => ({
    held: ff.held, spent: ff.spent, leg: ff.leg, dwell: ff.dwell !== null, passed: ff.passed.length, met: ff.met.size,
    zoneCap: ff.zoneCap, capWarp: ff.capWarp,
  }));
  return () => { offPre(); offReset(); resetFastForward(); mounted = false; };
}

export interface TimeKeyHooks {
  onSkipRefused?: (reason: string) => void;  // the header flashes the struck-out button
}

// P pauses/resumes; F is held to fast-forward (playtest 1, §3.1): down starts the hold, up ends it. Registered by the header
// time controls (and directly by headless harnesses; their scripted kids tap the SKIP engine itself, requestSkip).
export function registerTimeKeys(store: Store<GameState>, hooks: TimeKeyHooks = {}): () => void {
  const offPause = registerKeys({ layer: 'game', codes: ['KeyP'], onDown: () => { togglePause(store); } });
  const offHold = registerKeys({
    layer: 'game',
    codes: ['KeyF'],
    onDown: () => {
      const result = startFastForward(store);
      if (!result.ok) hooks.onSkipRefused?.(result.reason);
    },
    onUp: () => { endFastForward(store); },
  });
  return () => { offPause(); offHold(); };
}
