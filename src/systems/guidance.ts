import type { GameState, BurnStatus, SasMode, PresetMode, Urgency, GuideLayer, AutoburnPhase, AutoburnEnd } from '@state/schema';
import type { Ring } from '@/types/orbit';
import { isThrustOn } from '@systems/orbit-sim';
import {
  capabilitiesNow, engineFault, plotFault, presetsAvailable, ROLE_LABEL,
  type CapabilityRole, type EngineFault, type PlotFault, type Capabilities,
} from '@systems/capabilities';
import {
  secUntil, sweetZone, isFinishingBurn, burnKey, rpRateUnderThrust,
  type Prediction, type PredictOutcome, type BurnPoint, type TrimReason,
} from '@systems/predict';
import { skipBlockReason } from '@systems/pace';
import { spareFor } from '@systems/tool-targets';
import { isUsableTool, toolFilesOf } from '@state/selectors';
import { autoburnAvailable, autoburnArmedInTac } from '@systems/autoburn';
import { AUTOBURN_TEXT } from '@data/skill-text';
import { debrisRack } from '@/types/zone';
import { IS_DEV } from '@/env';
import {
  EARLY_BURN_GUARD_TAC, LATE_CAPTURE_TAC, TACTICAL_LEAD_BURN_TAC, COUNTDOWN_RED_TAC,
  ACCEPT_IDLE_AI_SEC, OBJECTIVE_HYSTERESIS_SEC, MAX_LINE_CHARS, STRANDED_RANGE_FRAC, AUTOBURN_DONE_LINE_SEC,
  DODGE_WARN_TAC, RELEASE_LEAD_TAC,
} from '@data/tuning';

// Flight guidance: the objective that is never wrong (§6.3). flightObjective is a PURE
// function of the current (sensed) prediction, the burn state and the ship's capabilities;
// nothing is "advanced", so after any mistake the next evaluation simply names the right next
// step for the path as it is now. The first matching row wins. F1 (blind instruments) and F2
// (an engine that can't fire when a burn is needed) point into the MIND, where the fix is: from
// the ship they say [TAB]; in the mind the TAB is done, so they name the repair there (and the
// director lights the REPAIR chip, then the file).

// Urgency lives in the schema (the director stores the composed line); re-exported here so
// the flight table's callers keep importing it from guidance.
export type { Urgency };

export interface FlightObjective {
  id: string;           // stable per row and variant; the strip re-renders when id or text changes
  text: string;         // ≤ MAX_LINE_CHARS, kid words only
  keys: string[];       // key caps to draw next to the text
  urgency: Urgency;
  showAccept: boolean;  // the line suggests ACCEPT ORBIT
  // The screen whose controls fix it, when that is not the ship's (F1, F2: a file in the MIND).
  layer?: GuideLayer;
  // In the mind: the file whose REPAIR is the fix (the director lights the chip, then the file).
  repairs?: CapabilityRole;
  // The line's countdown is about to run out (the debris dodge's last DODGE_WARN_TAC): the strip turns the warning
  // colour (WP9 review round 2, the lead's ruling).
  warn?: boolean;
}

// Everything the table reads, already reduced to "now" and to tactical seconds.
export interface FlightContext {
  status: BurnStatus;
  outcome: PredictOutcome;
  rp: number;
  // km per tactical second ▼ moves under the thrust delivered now (+ raises it; 0 with no thrust): F6's early RELEASE.
  rpRateTac: number;
  inRing: boolean;
  outbound: boolean;
  liftPreset: PresetMode | null;  // on an impact course, the preset that lifts ▼ out of the planet (F4)
  ring: Ring;
  sweetLo: number;
  sweetHi: number;
  sasMode: SasMode;
  firing: boolean;            // the throttle is held (by the player or AUTOBURN)
  firingFor: string | null;   // the planned burn (burnKey) the throttle was pressed for
  thrustOn: boolean;          // thrust is actually being delivered
  outOfFuel: boolean;         // the tank is dry: no burn can happen any more
  fuelShort: boolean;         // the FUEL left is less than the next burn needs (Prediction.fuelShort)
  acceptOnly: boolean;        // ACCEPT ORBIT is the only way on (predict.ts, the lead's Rule 4; latched)
  strandedAnyway: boolean;    // ...and that ACCEPT strands the ship: no burn the FUEL left can make reaches the printers
  cannotClose: boolean;       // a flyby the tank can no longer catch, even at ▼ (WP1-rules 3b)
  presetsAvailable: boolean;  // false when the Autopilot file is failing or worse → Q/E hints
  plotFault: PlotFault | null;      // why the NAV PLOT can't show the path, or null (Sensor Interp, Nav Plotter)
  engineFault: EngineFault | null;  // why the engine can't fire at all, or null (Engine I/O, Thrust Ctrl)
  // WP10 review: with no Thrust Ctrl left, the backup a SWAP would put into service (its name), while SWAP is licensed
  // and a Swap file is still in memory; `swapReady`: that file is usable (WP12 p3: else it needs a REPAIR first).
  spareController: { name: string; swapReady: boolean } | null;
  inMind: boolean;                  // the kid is looking at the MIND, where F1/F2's fix is
  skipAvailable: boolean;     // pressing F now would start a SKIP
  // inTac: tactical s to START BURN; burnTac: tactical s of burning the planned burn still takes.
  burnPoint: (BurnPoint & { inTac: number; burnTac: number }) | null;
  periTac: number | null;
  showAccept: boolean;        // suggest ACCEPT ORBIT (offered, and it would not strand the ship)
  // WP9: a debris cloud the (sensed) path will enter while the ▼ correction applies, and the instruments can tell:
  // its rack, and the tactical seconds left to start the correction that still dodges it (TOO WIDE counts them
  // down), or null once it no longer would (TOO WIDE says it is too late); null with no such cloud.
  debris: { rack: string; dodgeInTac: number | null } | null;
  // WP9, AUTOBURN (§6.10): its phase, AI seconds since that phase began, tactical seconds until it fires (the
  // armed countdown), and why its last engagement ended; `autoAvailable`: [B] would engage it now.
  autoburn: { phase: AutoburnPhase; sinceSec: number; armedInTac: number; end: AutoburnEnd | null };
  autoAvailable: boolean;
}

// The key and the kid word for each preset. The HUD buttons, the key bindings and the hint
// text all derive from these, so the strip can never name a key that does something else.
export const PRESET_KEY: Record<PresetMode, string> = {
  prograde: 'W', retrograde: 'S', 'radial-in': 'A', 'radial-out': 'D',
};
export const PRESET_NAME: Record<PresetMode, string> = {
  prograde: 'PRO', retrograde: 'RETRO', 'radial-in': 'IN', 'radial-out': 'OUT',
};

