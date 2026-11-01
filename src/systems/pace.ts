import type { Store } from '@state/store';
import type { GameState, Pace, LevelState, SkipWaypoint } from '@state/schema';
import { onPreTick, isActivePhase, setPaused } from '@systems/clock';
import { isBurnHeld, isGhostFiring, ghostDueInSec, laterBurstWindow } from '@systems/orbit-sim';
import { getPrediction, currentPrediction, secUntil, isFinishingBurn, skipWarp, type Prediction, type ZoneHit } from '@systems/predict';
import { ZONE_WORD } from '@data/zone-text';
import { ghostBurstsThisPhase, spreadPaused } from '@state/selectors';
import { capabilitiesNow } from '@systems/capabilities';
import { registerKeys } from '@systems/input';
import { emit } from '@systems/events';
import { getDropSolution } from '@systems/drop-cache';
import { landingMoment, podCounts, type LandingMoment } from '@systems/landing-rules';
import { windowRuleHolds } from '@systems/landing-controller';
import { offerInTac } from '@systems/landing-orbit';
import type { DropSolution } from '@/types/landing';
import { LANDING_SKIP_REFUSAL } from '@data/landing-text';
import {
  TICK_MS, TACTICAL_LEAD_BURN_TAC, SKIP_END_LEAD_TAC, SKIP_MIN_JUMP_TAC, SKIP_LANDING_TOLERANCE_SEC, DEBUG_WARP_MAX,
  OVERCLOCK_FACTOR, IGNORED_NOW_TAC, ZONE_TACTICAL_LEAD_TAC, DODGE_TACTICAL_LEAD_TAC, WINDOW_TACTICAL_LEAD_TAC,
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
  if (windowRuleHolds()) {
    if (awaitedWindowOpen(state)) return 'tactical';
    const toWindow = windowLaunchInSec(state);
    if (toWindow !== null && tac(toWindow - tickAheadSec, state.level.tacticalWarp) <= WINDOW_TACTICAL_LEAD_TAC) return 'tactical';
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
  if (windowRuleHolds() && awaitedWindowOpen(state)) return LANDING_SKIP_REFUSAL.windowOpen;
  if (falling) return LANDING_SKIP_REFUSAL.podsInFlight;
  return null;
}

function nextEvent(state: Readonly<GameState>, pred: Prediction): NextEvent | null {
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
  const ghostInSec = ghostBurstsThisPhase(state) === 0 ? ghostDueInSec(state) : null;
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

function warpFor(level: LevelState, pace: Pace, skipWarp: number | null, overclock: boolean): number {
  if (pace === 'tactical') return overclock ? level.tacticalWarp * OVERCLOCK_FACTOR : level.tacticalWarp;
  if (pace === 'cruise') return level.cruiseWarp;
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
  if (nextEvent(state, pred) === null) return 'NOTHING TO SKIP TO';
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
export function stopSkipOnPress(store: Store<GameState>): boolean {
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

    const pace = choosePace(state, pred, skipWarp !== null, dtWall);
    const running = !state.clock.paused && isActivePhase(state.run.phase);
    const overclock = running && isOverclocked(state, pace, pred);
    const target = running ? state.clock.debugWarp ?? warpFor(state.level, pace, skipWarp, overclock) : 0;

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
  return () => { offPre(); mounted = false; };
}

export interface TimeKeyHooks {
  onSkipRefused?: (reason: string) => void;  // the header flashes the struck-out SKIP button
}

// P pauses/resumes, F requests SKIP. Registered by the header time controls (and directly
// by headless harnesses).
export function registerTimeKeys(store: Store<GameState>, hooks: TimeKeyHooks = {}): () => void {
  const offPause = registerKeys({ layer: 'game', codes: ['KeyP'], onDown: () => { togglePause(store); } });
  const offSkip = registerKeys({
    layer: 'game',
    codes: ['KeyF'],
    onDown: () => {
      const result = requestSkip(store);
      if (!result.ok) hooks.onSkipRefused?.(result.reason);
    },
  });
  return () => { offPause(); offSkip(); };
}