// ACCEPT ORBIT (§6.2): only on a closed loop that is not green (and not falling into the
// planet), and only once fuel can't pay for the fix, the kid has idled on it for a while, or it
// is the only way on (Rule 4).
export function canAccept(state: Readonly<GameState>, pred: Prediction): boolean {
  return state.burn.status === 'approaching'
    && pred.outcome === 'closed'
    && !pred.fit.inRing
    && (pred.acceptOnly || state.burn.fuelPct < pred.neededPct || state.burn.closedIdleAiSec >= ACCEPT_IDLE_AI_SEC);
}

// Accepting this loop would strand the ship: the printers could not reach it (§4.3).
export function acceptStrands(pred: Prediction): boolean {
  return pred.greenFraction < STRANDED_RANGE_FRAC;
}

// The backup a SWAP could put into service for a lost Thrust Ctrl, and whether the Swap file can do it now (WP12 p3, WP10
// verify: the strip asked for `SWAP in Thrust.alt` with the Swap file eaten). No Swap file at all: nothing to name.
function spareControllerOf(state: Readonly<GameState>): FlightContext['spareController'] {
  if (!state.run.licences.includes('swap')) return null;
  const spare = spareFor(state, 'thrust-ctrl');
  const swapFiles = toolFilesOf(state.memory, 'swap');
  if (spare === null || swapFiles.length === 0) return null;
  return { name: spare.name, swapReady: swapFiles.some(isUsableTool) };
}

export function buildFlightContext(state: Readonly<GameState>, pred: Prediction): FlightContext {
  const now = state.clock.tSec;
  const warp = state.level.tacticalWarp;
  const sweet = sweetZone(state.level.ring);
  const burnPoint = pred.burnPoint;
  const caps = capabilitiesNow(state);
  return {
    status: state.burn.status,
    outcome: pred.outcome,
    rp: pred.rp,
    rpRateTac: rpRateUnderThrust(state) * warp,
    inRing: pred.fit.inRing,
    outbound: pred.outbound,
    liftPreset: pred.liftPreset,
    ring: state.level.ring,
    sweetLo: sweet.lo,
    sweetHi: sweet.hi,
    sasMode: state.burn.sasMode,
    firing: state.burn.firing,
    firingFor: state.burn.firingFor,
    thrustOn: isThrustOn(state),
    outOfFuel: state.burn.fuelPct <= 0,
    fuelShort: pred.fuelShort,
    acceptOnly: pred.acceptOnly,
    strandedAnyway: pred.strandedAnyway,
    cannotClose: pred.cannotClose,
    presetsAvailable: presetsAvailable(caps),
    plotFault: plotFault(caps),
    engineFault: engineFault(caps),
    spareController: spareControllerOf(state),
    inMind: state.ui.mode === 'memory',
    skipAvailable: state.clock.skipWarp === null && skipBlockReason(state, pred) === null,
    burnPoint: burnPoint ? { ...burnPoint, inTac: secUntil(pred, burnPoint.inSec, now) / warp, burnTac: burnPoint.estBurnSec / warp } : null,
    periTac: pred.periInSec === null ? null : secUntil(pred, pred.periInSec, now) / warp,
    // Never point the kid at an ACCEPT that strands the ship while a burn can still save it; the button
    // says STRANDED itself. When nothing is left but ACCEPT (acceptOnly), F11 names it anyway (LEAD-1).
    showAccept: canAccept(state, pred) && !acceptStrands(pred),
    debris: debrisAheadOf(pred, caps.plot.mode, now, warp),
    autoburn: {
      phase: state.burn.auto.phase,
      sinceSec: state.clock.aiSec - state.burn.auto.atAi,
      armedInTac: autoburnArmedInTac(state, pred),
      end: state.burn.auto.end,
    },
    autoAvailable: autoburnAvailable(state, pred),
  };
}

// A debris cloud the path enters while the ▼ correction applies (predict.ts debrisDodge), while the plot can say so
// (not under PATH UNCERTAIN or NO SIGNAL): how long the correction still dodges it, or null once it no longer
// would. The dodge was the early correction's: the countdown says how early, and when it runs out the line says so.
function debrisAheadOf(pred: Prediction, mode: Capabilities['plot']['mode'], now: number, warp: number): FlightContext['debris'] {
  if (mode !== 'exact' && mode !== 'approx') return null;
  const hit = pred.zoneHits.find((zone) => zone.kind === 'debris' && zone.correctionClears !== null);
  if (!hit) return null;
  const dodgeInTac = hit.correctionClears === true && hit.dodgeInSec !== null ? Math.max(0, secUntil(pred, hit.dodgeInSec, now) / warp) : null;
  return { rack: debrisRack(hit), dodgeInTac };
}

// Countdown text, rounded up so the display reaches 0:00 exactly when the moment arrives.
// The strip uses m:ss; the countdown displays pass padMinutes for MM:SS.
export function formatTac(tacSec: number, padMinutes = false): string {
  const whole = Math.max(0, Math.ceil(tacSec));
  const minutes = String(Math.floor(whole / 60));
  const seconds = String(whole % 60).padStart(2, '0');
  return `${padMinutes ? minutes.padStart(2, '0') : minutes}:${seconds}`;
}

interface Hint { text: string; keys: string[] }

function pressPreset(mode: PresetMode, ctx: FlightContext): Hint {
  return ctx.presetsAvailable
    ? { text: `press [${PRESET_KEY[mode]}] (${PRESET_NAME[mode]})`, keys: [PRESET_KEY[mode]] }
    : { text: `turn to ${PRESET_NAME[mode]} with [Q]/[E]`, keys: ['Q', 'E'] };
}

function make(id: string, text: string, keys: string[], urgency: Urgency, ctx: FlightContext): FlightObjective {
  return { id, text, keys, urgency, showAccept: ctx.showAccept };
}

// "Fix it with preset X, hold SPACE": the hold-to-fix rows (impact, too low, too wide, missed,
// a trim that is due now).
function fixWith(
  id: string, prefix: string, preset: PresetMode, urgency: Urgency, ctx: FlightContext, suffix = '',
): FlightObjective {
  if (ctx.sasMode === preset) return make(`${id}-hold`, `${prefix} — hold [SPACE]${suffix}`, ['SPACE'], urgency, ctx);
  const press = pressPreset(preset, ctx);
  return make(`${id}-press`, `${prefix} — ${press.text}, hold [SPACE]${suffix}`, [...press.keys, 'SPACE'], urgency, ctx);
}

// fixWith with a tail, and a shorter tail when the full one pushes the line past the strip (the Q/E wording).
function fixWithTail(
  id: string, prefix: string, preset: PresetMode, urgency: Urgency, ctx: FlightContext, tail: string, shortTail: string,
): FlightObjective {
  const full = fixWith(id, prefix, preset, urgency, ctx, tail);
  return full.text.length <= MAX_LINE_CHARS ? full : fixWith(id, prefix, preset, urgency, ctx, shortTail);
}

const EVENT_GLYPH = { peri: '▼', apo: '▲', now: '▼' } as const;
// F11 when ACCEPT ORBIT is the only way on (acceptOnly) and it strands the ship (strandedAnyway)...
export const STRANDED_LINE = 'NOT ENOUGH FUEL to reach the printers — ACCEPT ORBIT';
// ...and when that ACCEPT still reaches the printers (the lead's Rule 4 lists it first).
export const ACCEPT_ONLY_LINE = 'NOT ENOUGH FUEL to lock the orbit — ACCEPT ORBIT';
// F11 held for a trim the tank can't pay for in full: it runs to the empty tank (then ORBIT ACCEPTED), or, a band
// of about a FUEL point under the trim's price, into the ring after all, where the strip says RELEASE and the
// flight locks: the impulsive price runs 2.5–7.6% over what a flown burn spends (LEAD-2 review round 1). So the
// line is true for both endings rather than promise the empty tank. It must not contain RELEASE, the strip's word
// for letting go: `until RELEASE or the FUEL runs out` made a kid who reads for that word let go every other tick.
export const KEEP_TO_EMPTY_LINE = 'KEEP HOLDING — it may take all your FUEL';
const SKIP_HINT = ' · [F] SKIP';
// WP9: TOO WIDE with a debris cloud on the path: the same IN correction dodges it if it starts in time, and the
// line counts that time down, then says when it has run out (the lead's note: the kid must see that steering IN
// EARLY is what saves the rack). The short forms are for the Q/E wording (a damaged Autopilot).
const DODGE_IN = (time: string, rack: string): string => ` · ${time} to dodge DEBRIS ${rack}`;
const DODGE_IN_SHORT = (time: string): string => ` · ${time} to dodge`;
const DODGE_TOO_LATE = (rack: string): string => ` · too late to dodge DEBRIS ${rack}`;
const DODGE_TOO_LATE_SHORT = (rack: string): string => ` · DEBRIS ${rack} will hit`;
// F6-resume (WP9 review round 2): the kid let go of the correction in the ring before the path cleared the cloud,
// with its preset still selected. Holding on still dodges until the countdown runs out.
const DODGE_RESUME = 'NOT CLEAR YET — hold [SPACE]';

// A dodge line in its last seconds turns the warning colour (the lead's ruling).
function dodgeWarn(objective: FlightObjective, dodgeInTac: number): FlightObjective {
  return dodgeInTac <= DODGE_WARN_TAC ? { ...objective, warn: true } : objective;
}
const ACCEPT_HINT = ' · or ACCEPT ORBIT';
const LATE_CAPTURE_HINT = ' · brake anyway — trim it later';
// The same tails, shorter, for the lines the Q/E key hint (a damaged Autopilot) makes too long (withTail).
const ACCEPT_HINT_SHORT = ' · or ACCEPT';
const LATE_CAPTURE_HINT_SHORT = ' · brake anyway, trim later';

// A line with an optional tail, and a shorter tail for when the Q/E key hint (a damaged Autopilot,
// the longest wording of every "press" line) pushes the whole past the strip.
function withTail(head: string, tail: string, shortTail: string): string {
  return (head + tail).length <= MAX_LINE_CHARS ? head + tail : head + shortTail;
}

// "brake" for a RETRO burn at ▼ (a capture or shrinking the loop), "burn" otherwise. The
// header countdown chip uses the same word as the objective.
export function burnVerb(burnPoint: BurnPoint): string {
  return burnPoint.preset === 'retrograde' && burnPoint.event !== 'apo' ? 'brake' : 'burn';
}

// F11's "why" for each trim (also the plot chip's word for a loop the printers can't reach
// yet), and what the kid is doing while holding it.
export const TRIM_PROBLEM: Record<TrimReason, string> = {
  'rp-low': '▼ TOO LOW',
  'rp-high': '▼ TOO HIGH',
  'ra-high': 'LOOP TOO BIG',
  'ra-low': 'LOOP TOO SMALL',
};
const TRIM_PROGRESS: Record<TrimReason, string> = {
  'rp-low': 'lift ▼ into the ring',
  'rp-high': 'lower ▼ into the ring',
  'ra-high': 'shrink the loop into the ring',
  'ra-low': 'grow the loop into the ring',
};
// A trim at ▼ while ▼ itself is out of the ring too (both ends wrong, the ▼ burn came first): it
// fixes ▲ only, and the loop needs a second trim at ▲, so "into the ring" would be a promise.
const TRIM_PROGRESS_FIRST_OF_TWO: Record<'ra-high' | 'ra-low', string> = {
  'ra-high': 'shrink the loop',
  'ra-low': 'grow the loop',
};

function trimProgress(reason: TrimReason, burnPoint: BurnPoint): string {
  if (burnPoint.firstOfTwo && (reason === 'ra-high' || reason === 'ra-low')) return TRIM_PROGRESS_FIRST_OF_TWO[reason];
  return TRIM_PROGRESS[reason];
}

// The shared countdown to a burn: wait → get ready → now. A wait names SKIP while it is
// available, so a kid facing a long coast learns that F jumps it.
function burnTimeline(
  id: string, burnPoint: BurnPoint & { inTac: number }, ctx: FlightContext, waitSuffix: string,
): FlightObjective {
  const glyph = EVENT_GLYPH[burnPoint.event];
  const verb = burnVerb(burnPoint);
  if (burnPoint.inTac > TACTICAL_LEAD_BURN_TAC) {
    const skip = ctx.skipAvailable ? SKIP_HINT : '';
    return make(`${id}-wait`, `WAIT — ${verb} at ${glyph} in ${formatTac(burnPoint.inTac)}${waitSuffix}${skip}`,
      ctx.skipAvailable ? ['F'] : [], 'wait', ctx);
  }
  if (burnPoint.inTac > 0) {
    return make(`${id}-ready`, `GET READY — ${verb.toUpperCase()} IN ${formatTac(burnPoint.inTac)}`, [], 'now', ctx);
  }
  return make(`${id}-now`, 'HOLD [SPACE] NOW', ['SPACE'], 'now', ctx);
}

// The tank is dry: nothing the kid presses changes the path any more, so the strip says what
// will happen instead of asking for a burn (the sim ends a closed loop at once, §6.2).
function outOfFuelObjective(ctx: FlightContext): FlightObjective {
  if (ctx.outcome === 'impact') return make('NOFUEL-impact', 'OUT OF FUEL — the ship is going to hit the planet', [], 'now', ctx);
  if (ctx.outcome === 'open') return flyPast('NOFUEL-open', 'OUT OF FUEL', ctx);
  return make('NOFUEL-closed', 'OUT OF FUEL — this is the orbit you get', [], 'wait', ctx);
}

// A flyby that will fly away whatever the kid burns: say so, and offer SKIP to the end.
function flyPast(id: string, why: string, ctx: FlightContext): FlightObjective {
  return ctx.skipAvailable
    ? make(id, `${why} — the ship will fly past${SKIP_HINT}`, ['F'], 'wait', ctx)
    : make(id, `${why} — the ship will fly past`, [], 'wait', ctx);
}

// A line whose fix is a file in the MIND (F1, F2).
function mindLine(id: string, text: string, keys: string[], urgency: Urgency, ctx: FlightContext): FlightObjective {
  return { ...make(id, text, keys, urgency, ctx), layer: 'mind' };
}

// "REPAIR this file", from either screen: from the ship, `fromShip` says [TAB] first; in the mind
// the line names the repair itself, and the director lights the REPAIR chip, then the file.
function repairLine(
  id: string, problem: string, fromShip: string, role: CapabilityRole, urgency: Urgency, ctx: FlightContext,
): FlightObjective {
  if (!ctx.inMind) return mindLine(id, `${problem} — ${fromShip}`, ['TAB'], urgency, ctx);
  return { ...mindLine(id, `${problem} — REPAIR ${ROLE_LABEL[role]}`, [], urgency, ctx), repairs: role };
}

const PLOT_PROBLEM: Record<PlotFault['role'], { id: string; problem: string }> = {
  sensor: { id: 'F1-uncertain', problem: 'PATH UNCERTAIN' },
  navplot: { id: 'F1-nosignal', problem: 'NO SIGNAL' },
};

// F1: the instruments are blind, so no line about the path can be trusted: fix the file first.
// A repair or a move the kid started only needs waiting out (at the path's own urgency, like
// F2's). A missing file has nothing to repair: the plot's own NO X says what is gone, and the
// strip keeps flying the path the last reading shows.
function blindObjective(fault: PlotFault, base: FlightObjective, ctx: FlightContext): FlightObjective | null {
  const { id, problem } = PLOT_PROBLEM[fault.role];
  const file = ROLE_LABEL[fault.role];
  switch (fault.cause) {
    case 'hurt': return repairLine(id, problem, `[TAB], REPAIR ${file}`, fault.role, 'now', ctx);
    case 'repairing': return mindLine(`${id}-repairing`, `${problem} — ${file} IS REPAIRING…`, [], base.urgency, ctx);
    case 'moving': return mindLine(`${id}-moving`, `${problem} — ${file} IS MOVING…`, [], base.urgency, ctx);
    case 'missing': return null;
  }
}

// The rows that ask for no thrust (let go, hold steady, wait, nothing left to burn, ACCEPT is the
// only way on): an engine that can't fire changes nothing about them.
const NO_BURN_ROWS: ReadonlySet<string> = new Set([
  'F3', 'F3b', 'F5', 'F5-next', 'F6-release', 'F6-past', 'NOFUEL-impact', 'NOFUEL-open', 'NOFUEL-closed', 'LOWFUEL-open',
  'F11-stranded', 'F11-accept',
]);

// The rows whose instruction is to let go of SPACE (F3 RELEASE, F5 TOO EARLY and RELEASE — next, F6
// RELEASE): the one thing that ends a burn. Nothing else on the strip may stand in front of them
// (script.ts: HOLLOW's alarms yield to them), or a kid who chose to burn keeps burning past them.
const RELEASE_ROWS: ReadonlySet<string> = new Set(['F3', 'F5', 'F5-next', 'F6-release', 'F6-past']);

export function isReleaseRow(id: string): boolean {
  return RELEASE_ROWS.has(id);
}

// WP12 p3 (the lead's ruling 3 of 2026-10-21 06:20): once the strip says RELEASE, a line asking to keep holding
// takes over only after the hysteresis, though both are urgent. During a long hold the plan can sit on a
// boundary: a trim held past its apsis moves ▼ ahead of the ship, so its burn point flips between "due, finishing"
// (KEEP HOLDING) and "the next ▼, a few seconds ahead" (RELEASE — next: …) on every refresh, and the strip
// flickered between the two at 20 Hz. A real change back to holding still shows, OBJECTIVE_HYSTERESIS_SEC later.
// WP12 p3 (WP9 verify): the shown line counts a debris dodge down (TOO WIDE's `· 0:01 to dodge`, F6-resume's), and the
// flight's line is no longer that countdown: it lapsed (TOO LATE TO DODGE, often a 'soon' line) or was obeyed. The
// count is no longer true, so its replacement shows at once instead of `0:01 to dodge` standing under the stamp.
const DODGE_COUNTDOWN_ROWS: ReadonlySet<string> = new Set(['F8-debris-press', 'F8-debris-hold', 'F6-resume']);

export function dodgeCountdownEnds(shown: { id: string }, candidate: { id: string }): boolean {
  return DODGE_COUNTDOWN_ROWS.has(shown.id) && !DODGE_COUNTDOWN_ROWS.has(candidate.id);
}

// WP12 review: the same flip reaches the strip as RELEASE ⇄ ALARM while HOLLOW's alarm is live, because an alarm gives
// way to a RELEASE row (script.ts alarmLive reads the flight's unfiltered line): its candidate asks for TAB, not SPACE,
// and both are urgent, so it flickered just the same. An alarm (`source` 'alarm') waits out the hysteresis too.
export function releaseHolds(
  shown: { id: string; keys: readonly string[] }, candidate: { id: string; keys: readonly string[]; source?: string },
): boolean {
  if (!isReleaseRow(shown.id) || isReleaseRow(candidate.id)) return false;
  return candidate.keys.includes('SPACE') || candidate.source === 'alarm';
}

// The line asks the kid to press and hold SPACE: it names SPACE and is not a RELEASE row (a burn line, `HOLD [SPACE]
// NOW`, NOT CLEAR YET). A SPACE pressed during a SKIP burns only under such a line, and a hold kept down from before goes
// live only under one (flight-controls.ts holdThrottle, LEAD-2 review round 3). AUTOBURN's `[SPACE] takes over` is an
// offer, not an ask (WP10, the lead's ruling): its row carries no SPACE key (autoburnObjective), so a hold the kid made
// only to stop a SKIP never takes the burn away from AUTOBURN; a fresh press still takes the ship (flight-controls).
export function asksToHoldSpace(objective: FlightObjective): boolean {
  return objective.keys.includes('SPACE') && !isReleaseRow(objective.id);
}

// The rows of the ▼ correction: F7/F8 asking for it (every wording, with or without the debris tail) and F6 while
// it runs. The rows that steer by ▼'s reading (beforeBlind), and the debris MOVE-out line waits for them to end
// (script.ts: while the strip still asks for the correction, it is the way to save the rack).
const CORRECTION_ROWS: ReadonlySet<string> = new Set([
  'F6-keep', 'F6-dodge', 'F6-release', 'F6-past', 'F6-resume',
  ...['F7', 'F8', 'F8-debris', 'F8-debris-late'].flatMap((row) => [`${row}-hold`, `${row}-press`]),
]);

export function isCorrectionRow(id: string): boolean {
  return CORRECTION_ROWS.has(id);
}

// F2: the flight still needs a burn and the engine can't fire. Says why, and where the fix is: a
// repair or a move that took the driver offline only needs waiting out (at the path's own
// urgency). A dead or missing engine is urgent when the burn is (now or soon), and stays on the
// strip even ahead of a WAIT: with no engine, waiting (or SKIPping) toward the burn only wastes
// the time to fix it, and a dead engine also takes the shrink away (predict.ts), which turns
// "SHRINK THE LOOP" into a WAIT of days.
function engineObjective(fault: EngineFault, base: FlightObjective, ctx: FlightContext): FlightObjective {
  const pressing: Urgency = base.urgency === 'wait' ? 'soon' : 'now';
  switch (fault) {
    case 'repairing': return mindLine('F2-repairing', 'ENGINE OFFLINE — ENGINE I/O IS REPAIRING…', [], base.urgency, ctx);
    case 'moving': return mindLine('F2-moving', 'ENGINE OFFLINE — ENGINE I/O IS MOVING…', [], base.urgency, ctx);
    case 'dead': return repairLine('F2-dead', 'ENGINE NOT RESPONDING', '[TAB], fix ENGINE I/O', 'engine-io', pressing, ctx);
    case 'no-driver': return make('F2-nodriver', "NO ENGINE DRIVER — the engine can't fire", [], pressing, ctx);
    case 'no-controller': {
      // Its backup is still there (the controller was deleted or eaten): a SWAP puts it into service (WP10 review).
      const spare = ctx.spareController;
      const problem = 'NO THRUST CONTROLLER';
      if (spare?.swapReady) {
        if (!ctx.inMind) return mindLine('F2-nocontroller-swap', `${problem} — [TAB], SWAP in ${spare.name}`, ['TAB'], pressing, ctx);
        return mindLine('F2-nocontroller-swap', `${problem} — SWAP in ${spare.name}`, [], pressing, ctx);
      }
      // The Swap file is there but too damaged to pick up (WP12 p3): its REPAIR comes first.
      if (spare) {
        if (!ctx.inMind) return mindLine('F2-nocontroller-fixswap', `${problem} — [TAB], REPAIR Swap first`, ['TAB'], pressing, ctx);
        return mindLine('F2-nocontroller-fixswap', `${problem} — REPAIR Swap, then SWAP in ${spare.name}`, [], pressing, ctx);
      }
      return make('F2-nocontroller', "NO THRUST CONTROLLER — the engine can't fire", [], pressing, ctx);
    }
  }
}

// The rows a blind sensor never hides: a path into the planet (survive first; even a stale
// snapshot knows it ends on the surface) and a loop already in the ring (let go and hold steady:
// the lock does not need the instruments). While the kid's own repair or move of the file runs
// (1–3 s for Sensor Interp), nothing is asked of them in the mind, and the engine works, so every
// line the path needs NOW goes first too (LEAD-1): `HOLD [SPACE] NOW` at the capture, a release, a
// trim or shrink that is due. Its countdowns run down from the last reading, which a 1–3 s repair
// leaves fresh enough. Not the OUT/IN correction: it steers by ▼'s altitude itself, which a blind
// sensor only refreshes every few seconds, so KEEP HOLDING could run past the ring. That covers the
// rows that start it (F7 ▼ TOO LOW, F8 TOO WIDE) as well as its own (F6): obeying F7 turned the strip
// into the blind line mid-burn, hiding the correction's RELEASE (review round 1).
function beforeBlind(base: FlightObjective, fault: PlotFault): boolean {
  if (base.id === 'F3' || base.id === 'F3b' || base.id.startsWith('F4')) return true;
  return (fault.cause === 'repairing' || fault.cause === 'moving') && base.urgency === 'now' && !isCorrectionRow(base.id);
}

function evaluate(ctx: FlightContext): FlightObjective | null {
  if (ctx.status !== 'approaching') return null;
  const base = evaluatePath(ctx);
  const blind = ctx.plotFault && !beforeBlind(base, ctx.plotFault) ? blindObjective(ctx.plotFault, base, ctx) : null;
  if (blind) return blind;
  if (ctx.engineFault && !NO_BURN_ROWS.has(base.id)) return engineObjective(ctx.engineFault, base, ctx);
  return base;
}

// F3–F11: the path itself (only during a live approach, which evaluate checks).
function evaluatePath(ctx: FlightContext): FlightObjective {
  const burnPoint = ctx.burnPoint;

  // F3 / F3b: the whole loop is green (the lock hold runs even on an empty tank).
  if (ctx.inRing) {
    if (ctx.thrustOn || ctx.firing) return make('F3', 'RELEASE [SPACE]!', ['SPACE'], 'now', ctx);
    return make('F3b', 'HOLD STEADY…', [], 'now', ctx);
  }

  if (ctx.outOfFuel) return outOfFuelObjective(ctx);
  // Some FUEL left, but less than closing the loop costs even at ▼: the flight ends as FLEW AWAY
  // the moment the ship recedes (WP1-rules 3b), so no burn is asked for.
  if (ctx.cannotClose) return flyPast('LOWFUEL-open', 'NOT ENOUGH FUEL', ctx);

  // AUTOBURN at work (WP9): ahead of every burn row, but never ahead of DON'T HIT THE PLANET (F4, next).
  if (ctx.outcome !== 'impact') {
    const auto = autoburnObjective(ctx);
    if (auto) return auto;
  }

  // F4: impact. The burn is the prediction's liftPreset: OUT inbound (velocity-frame radial) and PRO outbound (OUT
  // would LOWER ▼ there: it rotates the path the other way), except IN where PRO would open the loop before ▼
  // clears the planet, and a selected PRO kept past ▲ (LEAD-2 review round 2: obeying PRO far out on a near-radial
  // path ended ESCAPED under KEEP HOLDING, and near ▲ the line switched between OUT and PRO on every refresh).
  if (ctx.outcome === 'impact') {
    const fix = ctx.liftPreset;
    if (fix === null) throw new Error('evaluatePath: an impact course without a lift preset');
    if (ctx.firing && ctx.sasMode === fix) {
      return make('F4-keep', 'KEEP HOLDING [SPACE] — lift ▼ out of the planet', ['SPACE'], 'now', ctx);
    }
    return fixWith('F4', "DON'T HIT THE PLANET", fix, 'now', ctx);
  }

  // F11-stranded / F11-accept: ACCEPT ORBIT is the only way on (acceptOnly, latched: the lead's Rule 4,
  // LEAD-1 review round 2). No burn the FUEL left can make reaches the printers (LEAD-2: only the FUEL is
  // ever to blame now; the coast SKIP crosses any WAIT in seconds). One line for the rest of the flight,
  // ahead of F5: a hold under it only spends FUEL, and F5 would name the burn that was dropped. SKIP is
  // refused too (pace.ts).
  if (ctx.acceptOnly) {
    const accept = { ...ctx, showAccept: true };
    return ctx.strandedAnyway
      ? make('F11-stranded', STRANDED_LINE, [], 'wait', accept)
      : make('F11-accept', ACCEPT_ONLY_LINE, [], 'wait', accept);
  }

  // F5: braking or boosting long before its START BURN tick. A burn the kid is finishing
  // (the right preset, due now) is not early. Nor is a hold that outlived the burn it was pressed
  // for, or one along the other preset than the next burn's: that burn just did its job (the
  // first half of a two-burn fix, a shrink) and the next one is a different burn, so the line
  // names it, urgently, instead of scolding the kid who did exactly what the strip said.
  // A hold pressed for this very burn whose rest takes less than the guard is the kid finishing it, not
  // starting it early (WP7, found on HALCYON: near the end of a trim that makes the loop nearly round, ▼'s
  // place on the loop jumps seconds ahead, and the strip said TOO EARLY 0.3 s of burning short of the ring).
  const pressedForPlan = burnPoint !== null && ctx.firingFor !== null && ctx.firingFor === burnKey(burnPoint);
  const finishingRest = burnPoint !== null && pressedForPlan && ctx.sasMode === burnPoint.preset && burnPoint.burnTac <= EARLY_BURN_GUARD_TAC;
  if (burnPoint && ctx.firing && (ctx.sasMode === 'prograde' || ctx.sasMode === 'retrograde')
    && burnPoint.inTac > EARLY_BURN_GUARD_TAC && !isFinishingBurn(burnPoint, ctx.firing, ctx.sasMode) && !finishingRest) {
    const next = `${burnVerb(burnPoint)} at ${EVENT_GLYPH[burnPoint.event]} in ${formatTac(burnPoint.inTac)}`;
    const pressedForThis = ctx.firingFor === null || ctx.firingFor === burnKey(burnPoint);
    if (ctx.sasMode === burnPoint.preset && pressedForThis) {
      return make('F5', `TOO EARLY — RELEASE [SPACE], ${next}`, ['SPACE'], 'now', ctx);
    }
    return make('F5-next', `RELEASE [SPACE]! — next: ${next}`, ['SPACE'], 'now', ctx);
  }

  if (ctx.outcome === 'open') {
    if (!burnPoint) throw new Error('flightObjective: open path with fuel but without a burn point');

    // F9: ▼ already passed. Brake now or fly away. Once the kid has let it ride (WP1-rules 3a),
    // SKIP to the end is allowed too, and the line says so like every WAIT does.
    if (ctx.outbound) {
      if (ctx.firing && ctx.sasMode === 'retrograde') {
        return make('F9-keep', 'KEEP HOLDING — close the loop', ['SPACE'], 'now', ctx);
      }
      const missed = fixWith('F9', 'MISSED ▼', 'retrograde', 'now', ctx, ' NOW');
      return ctx.skipAvailable ? { ...missed, text: `${missed.text}${SKIP_HINT}`, keys: [...missed.keys, 'F'] } : missed;
    }

    const early = burnPoint.inTac > LATE_CAPTURE_TAC;

    // F6: an OUT/IN correction is running.
    if (early && ctx.firing && (ctx.sasMode === 'radial-out' || ctx.sasMode === 'radial-in')) {
      const goingUp = ctx.sasMode === 'radial-out';
      const short = goingUp ? ctx.rp < ctx.sweetLo : ctx.rp > ctx.sweetHi;
      const past = goingUp ? ctx.rp > ctx.sweetHi : ctx.rp < ctx.sweetLo;
      // In the sweet zone with the path still running into a debris cloud that holding on (to the zone's far edge)
      // still takes it off: hold, and the CLEAR OF THE DEBRIS moment comes before the RELEASE (WP9 review round 1:
      // the dodge's countdown is worked out for this deepest hold, so the line must ask for it).
      const dodging = ctx.debris !== null && ctx.debris.dodgeInTac !== null;
      // WP12 p3 (the lead's ruling 1): a fast correction says RELEASE a reaction early, once ▼ will reach the zone's
      // middle within RELEASE_LEAD_TAC (see tuning.ts), so a kid's late release still stops ▼ in the ring.
      const middle = (ctx.sweetLo + ctx.sweetHi) / 2;
      const towardMiddle = goingUp ? ctx.rpRateTac > 0 : ctx.rpRateTac < 0;
      const releaseEarly = short && !dodging && towardMiddle && (middle - ctx.rp) / ctx.rpRateTac <= RELEASE_LEAD_TAC;
      if (short && !releaseEarly) {
        const text = goingUp ? 'KEEP HOLDING — push ▼ up into the ring' : 'KEEP HOLDING — pull ▼ down into the ring';
        return make('F6-keep', text, ['SPACE'], 'now', ctx);
      }
      if (past) return make('F6-past', 'RELEASE — too far', ['SPACE'], 'now', ctx);
      if (dodging && ctx.debris) return make('F6-dodge', `KEEP HOLDING — dodge DEBRIS ${ctx.debris.rack}`, ['SPACE'], 'now', ctx);
      return make('F6-release', 'RELEASE [SPACE]', ['SPACE'], 'now', ctx);
    }
    // F6-resume: the correction let go in the ring with the path still running into a debris cloud that holding on
    // (its preset is still selected) can still take it off: say so, with the countdown (WP9 review round 2: before,
    // the release dropped the dodge without a word and the strip jumped to TURN AROUND). Urgent, like F8's countdown.
    const inRingNow = ctx.rp >= ctx.ring.min && ctx.rp <= ctx.ring.max;
    if (early && !ctx.firing && inRingNow && ctx.debris && ctx.debris.dodgeInTac !== null) {
      const tail = DODGE_IN(formatTac(ctx.debris.dodgeInTac), ctx.debris.rack);
      return dodgeWarn(make('F6-resume', `${DODGE_RESUME}${tail}`, ['SPACE'], 'now', ctx), ctx.debris.dodgeInTac);
    }

    const soonOrNow: Urgency = ctx.periTac !== null && ctx.periTac < COUNTDOWN_RED_TAC ? 'now' : 'soon';
    // F7 / F8: ▼ misses the ring and there is still time to correct.
    if (early && ctx.rp < ctx.ring.min) return fixWith('F7', '▼ TOO LOW', 'radial-out', soonOrNow, ctx);
    if (early && ctx.rp > ctx.ring.max) {
      const debris = ctx.debris;
      if (debris === null) return fixWith('F8', 'TOO WIDE', 'radial-in', soonOrNow, ctx);
      if (debris.dodgeInTac === null) {
        return fixWithTail('F8-debris-late', 'TOO WIDE', 'radial-in', soonOrNow, ctx, DODGE_TOO_LATE(debris.rack), DODGE_TOO_LATE_SHORT(debris.rack));
      }
      // A deadline, so urgent all the way (WP9 review round 1): the ship's one decision that runs out, ahead of
      // the MIND's lines and the tutorials (a carried FIREWALL's placing hint used to stand over the countdown).
      const time = formatTac(debris.dodgeInTac);
      const line = fixWithTail('F8-debris', 'TOO WIDE', 'radial-in', 'now', ctx, DODGE_IN(time, debris.rack), DODGE_IN_SHORT(time));
      return dodgeWarn(line, debris.dodgeInTac);
    }

    // F10: the capture timeline (also late corrections: brake anyway, trim later).
    const outside = ctx.rp < ctx.ring.min || ctx.rp > ctx.ring.max;
    const lateSuffix = outside ? LATE_CAPTURE_HINT : '';
    if (ctx.firing && ctx.sasMode === 'retrograde') {
      return make('F10-keep', 'KEEP HOLDING — close the loop', ['SPACE'], 'now', ctx);
    }
    if (ctx.sasMode !== 'retrograde') {
      const press = pressPreset('retrograde', ctx);
      const urgency: Urgency = burnPoint.inTac <= TACTICAL_LEAD_BURN_TAC ? 'now' : 'soon';
      const text = withTail(`TURN AROUND — ${press.text}`, lateSuffix, outside ? LATE_CAPTURE_HINT_SHORT : '');
      return offerAuto(make('F10-turn', text, press.keys, urgency, ctx), ctx);
    }
    return offerAuto(burnTimeline('F10', burnPoint, ctx, lateSuffix), ctx);
  }

  if (!burnPoint) throw new Error('flightObjective: closed loop outside the ring with fuel but without a burn point');
  if (burnPoint.reason === 'capture' || burnPoint.reason === 'missed') {
    throw new Error(`flightObjective: closed loop with a ${burnPoint.reason} burn point`);
  }

  // SHRINK: climbing away on a loop that is too big, with the next trim far off (WP1-rules 2).
  // Brake now; when the loop is small enough the strip hands over to the trim (F5 names it).
  if (burnPoint.reason === 'shrink') {
    if (ctx.firing && ctx.sasMode === 'retrograde') {
      return make('SHRINK-keep', 'KEEP HOLDING — shrink the loop', ['SPACE'], 'now', ctx);
    }
    return fixWith('SHRINK', 'SHRINK THE LOOP', 'retrograde', 'now', ctx);
  }

  // F11: a closed loop that is not green yet: trim it. (With nothing left but ACCEPT ORBIT, the
  // F11-stranded / F11-accept rows above.) A trim the tank can't pay for but whose burn still saves the
  // ship keeps its WAIT and SKIP, and names ACCEPT only where that does not strand. Held, it runs to the
  // empty tank and the flight ends ORBIT ACCEPTED, so its KEEP HOLDING says that rather than promise the
  // ring (LEAD-2: since the last FUEL went, this is how a short tank spends itself).
  const reason = burnPoint.reason;
  const acceptSuffix = ctx.showAccept ? ACCEPT_HINT : '';
  if (ctx.firing && ctx.sasMode === burnPoint.preset) {
    if (ctx.fuelShort) return make('F11-keep-dry', KEEP_TO_EMPTY_LINE, ['SPACE'], 'now', ctx);
    return make('F11-keep', `KEEP HOLDING — ${trimProgress(reason, burnPoint)}`, ['SPACE'], 'now', ctx);
  }
  if (ctx.sasMode !== burnPoint.preset) {
    // Due now (its apsis is here or just behind): name the preset and the burn in one line.
    if (burnPoint.inTac <= 0) return fixWith(`F11-${reason}`, TRIM_PROBLEM[reason], burnPoint.preset, 'now', ctx, ' NOW');
    const press = pressPreset(burnPoint.preset, ctx);
    const urgency: Urgency = burnPoint.inTac <= TACTICAL_LEAD_BURN_TAC ? 'now' : 'soon';
    const ahead = `${TRIM_PROBLEM[reason]} — at ${EVENT_GLYPH[burnPoint.event]} ${press.text} and burn`;
    const text = withTail(ahead, acceptSuffix, ctx.showAccept ? ACCEPT_HINT_SHORT : '');
    return make(`F11-${reason}`, text, press.keys, urgency, ctx);
  }
  return burnTimeline('F11', burnPoint, ctx, acceptSuffix);
}

// WP9: while AUTOBURN could take the capture, the capture timeline's lines offer it (` · or [B] AUTO`), when the
// tail fits: the kid learns the skill is there the moment it can help.
function offerAuto(objective: FlightObjective, ctx: FlightContext): FlightObjective {
  if (!ctx.autoAvailable || (objective.text + AUTOBURN_TEXT.offerTail).length > MAX_LINE_CHARS) return objective;
  return { ...objective, text: objective.text + AUTOBURN_TEXT.offerTail, keys: [...objective.keys, 'B'] };
}

// AUTOBURN's rows (§6.10, WP9), ahead of every burn row: while it flies the ship, the strip says what it does
// instead of asking the kid for a burn it is already making. Its own urgency is 'soon' and 'wait', so in the
// MIND the eating lines it frees the kid for come first; the hand-back is 'now' (the kid must take the ship). A
// hand-back in the ring shows here only until the prediction agrees: F3b's HOLD STEADY comes first (the radio says it).
// The words name the take-over (`[SPACE] takes over`) and the cancel (`[B] to cancel`), but the keys do not: a key on a
// line glows as the next step, and while AUTOBURN flies the next step is to let it (final review: SPACE and B lit up as
// if the kid should press them). Only SKIP, the one press that helps while it waits, is lit.
function autoburnObjective(ctx: FlightContext): FlightObjective | null {
  const auto = ctx.autoburn;
  if (auto.phase === 'burning' || auto.phase === 'pointing') {
    return make('AUTO-burning', ctx.inMind ? AUTOBURN_TEXT.burningMind : AUTOBURN_TEXT.burning, [], 'soon', ctx);
  }
  if (auto.phase === 'armed') {
    const time = formatTac(auto.armedInTac);
    const skip = ctx.skipAvailable ? SKIP_HINT : '';
    return make('AUTO-armed', withTail(AUTOBURN_TEXT.armed(time), skip, ''), ctx.skipAvailable ? ['F'] : [], 'wait', ctx);
  }
  if (auto.phase === 'done' && auto.end === 'braked' && auto.sinceSec < AUTOBURN_DONE_LINE_SEC) {
    return make('AUTO-done', ctx.inMind ? AUTOBURN_TEXT.brakedTab : AUTOBURN_TEXT.braked, ctx.inMind ? ['TAB'] : [], 'now', ctx);
  }
  // In the ring F3b's HOLD STEADY comes first (above); this only covers the 10 Hz prediction catching up with the
  // ship's own state (AUTOBURN let go on it), so the strip never flashes the trim it no longer needs.
  if (auto.phase === 'done' && auto.end === 'in-ring' && auto.sinceSec < AUTOBURN_DONE_LINE_SEC) {
    return make('AUTO-done', AUTOBURN_TEXT.inRing, [], 'now', ctx);
  }
  return null;
}

// WP12 review (the lead's ruling of 2026-10-21 17:45): in the MIND the ship's controls are refused (flight-controls'
// SHIP SCREEN), so a ship line that asks for a burn or a preset (SPACE, W/A/S/D, Q/E), or counts down to one (GET
// READY), says [TAB] first there, as a MIND line does from the SHIP: `GET READY — [TAB], BRAKE IN 0:08`, `[TAB] BACK —
// HOLD [SPACE] NOW`. Before, a kid who took MIND CLEAR's own SKIP offer sat in blue through GET READY at OVERCLOCK ×¼
// and under HOLD [SPACE] NOW (about 30 wall s), and a phone read `hold [BURN]` on a screen with no BURN button (there
// the cap reads [SHIP]). The row's id is kept: the director's filter, flight-controls' lineAsks and the harness read
// the same step; only its words point to the screen first. Not while the engine is firing: in blue that is AUTOBURN
// (mode.ts lets go of the kid's own burn), which needs no hand, and RELEASE rows only come with a burn.
// A line too long for the strip with [TAB] keeps its head and its tail (a dodge's countdown, SKIP, AUTO) and says
// `[TAB] BACK` in place of the how (`TOO WIDE — [TAB] BACK · 0:12 to dodge DEBRIS C`): it is read on arrival.
const SHIP_CONTROL_KEYS: ReadonlySet<string> = new Set(['SPACE', ...Object.values(PRESET_KEY), 'Q', 'E']);
const HEAD_SEPARATOR = ' — ';
const TAIL_SEPARATOR = ' · ';

function fromMind(objective: FlightObjective, ctx: FlightContext): FlightObjective {
  if (!ctx.inMind || ctx.firing || objective.layer === 'mind') return objective;
  const countdown = objective.id.endsWith('-ready');
  if (!countdown && !objective.keys.some((key) => SHIP_CONTROL_KEYS.has(key))) return objective;
  const keys = ['TAB', ...objective.keys];
  const split = objective.text.indexOf(HEAD_SEPARATOR);
  if (split < 0) return { ...objective, text: `[TAB] BACK${HEAD_SEPARATOR}${objective.text}`, keys };
  const head = objective.text.slice(0, split);
  const rest = objective.text.slice(split + HEAD_SEPARATOR.length);
  const full = `${head}${HEAD_SEPARATOR}[TAB], ${rest}`;
  if (full.length <= MAX_LINE_CHARS) return { ...objective, text: full, keys };
  const tailAt = rest.indexOf(TAIL_SEPARATOR);
  const tail = tailAt < 0 ? '' : rest.slice(tailAt);
  const short = withTail(`${head}${HEAD_SEPARATOR}[TAB] BACK`, tail, '');
  return { ...objective, text: short, keys };
}

// The table above, worded for the screen the kid is on, plus the dev assertion that every line fits the strip.
export function flightObjective(ctx: FlightContext): FlightObjective | null {
  const evaluated = evaluate(ctx);
  const objective = evaluated && fromMind(evaluated, ctx);
  if (IS_DEV && objective && objective.text.length > MAX_LINE_CHARS) {
    throw new Error(`flightObjective: '${objective.text}' is ${objective.text.length} chars (max ${MAX_LINE_CHARS})`);
  }
  return objective;
}

// Hysteresis for the strip: a new objective must persist OBJECTIVE_HYSTERESIS_SEC before it
// replaces the shown one, unless it is urgent. Same-id updates (a ticking countdown) pass
// straight through. One filter per display; the owner resets it with the world.
// Generic over the line type: the director filters its composed strip line with the same rule.
export interface ObjectiveFilter<Line extends { id: string; urgency: Urgency } = FlightObjective> {
  next(candidate: Line | null, dtAi: number): Line | null;
  reset(): void;
}

// Two exceptions, for the director (WP12 p3): `holdsAgainst(shown, candidate)` makes an urgent candidate wait out the
// hysteresis anyway (a RELEASE row against a line asking to hold SPACE, releaseHolds); `passesAt(shown, candidate)`
// lets any candidate replace the shown line at once (a dodge countdown that has stopped, dodgeCountdownEnds).
export interface ObjectiveFilterRules<Line> {
  holdsAgainst?: (shown: Line, candidate: Line) => boolean;
  passesAt?: (shown: Line, candidate: Line) => boolean;
}

export function createObjectiveFilter<Line extends { id: string; urgency: Urgency } = FlightObjective>(
  filterRules: ObjectiveFilterRules<Line> = {},
): ObjectiveFilter<Line> {
  const holdsAgainst = filterRules.holdsAgainst ?? (() => false);
  const passesAt = filterRules.passesAt ?? (() => false);
  let shown: Line | null = null;
  let pending: Line | null = null;
  let pendingSec = 0;
  return {
    next(candidate, dtAi) {
      if (candidate === null || shown === null || candidate.id === shown.id || passesAt(shown, candidate)
        || (candidate.urgency === 'now' && !holdsAgainst(shown, candidate))) {
        shown = candidate;
        pending = null;
        pendingSec = 0;
        return shown;
      }
      if (pending === null || pending.id !== candidate.id) {
        pending = candidate;
        pendingSec = 0;
        return shown;
      }
      pending = candidate;
      pendingSec += dtAi;
      if (pendingSec >= OBJECTIVE_HYSTERESIS_SEC) {
        shown = candidate;
        pending = null;
        pendingSec = 0;
      }
      return shown;
    },
    reset() {
      shown = null;
      pending = null;
      pendingSec = 0;
    },
  };
}
