// Slice 4c–4e: Track ORBIT owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2). Others ask by message.
import type { AutoMode } from '@/types/skill';
import { MAP_TEXT } from '@data/map-text';
import type { GameState, Pace, PresetMode, TerminalStatus, LogEntry, Speaker } from '@state/schema';
import { liveLockText, engineOverriddenBy } from '@state/resident-selectors';
import { WARDEN_TEXT } from '@data/warden-text';
import type { Ring, Vec2 } from '@/types/orbit';
import { secUntil, samplePath, loopProblem, sweetZone, type BurnPoint, type Prediction } from '@systems/predict';
import { decayWarned, type DecayForecast } from '@systems/landing-orbit';
import { tac, mainCountdown, skipBlockReason, apsisTimesHidden, type CountdownKind } from '@systems/pace';
import {
  canAccept, acceptStrands, burnVerb, formatTac, PRESET_KEY, PRESET_NAME, TRIM_PROBLEM,
} from '@systems/guidance';
import { isThrustOn, isGhostFiring } from '@systems/orbit-sim';
import {
  capabilitiesNow, engineFault, presetsAvailable, roleHealth, thrustCap, skillLive, BAND_COPY, ROLE_LABEL, AUTOPILOT_DAMAGED_LINE,
  type EngineFault, type Capabilities, type Band, type CapabilityRole,
} from '@systems/capabilities';
import { getByRole, shownIntegrity, chargeLeft, verbSecondsLeft, engineOpen } from '@state/selectors';
import { HOLLOW_VERB } from '@data/hollow-text';
import { threadsBusy, threadsTotal } from '@systems/ops-core';
import { isHollowAlert, GHOST_WARN_ID, GHOST_ALARM_ID } from '@systems/alerts';
import { choiceSecondsLeft, choiceTimerRunning } from '@systems/say';
import { GHOST_TEXT } from '@data/ghost-text';
import { ghostCountShown, ghostDriftKm } from '@systems/ghost-thrust';
import { ZONE_WORD, ZONE_PLOT_TEXT, RACK_TAG_TEXT } from '@data/zone-text';
import { AUTO_BUTTON_TEXT, AUTO_BUTTON_REASON, AUTO_PLOT_TEXT, AUTO_PIP_TEXT, type AutoBurnKind, type AutoArmedKind } from '@data/skill-text';
import { landingOrbitAim, v3GhostLabel, v3NoAimLine } from '@systems/autoburn-v3';
import {
  autoburnRefusal, autoburnEverTrained, autoModeFor, autoOfferMode, autoArmedBurn, autoFlyingKind, autoburnFireInTac, isEngaged,
  lockRangeTac, modeTargetKm, previewModeBurn,
} from '@systems/autoburn';
import { autoburnDemoSkill } from '@systems/skill-tree';
import { zoneVerdict, zoneRacks, racksText, debrisRack, type Zone, type ZoneHit, type ZoneVerdict } from '@/types/zone';
import { mindZonesBlind } from '@systems/zones';
import { LANDING_HUD_TEXT, LANDING_REPORT_TEXT, BAND_TEXT, LANDING_PLOT_TEXT, DECAY_CHIP_TEXT } from '@data/landing-text';
import type { DropSolution } from '@/types/landing';
import { landingMoment } from '@systems/landing-rules';
import {
  COUNTDOWN_RED_TAC, LOCK_HOLD_AI_SEC, PLOT_SHIP_MARGIN, PLOT_RING_FACTOR, PLOT_FLYBY_TAG_FRAC,
  STRANDED_RANGE_FRAC, TACTICAL_LEAD_BURN_TAC, UPCOMING_EVENTS_MAX, UPCOMING_HORIZON_TAC,
  OVERCLOCK_FACTOR, REACTOR_THREAD_SHARE, CHOICE_URGENT_SEC, GHOST_DRIFT_ROUND_KM, RA_TARGET_FRAC, BAND_OK_MIN,
} from '@data/tuning';

// What the flight HUD shows, as plain data: the header countdown chip, pace label and SKIP
// button, the NAV PLOT chip / readouts / markers (as the instruments can show them), the Engine's
// BURN button, presets, FUEL, THRUST LIMIT, the REACTOR row and ACCEPT, Telemetry, the window
// pips, the mode toggle's alert and the MIND chip. Functions of (state, prediction) with no DOM,
// so the words and colours a kid reads are tested headless next to the physics; the components
// only patch the DOM with what comes back. The ones that depend on busy Core threads (THRUST
// LIMIT, REACTOR, the MIND chip, and the plot models' default capabilities) also read the ops
// core's live thread count, so a test mounts the ops core for them.
//
// LANDING (slice 1b: the engine is open in the landing). Where the flight reads the plan's burn point (pred.burnPoint:
// the countdown chip, the START BURN tick, the FUEL bar's NEEDED tick), the landing reads the OFFER instead
// (landing-orbit landingBurnOffer: the one answer pace, the strip and the beeps read), passed in as `offer` so these
// stay pure and a test can hand one in. A ring trim the tank can't pay for, or a burn the kid declined, is in the plan
// but not offered, and nothing on screen may count down to it.

// unknown: what a blind instrument can't tell (PATH UNCERTAIN, NO SIGNAL), in the dim grey.
export type Tone = 'plain' | 'good' | 'danger' | 'flyby' | 'ghost' | 'unknown';

// What the NAV PLOT's instruments can show (capabilities.ts, C3): exact, ≈ (a degraded Sensor
// Interp), PATH UNCERTAIN (failing or worse) or NO SIGNAL (the Nav Plotter dead or gone). The plot
// models take it as an argument so a painter derives it once per frame; the default reads it.
type PlotCaps = Capabilities['plot'];

// The prefix on a reading a degraded sensor can only give roughly (§7.1: `≈` when approx).
const APPROX = '≈';
// What a blind instrument shows instead of a number.
const UNKNOWN_READING = '???';
const NO_READING = '—';

// --- Formatting ------------------------------------------------------------------------------

// MM:SS for the countdown displays (header chip, plot markers, Telemetry): the objective's
// formatter with padded minutes, so both reach 00:00 exactly when the moment arrives.
export function formatCountdown(tacSec: number): string {
  return formatTac(tacSec, true);
}

export function formatKm(distanceKm: number): string {
  return `${Math.round(distanceKm).toLocaleString('en-US')} km`;
}

// The world's speed multiplier, short enough for the header: ×2.5, ×39, ×871, ×1.2K, ×10M.
// One decimal only below 10, where it still means something.
export function formatWarp(speed: number): string {
  let value = speed;
  let suffix = '';
  if (speed >= 1e6) { value = speed / 1e6; suffix = 'M'; }
  else if (speed >= 1e3) { value = speed / 1e3; suffix = 'K'; }
  const digits = value >= 10 || Number.isInteger(value) ? Math.round(value).toString() : value.toFixed(1);
  return `×${digits}${suffix}`;
}

export interface TextPart {
  text: string;
  key: boolean;  // true: draw as a key cap
}

// Splits guidance text into plain runs and key caps: "hold [SPACE]" → "hold ", ⟨SPACE⟩.
export function splitKeyCaps(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const pattern = /\[([A-Z]+)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), key: false });
    parts.push({ text: match[1]!, key: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), key: false });
  return parts;
}

// Float slack for percentages that sit exactly on a whole number (0.29 × 100 = 28.999…), so
// rounding them never loses or gains a visible percent.
const PERCENT_ROUNDING_EPS = 1e-9;

export function percentFloor(fraction: number): number {
  // Floor, so "100%" only ever appears when the loop is truly all green.
  return Math.floor(fraction * 100 + PERCENT_ROUNDING_EPS);
}

// FUEL as every readout shows it: rounded up, so the bar only ever reads 0% when the tank is really
// dry. The FUEL ★ (systems/stars.ts) is judged on this same number, so a bar that reads 20% at the
// lock always earns it.
export function shownFuelPct(fuelPct: number): number {
  return Math.ceil(Math.max(0, Math.min(100, fuelPct)) - PERCENT_ROUNDING_EPS);
}

function inBand(radius: number, ring: Ring): boolean {
  return radius >= ring.min && radius <= ring.max;
}

// --- Header ---------------------------------------------------------------------------------

export interface CountdownChip {
  kind: CountdownKind | 'window';   // 'window': LANDING's next window (01-landing §4)
  label: string;         // `✕ IMPACT`, `▼`, `BRAKE IN`
  event: string;         // the label's bare word, for lines that add their own glyphs (`IMPACT`)
  time: string;
  urgent: boolean;       // red (and pulsing): an impact, or anything at ≤ COUNTDOWN_RED_TAC
  fastForward: boolean;  // ▸▸: the world runs faster than real seconds, so it ticks faster
  slow: boolean;         // ×¼: OVERCLOCK, the world runs slower than real seconds
}

// The OVERCLOCK badge: the slow-down as a fraction (×¼ for 0.25).
const VULGAR_FRACTIONS: Readonly<Record<number, string>> = { 2: '½', 3: '⅓', 4: '¼', 5: '⅕', 8: '⅛', 10: '⅒' };

export function overclockBadge(): string {
  const fraction = VULGAR_FRACTIONS[Math.round(1 / OVERCLOCK_FACTOR)];
  if (!fraction) throw new Error(`overclockBadge: no glyph for OVERCLOCK_FACTOR ${OVERCLOCK_FACTOR}`);
  return `×${fraction}`;
}

// The world runs faster than real seconds (▸▸) or, under OVERCLOCK, slower (×¼). Neither while
// paused: nothing runs.
function worldIsFast(state: Readonly<GameState>): boolean {
  return state.clock.pace !== 'tactical' && !state.clock.paused;
}

function worldIsSlow(state: Readonly<GameState>): boolean {
  return state.clock.overclock && !state.clock.paused;
}

const COUNTDOWN_EVENT: Record<Exclude<CountdownKind, 'burn'>, string> = {
  impact: 'IMPACT',
  peri: '▼',
  apo: '▲',
};

// LANDING (01-landing §4: "the countdown chip shows the next window"): `LZ-A IN 00:42` to the launch moment of the window
// the landing waits on, then `LZ-A OPEN 00:06` to its in-band close once that moment has come (landing-rules
// landingMoment: the one answer the strip, pace's SKIP and the beeps read, so the chip and the line agree). An open
// window the landing does not wait on (its LZ full while another in band has room) is no reason to launch: the chip
// counts on to the awaited one. Nothing once the landing waits on nothing. `sol` is drop-cache's getDropSolution(),
// passed in so this stays pure; without one the chip is empty.
function windowChip(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): CountdownChip | null {
  if (sol === null) return null;
  const moment = landingMoment(state, sol, state.clock.tSec, capabilitiesNow(state).bay.offline);
  if (!moment.awaited) return null;
  const warp = state.level.tacticalWarp;
  const chip = (event: string, gameSec: number, urgent: boolean): CountdownChip => ({
    kind: 'window', label: event, event, time: formatCountdown(tac(Math.max(0, gameSec), warp)), urgent,
    fastForward: worldIsFast(state), slow: worldIsSlow(state),
  });
  const open = moment.open;
  if (open !== null && open.awaited && open.launchCome && open.window !== null) {
    return chip(LANDING_PLOT_TEXT.chipOpen(open.lz), open.window.closeInSec, false);
  }
  const target = moment.target;
  if (target === null) return null;
  return chip(LANDING_PLOT_TEXT.chipIn(target.lz), target.launchInSec, tac(target.launchInSec, warp) <= COUNTDOWN_RED_TAC);
}

// LANDING with a burn offered (slice 1b): the offer's START BURN (`BRAKE IN 00:12`) while it comes before the window's
// launch moment (the window first once its moment has come, or comes sooner); null when the window comes first. The
// offer is not counted once it is due (the strip's HOLD [SPACE] NOW says that).
function offerChip(state: Readonly<GameState>, pred: Prediction, sol: Readonly<DropSolution> | null, offer: Readonly<BurnPoint>): CountdownChip | null {
  const now = state.clock.tSec;
  const warp = state.level.tacticalWarp;
  const burnInSec = secUntil(pred, offer.inSec, now);
  if (burnInSec <= 0) return null;
  if (sol !== null) {
    const moment = landingMoment(state, sol, now, capabilitiesNow(state).bay.offline);
    const open = moment.open;
    if (open !== null && open.awaited && open.launchCome) return null;
    if (moment.target !== null && moment.target.launchInSec <= burnInSec) return null;
  }
  const event = `${burnVerb(offer).toUpperCase()} IN`;
  const tacSec = tac(burnInSec, warp);
  return {
    kind: 'burn', label: event, event, time: formatCountdown(tacSec), urgent: tacSec <= COUNTDOWN_RED_TAC,
    fastForward: worldIsFast(state), slow: worldIsSlow(state),
  };
}

export function countdownChip(
  state: Readonly<GameState>, pred: Prediction, sol: Readonly<DropSolution> | null = null, offer: Readonly<BurnPoint> | null = null,
): CountdownChip | null {
  if (state.run.phase === 'landing') return (offer === null ? null : offerChip(state, pred, sol, offer)) ?? windowChip(state, sol);
  const countdown = mainCountdown(state, pred);
  if (!countdown) return null;
  let event: string;
  if (countdown.kind === 'burn') {
    if (!pred.burnPoint) throw new Error('countdownChip: a burn countdown without a burn point');
    event = `${burnVerb(pred.burnPoint).toUpperCase()} IN`;
  } else {
    event = COUNTDOWN_EVENT[countdown.kind];
  }
  return {
    kind: countdown.kind,
    label: countdown.kind === 'impact' ? `✕ ${event}` : event,
    event,
    time: formatCountdown(countdown.tacSec),
    urgent: countdown.kind === 'impact' || countdown.tacSec <= COUNTDOWN_RED_TAC,
    fastForward: worldIsFast(state),
    slow: worldIsSlow(state),
  };
}

// The decay chip on the NAV PLOT (slice 1b, §3.7): while drag is sinking the orbit (▼ under the DRAG line), how many
// orbits until ▼ leaves the band if nobody burns (`DECAY · OUT OF BAND IN 2 ORBITS`), urgent from DECAY_WARN_ORBITS
// (L10's moment), with the 'lift' burn's key while that burn is offered (`· [W]`: PRO at ▲). `forecast` is
// landing-orbit decayForecast's answer for the live orbit and `offer` landingBurnOffer's, both injected. Null outside a
// landing that goes on, on a ship without drag, or with ▼ at or above the line.
export interface DecayChip {
  text: string;       // may contain a [KEY] cap
  orbits: number;
  urgent: boolean;
}

export function decayChip(
  state: Readonly<GameState>, forecast: Readonly<DecayForecast> | null, offer: Readonly<BurnPoint> | null = null,
): DecayChip | null {
  if (state.run.phase !== 'landing' || state.landing.ended !== null || !state.landing.drag) return null;
  const orbits = forecast?.orbitsToLeave ?? null;
  if (orbits === null || !Number.isFinite(orbits)) return null;
  const key = offer !== null && offer.reason === 'lift' ? DECAY_CHIP_TEXT.key(PRESET_KEY[offer.preset]) : '';
  // Its urgent look is L10's moment (landing-orbit decayWarned, the one threshold); a forecast past its kick limit is a
  // lower bound (`N+`, review minor 3); ▼ already under the band says so (minor 2).
  const lowerBound = forecast?.lowerBound === true;
  return { text: `${DECAY_CHIP_TEXT.chip(orbits, lowerBound)}${key}`, orbits, urgent: decayWarned(orbits) };
}

// The header crumbs (§7.1): UNIT-047 · WAVE 1 / ARES-VII / what is happening right now, in the words the
// rest of the HUD uses: IMPACT COURSE, FLYBY, GET READY, CAPTURED, IN RING, then the outcome. The wave is
// the run (§4.5, WP8: UNIT-048 · WAVE 2 on the next one). Phase 3 slice 3a (02-map §4): on the arm the ship crumb gains
// the galaxy year (`UNIT-047 / KESTREL · 2467 / FLYBY`: `year`, null on the classic world, whose years are fixtures),
// and the desk and the PACKET name themselves.
export interface HeaderCrumbs {
  unit: string;
  wave: string;
  ship: string;
  year: number | null;
  phase: Label;
}

function flightPhaseCrumb(state: Readonly<GameState>, pred: Prediction): Label {
  const status = state.burn.status;
  if (status !== 'approaching') return { text: TERMINAL[status].word, tone: TERMINAL[status].tone };
  if (pred.outcome === 'impact') return { text: 'IMPACT COURSE', tone: 'danger' };
  const burnPoint = pred.burnPoint;
  if (burnPoint && !isThrustOn(state)) {
    const toBurnTac = tac(secUntil(pred, burnPoint.inSec, state.clock.tSec), state.level.tacticalWarp);
    if (toBurnTac <= 0 && burnPoint.approaching) return { text: 'BURN NOW', tone: 'danger' };
    if (toBurnTac > 0 && toBurnTac <= TACTICAL_LEAD_BURN_TAC) return { text: 'GET READY', tone: 'flyby' };
  }
  if (pred.outcome === 'open') return { text: 'FLYBY', tone: 'flyby' };
  if (pred.fit.inRing) return { text: state.burn.lockHoldAiSec > 0 ? 'HOLD STEADY' : 'IN RING', tone: 'good' };
  return { text: 'CAPTURED', tone: 'plain' };
}

export function headerCrumbs(state: Readonly<GameState>, pred: Prediction): HeaderCrumbs {
  const unit = state.mission.unitId;
  const wave = `WAVE ${state.mission.wave}`;
  const ship = state.level.shipName;
  const year = state.run.map.world === 'arm' ? state.run.map.galaxyYear : null;
  const crumbs = (phase: Label): HeaderCrumbs => ({ unit, wave, ship, year, phase });
  if (state.run.phase === 'title') return crumbs({ text: 'STANDBY', tone: 'plain' });
  if (state.run.phase === 'desk') return crumbs({ text: MAP_TEXT.desk.title, tone: 'plain' });
  if (state.run.phase === 'transmit') return crumbs({ text: MAP_TEXT.desk.packetCrumb, tone: 'plain' });
  if (state.run.phase === 'boot') return crumbs({ text: 'RECEIVING', tone: 'plain' });
  // 01-landing §4: … ORBIT LOCKED | LANDING · 2/6 DOWN | ALL DOWN. The outcome stays on the crumb until the first pod
  // is down (the moment belongs to the lock), then the crumb says what is happening now, and ALL DOWN once every pod is.
  if (state.run.phase === 'landing') {
    const down = state.landing.pods.filter((record) => record.fate.kind === 'down').length;
    const total = state.landing.pods.length;
    if (down > 0 && down === total) return crumbs({ text: LANDING_HUD_TEXT.crumbAllDown, tone: 'good' });
    if (down > 0) return crumbs({ text: LANDING_HUD_TEXT.crumbLanding(down, total), tone: 'good' });
  }
  if (state.run.phase === 'report') return crumbs({ text: LANDING_REPORT_TEXT.title, tone: 'good' });
  return crumbs(flightPhaseCrumb(state, pred));
}

// A hazard zone ahead as the strip's upcoming events name it (§7.1 `DEBRIS C 03:30`, WP9): a debris cloud
// the path will enter, by its rack, counted to the entry. Under PATH UNCERTAIN the instruments can't say
// whether it hits: `DEBRIS C?`, counted to where the path passes it. A belt: `BELT`, to the entry. Times are
// game seconds after the prediction (null: nothing to name). Pure.
export function zoneEvents(pred: Prediction, plotMode: PlotCaps['mode']): { label: string; eventInSec: number }[] {
  if (plotMode === 'no-signal') return [];
  const events: { label: string; eventInSec: number }[] = [];
  for (const hit of pred.zoneHits) {
    if (hit.spent) continue;
    if (hit.kind === 'belt') {
      if (hit.enterInSec !== null) events.push({ label: ZONE_WORD.belt, eventInSec: hit.enterInSec });
      continue;
    }
    const rack = debrisRack(hit);
    if (plotMode === 'uncertain') {
      if (hit.closestInSec !== null) events.push({ label: `${ZONE_WORD.debris} ${rack}?`, eventInSec: hit.closestInSec });
    } else if (hit.enterInSec !== null) {
      events.push({ label: `${ZONE_WORD.debris} ${rack}`, eventInSec: hit.enterInSec });
    }
  }
  return events;
}

// The next hazard zone with its countdown, `DEBRIS C? 03:41` / `BELT 01:16` (WP12 review): the phone header's chip. On a
// desktop the strip's upcoming list says it (below), but a phone has no room for that list, and the plot's own zone
// label is a few pixels tall there: the dodge decision's rack and time were nowhere a kid could read them. The soonest
// zone, however far (the plot labels it from the start too). Empty with nothing ahead.
export function nextHazard(state: Readonly<GameState>, pred: Prediction, plot: PlotCaps = capabilitiesNow(state).plot): string {
  if (state.run.phase !== 'flight' || state.burn.status !== 'approaching' || pred.acceptOnly) return '';
  const now = state.clock.tSec;
  let soonest: { label: string; inSec: number } | null = null;
  for (const zone of zoneEvents(pred, plot.mode)) {
    const inSec = secUntil(pred, zone.eventInSec, now);
    if (inSec > 0 && (soonest === null || inSec < soonest.inSec)) soonest = { label: zone.label, inSec };
  }
  return soonest === null ? '' : `${soonest.label} ${formatCountdown(tac(soonest.inSec, state.level.tacticalWarp))}`;
}

// The right side of the objective strip when the ticker is quiet (§7.1): the next events after
// the one the header chip already counts down (and the apsis its burn is centred on), soonest
// first and within UPCOMING_HORIZON_TAC,
// e.g. `▲ 05:30` while the chip says `BRAKE IN 00:42`, or `▼ 06:36 · DEBRIS C 03:30` (WP9). ▸▸ marks them as
// fast-forwarding.
export function upcomingEvents(state: Readonly<GameState>, pred: Prediction, plot: PlotCaps = capabilitiesNow(state).plot): string {
  // Nothing ahead counts once ACCEPT ORBIT is the only way on (pace.ts apsisTimesHidden).
  if (state.run.phase !== 'flight' || state.burn.status !== 'approaching' || pred.acceptOnly) return '';
  const now = state.clock.tSec;
  const warp = state.level.tacticalWarp;
  const events: { kind: CountdownKind | 'zone'; inSec: number; label: string }[] = [];
  const add = (kind: CountdownKind | 'zone', eventInSec: number | null, label: string): void => {
    if (eventInSec === null) return;
    const inSec = secUntil(pred, eventInSec, now);
    if (inSec > 0 && tac(inSec, warp) <= UPCOMING_HORIZON_TAC) events.push({ kind, inSec, label });
  };
  add('impact', pred.impactInSec, '✕ IMPACT');
  if (pred.burnPoint && pred.burnPoint.approaching) add('burn', pred.burnPoint.inSec, burnVerb(pred.burnPoint).toUpperCase());
  if (pred.outcome !== 'impact') add('peri', pred.periInSec, '▼');
  if (pred.outcome === 'closed') add('apo', pred.apoInSec, '▲');
  for (const zone of zoneEvents(pred, plot.mode)) add('zone', zone.eventInSec, zone.label);
  const inChip = mainCountdown(state, pred)?.kind ?? null;
  // A burn point is centred on its apsis (it starts half a burn early): while the chip counts
  // the burn, that apsis a few seconds later would put a second, different time for the same ▼
  // on the row whose objective already says `brake at ▼ in m:ss`.
  const centredOn = inChip === 'burn' && pred.burnPoint ? pred.burnPoint.event : null;
  const shown = events
    .filter((event) => event.kind !== inChip && event.kind !== centredOn)
    .sort((a, b) => a.inSec - b.inSec)
    .slice(0, UPCOMING_EVENTS_MAX)
    .map((event) => `${event.label} ${formatCountdown(tac(event.inSec, warp))}`);
  if (shown.length === 0) return '';
  if (worldIsFast(state)) return `${shown.join(' · ')} ▸▸`;
  if (worldIsSlow(state)) return `${shown.join(' · ')} ${overclockBadge()}`;
  return shown.join(' · ');
}

const PACE_NAME: Record<Pace, string> = { tactical: 'TACTICAL', cruise: 'CRUISE', skip: 'SKIP ▸▸' };

// TACTICAL and CRUISE show the ship's fixed warp (what the pace means); SKIP and the debug
// override show the live, gliding multiplier, because there the speed itself is the news.
export function paceLabel(state: Readonly<GameState>): string {
  const { clock, level } = state;
  // While landing the world still coasts (the plot moves); otherwise a finished ship has stopped.
  if (state.burn.status !== 'approaching' && state.run.phase !== 'landing') return 'STOPPED';
  if (clock.paused) return 'PAUSED';
  if (clock.debugWarp !== null) return `DEBUG ${formatWarp(clock.speed)}`;
  if (clock.overclock) return `OVERCLOCK ${overclockBadge()}`;
  if (clock.pace === 'tactical') return `${PACE_NAME.tactical} ${formatWarp(level.tacticalWarp)}`;
  if (clock.pace === 'cruise') return `${PACE_NAME.cruise} ${formatWarp(level.cruiseWarp)}`;
  return `${PACE_NAME.skip} ${formatWarp(clock.speed)}`;
}

export interface SkipButtonModel {
  active: boolean;               // a SKIP is running
  blockedReason: string | null;  // why a new SKIP would be refused (shown struck out)
}

export function skipButton(state: Readonly<GameState>, pred: Prediction): SkipButtonModel {
  // A pause freezes a running skip; it carries on after P.
  if (state.clock.skipWarp !== null && !state.clock.paused) return { active: true, blockedReason: null };
  return { active: false, blockedReason: skipBlockReason(state, pred) };
}

// --- NAV PLOT --------------------------------------------------------------------------------

// Plot radius in km: the ring and planet hold still near the planet; a ship further out rides
// the edge.
export function plotViewRadius(state: Readonly<GameState>): number {
  const shipRadius = Math.hypot(state.orbit.x, state.orbit.y);
  return Math.max(shipRadius * PLOT_SHIP_MARGIN, state.level.ring.max * PLOT_RING_FACTOR);
}

export interface Label {
  text: string;
  tone: Tone;
}

// Every place that names a finished flight reads this one table (plot chip, STATUS readout,
// objective strip, result banner, footer), so they can never disagree. `short` fits the
// readout row.
export const TERMINAL: Record<TerminalStatus, { word: string; short: string; tone: Tone }> = {
  locked: { word: 'ORBIT LOCKED', short: 'LOCKED', tone: 'good' },
  accepted: { word: 'ORBIT ACCEPTED', short: 'ACCEPTED', tone: 'plain' },
  stranded: { word: 'STRANDED', short: 'STRANDED', tone: 'danger' },
  escaped: { word: 'FLEW AWAY', short: 'FLEW AWAY', tone: 'danger' },
  crashed: { word: 'CRASHED', short: 'CRASHED', tone: 'danger' },
  abandoned: { word: 'ABANDONED', short: 'ABANDONED', tone: 'danger' },
};

// The NO SIGNAL veil's second line (C3): why the plot is blind, and where the fix is.
export function noSignalReason(state: Readonly<GameState>): string {
  const health = roleHealth(state, 'navplot');
  const file = ROLE_LABEL.navplot;
  if (health.band === 'missing') return `the ${file} file is gone`;
  if (health.offline === 'repairing') return `${file} is repairing…`;
  if (health.offline) return `${file} is offline`;
  if (health.integrity === null) throw new Error('noSignalReason: a Nav Plotter file without an integrity');
  return `${file} ${shownIntegrity(health.integrity)}% — [TAB], REPAIR it`;
}

// The line state in two words (§7.1): IMPACT / FLYBY / CAPTURED · n% GREEN / IN RING. A loop
// below the strand floor names its problem instead (the one its next burn fixes, so the chip
// and the strip agree when both ends are out): right after a capture the time-weighted range
// is 0–5% while a long green arc is already drawn, and "0% GREEN" next to it reads as broken.
// Blind instruments name themselves instead (NO SIGNAL, PATH UNCERTAIN); a crash course still
// reads IMPACT, because even a stale snapshot knows the path ends on the surface (and the strip
// says DON'T HIT THE PLANET).
export function plotChip(state: Readonly<GameState>, pred: Prediction, plot: PlotCaps = capabilitiesNow(state).plot): Label {
  const status = state.burn.status;
  // Slice 4 (03 §3.6): an armed AUTOBURN whose claim found no thread free fires late, and the plot shows how late.
  const late = autoLateTac(state, pred);
  if (late !== null && plot.mode !== 'no-signal') return { text: AUTO_PLOT_TEXT.late(formatCountdown(late)), tone: 'danger' };
  // LANDING with the engine open (slice 1b): the lock's word stays on the chip, unless a burn has put the path on the
  // planet or flung it open, which the plot must say as the flight does (the line under the chip is red or dashed).
  if (status !== 'approaching' && engineOpen(state) && plot.mode !== 'no-signal') {
    if (pred.outcome === 'impact') return { text: 'IMPACT', tone: 'danger' };
    if (pred.outcome === 'open') return { text: 'FLYBY', tone: 'flyby' };
  }
  if (status !== 'approaching') return { text: TERMINAL[status].word, tone: TERMINAL[status].tone };
  if (plot.mode === 'no-signal') return { text: BAND_COPY.navplot.dead, tone: 'danger' };
  if (pred.outcome === 'impact') return { text: 'IMPACT', tone: 'danger' };
  if (plot.mode === 'uncertain') return { text: BAND_COPY.sensor.failing, tone: 'unknown' };
  if (pred.outcome === 'open') return { text: 'FLYBY', tone: 'flyby' };
  if (pred.fit.inRing) {
    const hold = state.burn.lockHoldAiSec;
    // The HOLD STEADY count lives here until WP2's full-screen 3-2-1 overlay.
    return hold > 0
      ? { text: `IN RING · LOCKING ${Math.ceil(LOCK_HOLD_AI_SEC - hold)}`, tone: 'good' }
      : { text: 'IN RING', tone: 'good' };
  }
  if (pred.greenFraction < STRANDED_RANGE_FRAC) {
    return { text: `CAPTURED · ${TRIM_PROBLEM[loopProblem(pred, state.level.ring)]}`, tone: 'plain' };
  }
  return { text: `CAPTURED · ${percentFloor(pred.greenFraction)}% GREEN`, tone: 'plain' };
}

export interface PlotReadouts {
  lowest: Label;
  // How far the engine firing by itself just moved ▼ (`−60`, `↓`), beside the LOWEST caption; null: nothing to say.
  lowestDrift: string | null;
  highest: Label;
  range: Label;
  status: Label;
}

function flightStatus(state: Readonly<GameState>): Label {
  const burn = state.burn;
  // LANDING (slice 1b): the engine is open, so BURNING and the engine firing by itself read as in the flight.
  if (burn.status !== 'approaching' && !(engineOpen(state) && (isThrustOn(state) || isGhostFiring(state)))) {
    return { text: TERMINAL[burn.status].short, tone: TERMINAL[burn.status].tone };
  }
  if (isThrustOn(state)) return { text: 'BURNING', tone: 'flyby' };
  // WP10: the engine firing by itself (C2), named where the kid reads what the ship is doing: not their burn.
  if (isGhostFiring(state)) return { text: GHOST_TEXT.status, tone: 'danger' };
  if (burn.firing && burn.presetAligning) return { text: 'ALIGNING', tone: 'plain' };
  if (burn.lockHoldAiSec > 0) return { text: 'LOCKING', tone: 'good' };
  return { text: 'COASTING', tone: 'plain' };
}

// The readout row under the plot: ▼ and ▲ as altitudes (never radii), the printer range and
// what the ship is doing.
// A ≈ sensor marks ▼ and ▲ as rough; a blind one shows no altitudes at all (UNDERGROUND stays: a
// crash course is known), and no signal shows nothing.
export function plotReadouts(state: Readonly<GameState>, pred: Prediction, plot: PlotCaps = capabilitiesNow(state).plot): PlotReadouts {
  const { planet, ring } = state.level;
  const status = flightStatus(state);
  if (plot.mode === 'no-signal') {
    const none: Label = { text: NO_READING, tone: 'unknown' };
    return { lowest: none, lowestDrift: null, highest: none, range: none, status };
  }
  const blind = plot.mode === 'uncertain';
  const rough = plot.mode === 'approx' ? APPROX : '';
  const unknown: Label = { text: UNKNOWN_READING, tone: 'unknown' };
  // On an impact course ▼ is underground whatever a fuzzy sensor rounds it to (it can round a
  // ▼ just under the surface up to 0 km).
  let lowest: Label;
  let lowestDrift: string | null = null;
  if (pred.outcome === 'impact' || pred.rp < planet.R) lowest = { text: 'UNDERGROUND', tone: 'danger' };
  else if (blind) lowest = unknown;
  else {
    lowest = { text: `${rough}${formatKm(pred.rp - planet.R)}`, tone: inBand(pred.rp, ring) ? 'good' : 'plain' };
    // The engine firing by itself just moved ▼ (WP10 review): the readout turns red and its caption says how far, for a
    // few seconds. In the caption, not after the reading (WP12 p3, WP10 verify: at 1280×720 `2,640 km (−2,950 km)` ran
    // into the HIGHEST column; the caption row has the room), and without a second `km`.
    lowestDrift = driftAmount(state, plot, false);
    if (lowestDrift !== null) lowest = { ...lowest, tone: 'danger' };
  }
  let highest: Label;
  if (!pred.fit.closed) highest = { text: NO_READING, tone: 'plain' };
  else if (blind) highest = unknown;
  else highest = { text: `${rough}${formatKm(pred.ra - planet.R)}`, tone: inBand(pred.ra, ring) ? 'good' : 'plain' };
  let range: Label;
  if (pred.outcome !== 'closed') range = { text: '0%', tone: 'plain' };
  else if (blind) range = unknown;
  else range = { text: `${percentFloor(pred.greenFraction)}%`, tone: pred.fit.inRing ? 'good' : 'plain' };
  return { lowest, lowestDrift, highest, range, status };
}

// What the engine firing by itself has just done to ▼ (ghost-thrust.ts ghostDriftKm), as the instruments may say it:
// `−60 km` (to the nearest GHOST_DRIFT_ROUND_KM, never 0; `−60` without its unit), or under a rough sensor only the
// way it went (`↓`). null: nothing to show (no burst lately, or a plot that shows no ▼ altitude).
function driftAmount(state: Readonly<GameState>, plot: PlotCaps, withUnit = true): string | null {
  if (plot.mode !== 'exact' && plot.mode !== 'approx') return null;
  const drift = ghostDriftKm(state);
  if (drift === null) return null;
  if (plot.mode === 'approx') return drift < 0 ? GHOST_TEXT.driftDown : GHOST_TEXT.driftUp;
  const rounded = Math.max(GHOST_DRIFT_ROUND_KM, Math.round(Math.abs(drift) / GHOST_DRIFT_ROUND_KM) * GHOST_DRIFT_ROUND_KM);
  const amount = withUnit ? formatKm(rounded) : Math.round(rounded).toLocaleString('en-US');
  return `${drift < 0 ? '−' : '+'}${amount}`;
}

export interface PlotMarker {
  pos: Vec2;       // world km
  lines: string[];
  tone: Tone;
}

export interface PlotMarkers {
  impact: PlotMarker | null;                    // where the red line meets the surface (drawn as ✕)
  peri: PlotMarker | null;                      // ▼ (a ghost inside the planet on an impact course)
  apo: PlotMarker | null;                       // ▲ (closed loops only)
  startBurn: (PlotMarker & { dir: Vec2 }) | null;  // the START BURN tick and the path direction there
  flyby: PlotMarker | null;                     // the FLYBY tag on an open path
}

// The time shown for the next ▼ or ▲ pass: none while a burn is under way, where a shrinking
// loop's next pass would race down by minutes a second, nor once ACCEPT ORBIT is the only way on
// (pace.ts apsisTimesHidden).
const NO_APSIS_TIME = '—';

// A ≈ sensor puts ≈ on the altitudes. A blind one (PATH UNCERTAIN) keeps only ✕ IMPACT: no ▼/▲,
// no START BURN, no FLYBY tag, because none of them can be trusted. No signal: nothing.
// In LANDING the START BURN tick is the offer's (`offer`, landing-orbit landingBurnOffer), never the raw plan's.
export function plotMarkers(
  state: Readonly<GameState>, pred: Prediction, plot: PlotCaps = capabilitiesNow(state).plot, offer: Readonly<BurnPoint> | null = null,
): PlotMarkers {
  const none: PlotMarkers = { impact: null, peri: null, apo: null, startBurn: null, flyby: null };
  if (plot.mode === 'no-signal') return none;
  const markers = trueMarkers(state, pred, plot, offer);
  if (plot.mode === 'uncertain') return { ...none, impact: markers.impact };
  return markers;
}

function trueMarkers(state: Readonly<GameState>, pred: Prediction, plot: PlotCaps, offer: Readonly<BurnPoint> | null): PlotMarkers {
  const rough = plot.mode === 'approx' ? APPROX : '';
  const { planet, ring, tacticalWarp } = state.level;
  const now = state.clock.tSec;
  const countdown = (eventInSec: number): string =>
    formatCountdown(tac(Math.max(0, secUntil(pred, eventInSec, now)), tacticalWarp));
  const apsisTime = (eventInSec: number): string => (apsisTimesHidden(state, pred) ? NO_APSIS_TIME : countdown(eventInSec));
  const toward = (radius: number, angle: number): Vec2 => ({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });

  const lastPoint = pred.points[pred.points.length - 1];
  const impact: PlotMarker | null = pred.outcome === 'impact' && pred.impactInSec !== null && lastPoint
    ? { pos: lastPoint, lines: [`IMPACT ${countdown(pred.impactInSec)}`], tone: 'danger' }
    : null;

  // On an impact course ▼ is underground: a ghost the kid watches rise out as they burn.
  let peri: PlotMarker | null = null;
  if (pred.outcome === 'impact') {
    peri = { pos: toward(pred.rp, pred.omega), lines: ['▼ LOWEST:', 'UNDERGROUND'], tone: 'ghost' };
  } else if (pred.periInSec !== null) {
    peri = {
      pos: toward(pred.rp, pred.omega),
      lines: [`▼ ${apsisTime(pred.periInSec)}`, `LOWEST ${rough}${formatKm(pred.rp - planet.R)}`],
      tone: inBand(pred.rp, ring) ? 'good' : 'plain',
    };
    // The engine firing by itself just moved ▼ (WP10 review): said beside it, in red, for a few seconds.
    const drift = driftAmount(state, plot);
    if (drift !== null) peri = { ...peri, lines: [...peri.lines, GHOST_TEXT.drift(drift)], tone: 'danger' };
  }

  const apo: PlotMarker | null = pred.outcome === 'closed' && pred.apoInSec !== null
    ? {
      pos: toward(pred.ra, pred.omega + Math.PI),
      lines: [`▲ ${apsisTime(pred.apoInSec)}`, `HIGHEST ${rough}${formatKm(pred.ra - planet.R)}`],
      tone: inBand(pred.ra, ring) ? 'good' : 'plain',
    }
    : null;

  // The START BURN tick only while it is still ahead (at or past it the objective says NOW),
  // and only on the way INTO its apsis. Past the apsis (finishing that burn, or waiting for
  // the next pass) the tick is a whole loop ahead, which on the drawn loop puts it right
  // behind the ship, where it reads as a burn just missed. None once ACCEPT ORBIT is the only way on:
  // that burn is no option any more (Prediction.acceptOnly).
  let startBurn: PlotMarkers['startBurn'] = null;
  const landing = state.run.phase === 'landing';
  const burnPoint = landing ? offer : pred.burnPoint;
  if (burnPoint && burnPoint.approaching && (landing || !pred.acceptOnly) && secUntil(pred, burnPoint.inSec, now) > 0) {
    const sample = samplePath(pred, burnPoint.inSec);
    if (sample) startBurn = { pos: sample.pos, dir: sample.dir, lines: ['START BURN'], tone: 'plain' };
  }

  let flyby: PlotMarker | null = null;
  if (pred.outcome === 'open') {
    const limit = PLOT_FLYBY_TAG_FRAC * plotViewRadius(state);
    for (let i = pred.points.length - 1; i >= 0; i--) {
      const point = pred.points[i]!;
      if (Math.hypot(point.x, point.y) <= limit) {
        flyby = { pos: point, lines: ['FLYBY'], tone: 'flyby' };
        break;
      }
    }
  }

  return { impact, peri, apo, startBurn, flyby };
}

// --- Hazard zones (WP9 part 2, §6.8) -----------------------------------------------------------

// The tone a zone verdict is drawn in, everywhere it shows (plot glyph and label, rack tag, mini-strip row).
const VERDICT_TONE: Readonly<Record<ZoneVerdict, Tone>> = { hit: 'danger', clear: 'good', unknown: 'unknown', spent: 'danger' };

export interface PlotZoneModel {
  zoneId: string;
  kind: Zone['kind'];
  verdict: ZoneVerdict;
  zone: Zone;          // the geometry, world km (a debris circle, a belt annulus)
  lines: string[];     // the label beside the glyph
  tone: Tone;
}

function zoneHitFor(pred: Prediction, zone: Zone): ZoneHit {
  const hit = pred.zoneHits.find((candidate) => candidate.zoneId === zone.id);
  if (!hit) throw new Error(`flight-hud: the prediction has no zoneHit for zone '${zone.id}'`);
  return hit;
}

// A zone countdown in tactical seconds from the prediction's game-time offset (null: no such moment).
function zoneCountdown(state: Readonly<GameState>, pred: Prediction, eventInSec: number | null): string | null {
  if (eventInSec === null) return null;
  return formatCountdown(tac(Math.max(0, secUntil(pred, eventInSec, state.clock.tSec)), state.level.tacticalWarp));
}

// What the NAV PLOT draws for each hazard zone (§6.8, §5.1 4:48–5:00): the glyph's verdict and its label, read
// from what the instruments show (the sensed prediction). A debris cloud the path runs into says which rack it
// hits and when (`DEBRIS · HITS RACK C` / `IN 03:30`, red); a path that misses it says `DEBRIS · CLEAR` (green);
// a blind sensor knows where the cloud is, not where the ship goes (`DEBRIS · RACK C · HIT?`, grey, counted to the
// nearest pass); a cloud that hit says so (`HIT · RACK C`). A belt: how long inside and how many hits to expect.
// Nothing under NO SIGNAL (the veil covers the plot). Pure.
export function plotZones(state: Readonly<GameState>, pred: Prediction, plot: PlotCaps = capabilitiesNow(state).plot): PlotZoneModel[] {
  if (plot.mode === 'no-signal') return [];
  const blind = plot.mode === 'uncertain';
  return state.level.zones.map((zone): PlotZoneModel => {
    const hit = zoneHitFor(pred, zone);
    const verdict = zoneVerdict(hit, blind);
    const racks = racksText(zoneRacks(zone));
    const withTime = (head: string, eventInSec: number | null): string[] => {
      const time = zoneCountdown(state, pred, eventInSec);
      return time === null ? [head] : [head, ZONE_PLOT_TEXT.countdown(time)];
    };
    let lines: string[];
    if (zone.kind === 'debris') {
      if (verdict === 'hit') lines = withTime(ZONE_PLOT_TEXT.debrisHits(racks), hit.enterInSec ?? 0);
      else if (verdict === 'clear') lines = [ZONE_PLOT_TEXT.debrisClear];
      else if (verdict === 'unknown') lines = withTime(ZONE_PLOT_TEXT.debrisUnknown(racks), hit.closestInSec);
      else lines = [ZONE_PLOT_TEXT.debrisSpent(racks)];
    } else if (verdict === 'hit') {
      const insideTime = formatTac(tac(hit.insideSec, state.level.tacticalWarp));
      lines = [ZONE_PLOT_TEXT.beltInside(insideTime), ZONE_PLOT_TEXT.beltHits(Math.round(hit.expectedHits), racks)];
    } else {
      lines = [verdict === 'unknown' ? ZONE_PLOT_TEXT.beltUnknown(racks) : ZONE_PLOT_TEXT.beltClear];
    }
    return { zoneId: zone.id, kind: zone.kind, verdict, zone, lines, tone: VERDICT_TONE[verdict] };
  });
}

// The MIND's side of a zone (the lead's note for WP9: the rack is named in blue too): a tag under a rack's label
// on the strip, and the rack's row lit on the amber mini-strip. While a debris cloud is coming for the rack:
// `DEBRIS` over its countdown (red); blind: `DEBRIS?` (grey); once it hit: `HIT` over the damage, for the rest
// of the ship. A belt the path enters: `BELT` over its countdown, or `INSIDE`. A rack the path clears has no tag.
// Only while the ship is live (flight, printing). Pure.
export interface RackZoneTag {
  rack: string;
  zoneId: string;
  verdict: ZoneVerdict;
  lines: string[];
  tone: Tone;
}

export function rackZoneTags(state: Readonly<GameState>, pred: Prediction, plot: PlotCaps = capabilitiesNow(state).plot): RackZoneTag[] {
  if (state.run.phase !== 'flight' && state.run.phase !== 'landing') return [];
  const blind = mindZonesBlind(plot);
  const tags: RackZoneTag[] = [];
  for (const zone of state.level.zones) {
    const hit = zoneHitFor(pred, zone);
    const verdict = zoneVerdict(hit, blind);
    if (verdict === 'clear') continue;
    let lines: string[];
    if (zone.kind === 'debris') {
      if (verdict === 'spent') lines = [RACK_TAG_TEXT.debrisHit, debrisHitDamageLine(state, zone.id)];
      else if (verdict === 'unknown') lines = [RACK_TAG_TEXT.debrisUnknown, ...optional(zoneCountdown(state, pred, hit.closestInSec))];
      else lines = [RACK_TAG_TEXT.debris, ...optional(zoneCountdown(state, pred, hit.enterInSec ?? 0))];
    } else if (verdict === 'unknown') {
      lines = [RACK_TAG_TEXT.beltUnknown];
    } else {
      lines = [RACK_TAG_TEXT.belt, hit.insideNow ? RACK_TAG_TEXT.inside : zoneCountdown(state, pred, hit.enterInSec ?? 0)!];
    }
    for (const rack of zoneRacks(zone)) {
      // One tag a rack: the first zone that names it (no designed ship puts two zones on one rack).
      if (!tags.some((tag) => tag.rack === rack)) tags.push({ rack, zoneId: zone.id, verdict, lines, tone: VERDICT_TONE[verdict] });
    }
  }
  return tags;
}

// What a spent cloud's hit did, as the TERMINAL said it (zone-text debrisHitLine): the worst loss, or nothing there
// when the kid had emptied the rack in time (the MOVE-souls-out way to save them).
function debrisHitDamageLine(state: Readonly<GameState>, zoneId: string): string {
  const record = state.hazards.debrisHits.find((candidate) => candidate.zoneId === zoneId);
  if (!record) throw new Error(`rackZoneTags: debris ${zoneId} is spent with no record of its hit`);
  return record.files === 0 ? RACK_TAG_TEXT.debrisHitNothing : `−${Math.round(record.worstLoss)}%`;
}

function optional(text: string | null): string[] {
  return text === null ? [] : [text];
}

// --- Engine ----------------------------------------------------------------------------------

export type BurnLook = 'ready' | 'aligning' | 'burning' | 'blocked';

export interface BurnButtonModel {
  text: string;      // may contain [KEY] caps
  look: BurnLook;
  disabled: boolean;
}

// What the BURN button says when the engine can't fire (§7.1). It stays pressable: a press
// coughs, and a hold burns the moment the file is back.
const ENGINE_FAULT_BUTTON: Record<EngineFault, string> = {
  'no-controller': BAND_COPY['thrust-ctrl'].missing,
  'no-driver': BAND_COPY['engine-io'].missing,
  repairing: 'ENGINE OFFLINE · REPAIRING',
  moving: 'ENGINE OFFLINE · MOVING',
  dead: BAND_COPY['engine-io'].dead,
};

// The engine closed (selectors engineOpen): the flight is over, or in LANDING the landing is (slice 1b: the engine is
// open for the landing's burns until it ends).
const ENGINE_CLOSED_TEXT = { flight: 'FLIGHT OVER', landing: 'LANDING OVER' } as const;

export function burnButton(state: Readonly<GameState>): BurnButtonModel {
  const burn = state.burn;
  if (!engineOpen(state)) {
    const over = state.run.phase === 'landing' && state.landing.ended !== null ? ENGINE_CLOSED_TEXT.landing : ENGINE_CLOSED_TEXT.flight;
    return { text: over, look: 'blocked', disabled: true };
  }
  if (state.clock.paused) return { text: 'PAUSED · [P] TO RESUME', look: 'blocked', disabled: true };
  if (burn.fuelPct <= 0) return { text: 'FUEL EMPTY', look: 'blocked', disabled: true };
  const fault = engineFault(capabilitiesNow(state));
  if (fault) return { text: ENGINE_FAULT_BUTTON[fault], look: 'blocked', disabled: false };
  if (burn.presetAligning) return { text: 'ALIGNING…', look: 'aligning', disabled: false };
  if (burn.firing) return { text: 'BURNING…', look: 'burning', disabled: false };
  return { text: 'HOLD [SPACE] · BURN', look: 'ready', disabled: false };
}

// The AUTO button (§7.1 context button `AUTO · B`, §6.10, WP9 part 2): shown once the unit carries a trained
// AUTOBURN.skl (or the run trained one that was lost since: then it says why it can't). `head` is its name and
// key, or what it is doing; `note` the small print on the right: the offer, the countdown to its burn, or why
// [B] would be refused right now. It stays pressable while refused (like BURN): a press buzzes with the reason.
export type AutoLook = 'ready' | 'armed' | 'flying' | 'blocked';

export interface AutoButtonModel {
  shown: boolean;
  head: string;      // may contain [KEY] caps
  note: string;      // may contain [KEY] caps
  look: AutoLook;
  title: string;
}

// Slice 4 (03 §3.6): the head names the mode [B] would fly (`AUTO · GREEN [B]`, `AUTO · ROUND [B]`; v1's capture keeps
// `AUTO · [B]`), the notes name the burn it waits for or flies, and the button shows in LANDING while a v2 file is aboard
// (ROUND on a locked orbit). It glows ('ready') only while [B] would engage it: inside the LOCK bracket.
const READY_NOTE: Readonly<Record<AutoMode, string>> = {
  capture: AUTO_BUTTON_TEXT.ready, green: AUTO_BUTTON_TEXT.readyGreen, round: AUTO_BUTTON_TEXT.readyRound, 'landing-orbit': AUTO_BUTTON_TEXT.readyOrbit,
};
const FLYING_HEAD: Readonly<Record<AutoBurnKind, string>> = {
  capture: AUTO_BUTTON_TEXT.burningHead, trim: AUTO_BUTTON_TEXT.trimmingHead, round: AUTO_BUTTON_TEXT.roundingHead,
  orbit: AUTO_BUTTON_TEXT.orbitingHead, 'top-up': AUTO_BUTTON_TEXT.toppingUpHead,
};
const ARMED_NOTE: Readonly<Record<AutoArmedKind, (time: string) => string>> = {
  capture: AUTO_BUTTON_TEXT.armed, trim: AUTO_BUTTON_TEXT.armedTrim, round: AUTO_BUTTON_TEXT.armedRound,
  orbit: AUTO_BUTTON_TEXT.armedOrbit, 'top-up': AUTO_BUTTON_TEXT.armedTopUp, hold: () => AUTO_BUTTON_TEXT.armedHold,
};

export function autoButton(state: Readonly<GameState>, pred: Prediction): AutoButtonModel {
  const hidden: AutoButtonModel = { shown: false, head: '', note: '', look: 'blocked', title: '' };
  if (!engineOpen(state)) return hidden;
  const live = skillLive(state.memory, 'autoburn');
  const hasFile = live.file !== null;
  const nominal = live.nominal?.version ?? 0;
  if (state.run.phase === 'landing' ? !(hasFile && nominal >= 2) : !hasFile && !autoburnEverTrained(state)) return hidden;
  const accuracy = autoburnDemoSkill(state.run.stats).accuracy;
  const title = !hasFile ? AUTO_BUTTON_TEXT.titleNoSkill : nominal >= 3 ? AUTO_BUTTON_TEXT.titleV3(accuracy)
    : nominal >= 2 ? AUTO_BUTTON_TEXT.titleV2(accuracy) : AUTO_BUTTON_TEXT.title(accuracy);
  const phase = state.burn.auto.phase;
  if (phase === 'armed') {
    const armed = autoArmedBurn(state, pred);
    if (armed?.waiting) return { shown: true, head: AUTO_BUTTON_TEXT.armedHead, note: AUTO_BUTTON_TEXT.threadWait, look: 'armed', title };
    const time = formatCountdown(armed?.inTac ?? 0);
    const note = ARMED_NOTE[armed?.kind ?? 'capture'](time);
    return { shown: true, head: AUTO_BUTTON_TEXT.armedHead, note, look: 'armed', title };
  }
  if (phase === 'pointing') return { shown: true, head: AUTO_BUTTON_TEXT.pointingHead, note: AUTO_BUTTON_TEXT.burning, look: 'flying', title };
  if (phase === 'burning') {
    return { shown: true, head: FLYING_HEAD[autoFlyingKind(state) ?? 'capture'], note: AUTO_BUTTON_TEXT.burning, look: 'flying', title };
  }
  const mode = autoModeFor(state, pred, live);
  const head = mode === null ? AUTO_BUTTON_TEXT.head : AUTO_BUTTON_TEXT.modeHead(mode);
  const refusal = autoburnRefusal(state, pred);
  if (refusal === null) return { shown: true, head, note: READY_NOTE[mode ?? 'capture'], look: 'ready', title };
  return { shown: true, head, note: AUTO_BUTTON_REASON[refusal] ?? refusal, look: 'blocked', title };
}

// --- Slice 4 (plan §2.9; Track FLIGHT): the LOCK bracket, the ghost, the late claim, the AUTOBURN pip ----------------------

// The stretch of the path inside AUTOBURN's lock range (the NAV PLOT's `LOCK` bracket, ending at the mode's first burn's
// START BURN), in game seconds from now (the prediction's points are times after pred.asOfTSec: the plot rebases); null when
// there is no working skill, nothing to fly, it is already engaged, or the burn is due now. `inside`: the ship is in it
// (the AUTO button glows, and 'autoburn-in-lock' chimed on the way in). Buying LOCK 270 visibly triples it (03 §3.7).
export interface LockBracket {
  fromInSec: number;
  toInSec: number;
  mode: AutoMode;
  inside: boolean;
}

export function lockBracket(state: Readonly<GameState>, pred: Prediction): LockBracket | null {
  if (!engineOpen(state) || isEngaged(state.burn.auto.phase)) return null;
  const live = skillLive(state.memory, 'autoburn');
  const range = lockRangeTac(live);
  if (range === null || (state.run.phase === 'landing' && live.version < 2)) return null;
  const mode = autoModeFor(state, pred, live);
  if (mode === null) return null;
  const burnPoint = previewModeBurn(state, mode, pred);
  if (burnPoint === null) return null;
  const toInSec = secUntil(pred, burnPoint.inSec, state.clock.tSec);
  if (!(toInSec > 0)) return null;
  const fromInSec = Math.max(0, toInSec - range * state.level.tacticalWarp);
  return { fromInSec, toInSec, mode, inside: fromInSec === 0 };
}

// The dashed target AUTOBURN's mode would fly to (03 §3.6: the band-hugging green loop for GREEN, the circle for ROUND and
// v3), as its apsides and ▼'s direction (the loop it flies keeps ▼ where it is, since it burns only at the apsides): while
// engaged, its own; before the press, while [B] would engage it (inside the LOCK bracket). null with nothing to show (v1's
// capture draws none: its START BURN tick is enough).
export interface AutoGhost {
  mode: AutoMode;
  rpKm: number;
  raKm: number;
  omega: number;
  // AUTOBURN v3's label on its circle (autoburn-v3 v3GhostLabel: `LANDING ORBIT · EVERY LZ FITS · DROP ±70 km · FUEL −9%`);
  // null for the other modes.
  label: string | null;
}

export function autoGhost(state: Readonly<GameState>, pred: Prediction): AutoGhost | null {
  if (!engineOpen(state) || pred.outcome === 'impact') return null;
  const auto = state.burn.auto;
  const mode = isEngaged(auto.phase) ? auto.mode : autoOfferMode(state, pred);
  if (mode === null || mode === 'capture') return null;
  if (mode === 'round' || mode === 'landing-orbit') {
    const targetKm = modeTargetKm(state, pred, mode);
    if (targetKm === null) return null;
    const aim = mode === 'landing-orbit' ? landingOrbitAim(state, pred) : null;
    // Review m12: v3 flying v2's ROUND because no landing orbit fits says why on the ghost.
    const why = mode === 'round' && skillLive(state.memory, 'autoburn').version >= 3 ? v3NoAimLine(state, pred) : null;
    return { mode, rpKm: targetKm, raKm: targetKm, omega: pred.omega, label: aim === null ? why : v3GhostLabel(state, aim) };
  }
  return { mode, ...greenTarget(pred, state.level.ring), omega: pred.omega, label: null };
}

// GREEN's target loop (phase 2's own targets, predict trimTarget): ▼ kept if in the ring, else moved into the sweet zone;
// ▲ at RA_TARGET_FRAC of the ring's edge on a flyby or a too-big loop, the sweet zone's low edge on a too-small one.
function greenTarget(pred: Prediction, ring: Ring): { rpKm: number; raKm: number } {
  const sweet = sweetZone(ring);
  const fit = pred.fit;
  const rpKm = fit.rp < ring.min ? sweet.lo : fit.rp > ring.max ? sweet.hi : fit.rp;
  const raKm = !fit.closed || fit.ra > ring.max ? Math.max(rpKm, RA_TARGET_FRAC * ring.max) : fit.ra < ring.min ? sweet.lo : fit.ra;
  return { rpKm, raKm: Math.max(rpKm, raKm) };
}

// Tactical s an armed AUTOBURN is late because its claim found no thread free (03 §3.6: "the plot shows how late"), or null.
export function autoLateTac(state: Readonly<GameState>, pred: Prediction): number | null {
  if (state.burn.auto.phase !== 'armed' || state.burn.auto.waitingSinceTSec === null) return null;
  const fireIn = autoburnFireInTac(state, pred);
  return fireIn !== null && fireIn < 0 ? -fireIn : null;
}

// The Engine window's AUTOBURN pip (03 §4, 4b's graded damage): the file's band, its version and what it works as
// (`AUTOBURN v2▸v1`), a click away from the file; null while the run never trained it and no file is aboard.
export interface AutoPipModel {
  segId: string | null;
  label: string;
  look: PipLook;
  glyph: string;
  reading: string;
  title: string;
}

export function autoburnPip(state: Readonly<GameState>): AutoPipModel | null {
  const live = skillLive(state.memory, 'autoburn');
  if (live.file === null) {
    if (!autoburnEverTrained(state)) return null;
    return { segId: null, label: AUTO_PIP_TEXT.label, look: 'missing', glyph: PIP_GLYPH.missing, reading: '', title: AUTO_PIP_TEXT.missing };
  }
  const nominal = live.file.version;
  const look: PipLook = live.offline !== null ? 'offline' : live.band;
  const label = live.version === nominal ? AUTO_PIP_TEXT.version(nominal) : AUTO_PIP_TEXT.worksAs(nominal, live.version);
  const reading = live.band !== 'ok' ? `${shownIntegrity(live.file.integrity)}%` : '';
  const title = live.offline !== null ? AUTO_PIP_TEXT.offline(nominal)
    : live.version === nominal ? AUTO_PIP_TEXT.ok(nominal)
      : AUTO_PIP_TEXT.damaged(nominal, live.version, BAND_OK_MIN);
  return { segId: live.file.id, label, look, glyph: PIP_GLYPH[look], reading, title };
}

// One line per preset that says what it does to the path, in kid words (also the tooltips).
export const PRESET_TIP: Record<PresetMode, string> = {
  prograde: 'PRO speeds you up along your path',
  retrograde: 'RETRO brakes against your path',
  'radial-in': 'IN pulls your path toward the planet',
  'radial-out': 'OUT pushes your path away from the planet',
};

export { PRESET_KEY, PRESET_NAME };

// What the preset row says when the Autopilot file can't point the ship (C3): the buttons are
// dead, and the MANUAL fold (Q/E) is the way to turn.
const NO_PRESETS_HINT: Readonly<Record<Band, string>> = {
  ok: '',
  degraded: '',
  failing: AUTOPILOT_DAMAGED_LINE,
  dead: AUTOPILOT_DAMAGED_LINE,
  missing: 'NO AUTOPILOT — use [Q] / [E]',
};

// The line under the preset row: what the selected preset will do when you burn.
export function presetHint(state: Readonly<GameState>): string {
  const caps = capabilitiesNow(state);
  if (!presetsAvailable(caps)) return NO_PRESETS_HINT[caps.presets];
  const mode = state.burn.sasMode;
  if (mode === 'off') return 'MANUAL · turn with [Q] / [E]';
  return PRESET_TIP[mode];
}

export interface FuelModel {
  pct: number;               // 0..100, the bar fill
  text: string;
  neededPct: number | null;  // the NEEDED tick: what the next planned burn costs
  short: boolean;            // not enough FUEL for that burn
  needText: string;          // the line under the bar ('' when no burn is planned)
}

// In LANDING the NEEDED tick prices the offer (`offer`: landing-orbit landingBurnOffer, which is the plan's own burn point
// when one is offered, so pred.neededPct is its price); nothing while no burn is offered.
export function fuelModel(state: Readonly<GameState>, pred: Prediction, offer: Readonly<BurnPoint> | null = null): FuelModel {
  const pct = Math.max(0, Math.min(100, state.burn.fuelPct));
  // No NEEDED tick once ACCEPT ORBIT is the only way on (Prediction.acceptOnly): the burn it would price
  // is no option (LEAD-1 review round 2: `NEXT BURN NEEDS 31%` stood beside `NOT ENOUGH FUEL`).
  const flying = state.burn.status === 'approaching' && pred.burnPoint && !pred.acceptOnly;
  const landingOffer = state.run.phase === 'landing' && engineOpen(state) && offer !== null && pred.burnPoint !== null;
  const neededPct = flying || landingOffer ? pred.neededPct : null;
  // The tank is short of the next burn by the plan's own snapshot (Prediction.fuelShort), as the strip judges it: the
  // live FUEL against the 10 Hz NEEDED disagreed with it for seconds during a held trim (LEAD-2 review round 1). A
  // short tank whose burn is still the plan (ACCEPT ORBIT is not the only way on) spends it all: saying NOT ENOUGH
  // there, beside the red STRANDED ACCEPT, told the kid the ship was lost while the strip said WAIT for ▼.
  const short = neededPct !== null && pred.fuelShort;
  let needText = '';
  if (neededPct !== null) {
    needText = short ? `NEED ${Math.ceil(neededPct)}% · USE IT ALL` : `NEXT BURN NEEDS ${Math.ceil(neededPct)}%`;
  }
  return { pct, text: `${shownFuelPct(pct)}%`, neededPct, short, needText };
}

export interface AcceptModel {
  offered: boolean;
  rangePct: number;
  strands: boolean;  // accepting would strand the ship: shown in the danger tone, outcome named
}

export function acceptModel(state: Readonly<GameState>, pred: Prediction): AcceptModel {
  return { offered: canAccept(state, pred), rangePct: percentFloor(pred.greenFraction), strands: acceptStrands(pred) };
}

export function acceptLabel(model: AcceptModel, armed: boolean): string {
  const outcome = model.strands ? ' · STRANDED' : '';
  return armed
    ? `CLICK AGAIN TO ACCEPT · ${model.rangePct}%${outcome}`
    : `${BAND_TEXT.accept(model.rangePct)}${outcome}`;
}

// --- The ship's files on screen (WP4) ---------------------------------------------------------

export interface ThrustLimitModel {
  capPct: number;    // the share of nominal thrust the files let through, 0..100 (floored)
  limited: boolean;  // below 100: the FUEL hatch and the footer item show
  cause: string;     // why, in kid words: `2 THREADS BUSY`, `ENGINE I/O 38%`, `REACTOR`
  text: string;      // `THRUST LIMIT 50% · 2 THREADS BUSY`, or the engine's fault (`ENGINE OFFLINE · REPAIRING`)
}

function threadsBusyText(busy: number): string {
  return `${busy} THREAD${busy === 1 ? '' : 'S'} BUSY`;
}

// A role's file as a readout: `ENGINE I/O 38%`, or just its label while it is a ship file the kid
// has not scanned (its damage stays hidden, §3.2).
function fileReading(state: Readonly<GameState>, role: CapabilityRole): string {
  const health = roleHealth(state, role);
  if (health.integrity === null || hiddenShipFile(state, role)) return ROLE_LABEL[role];
  return `${ROLE_LABEL[role]} ${shownIntegrity(health.integrity)}%`;
}

// THRUST LIMIT (C1 + C4, §6.2): the binding cap and its cause. Busy threads are named whenever
// they are what binds (the HACK OR BURN choice); otherwise the file that limits the engine.
export function thrustLimitModel(state: Readonly<GameState>): ThrustLimitModel {
  const caps = capabilitiesNow(state);
  const fault = engineFault(caps);
  if (fault) return { capPct: 0, limited: true, cause: ENGINE_FAULT_BUTTON[fault], text: ENGINE_FAULT_BUTTON[fault] };
  const capPct = percentFloor(thrustCap(caps));
  if (capPct >= 100) return { capPct: 100, limited: false, cause: '', text: '' };
  const busy = threadsBusy();
  let cause: string;
  if (caps.engine.powerCap <= caps.reactor.reactorCap) cause = fileReading(state, 'engine-io');
  else if (busy > 0) cause = threadsBusyText(busy);
  else cause = fileReading(state, 'reactor');
  return { capPct, limited: true, cause, text: `THRUST LIMIT ${capPct}% · ${cause}` };
}

export type ReactorCell = 'think' | 'burn';

export interface ReactorModel {
  cells: ReactorCell[];   // one per REACTOR_THREAD_SHARE of the reactor: a busy thread THINKs
  burnPct: number;        // the reactor's share left for the engine (bandCap × free cells)
  text: string;           // `BURN 50%`
}

// The REACTOR row (C4, §7.1): the reactor's power in cells, each busy Core thread taking one to
// THINK, the rest left to BURN. The percentage is the exact share (a damaged reactor lowers it).
export function reactorModel(state: Readonly<GameState>): ReactorModel {
  const caps = capabilitiesNow(state);
  const count = Math.round(1 / REACTOR_THREAD_SHARE);
  const thinking = Math.min(count, threadsBusy());
  const cells: ReactorCell[] = Array.from({ length: count }, (_unused, i) => (i < thinking ? 'think' : 'burn'));
  const burnPct = percentFloor(caps.reactor.reactorCap);
  return { cells, burnPct, text: `BURN ${burnPct}%` };
}

// How a window pip looks: a band, `unknown` for a ship file not scanned yet (`?`), or `offline`
// while its file is being repaired or moved (the job is done by nothing until it is back).
export type PipLook = Band | 'unknown' | 'offline';

export interface PipModel {
  role: CapabilityRole;
  label: string;     // ENGINE I/O
  look: PipLook;
  glyph: string;     // ● a file, ? not scanned, ↻ offline, ✕ missing
  reading: string;   // `38%` when it is hurt, '' when ok or unknown
  title: string;     // the tooltip: what the band means for the ship (BAND_COPY)
  // WP10: what the file is doing to the ship right now, counted (the THRUST CTRL pip: `FIRED ×3` while the controller
  // fires the engine by itself), so the counter sits on the way to its cause. '' for every other pip.
  count: string;
  // Slice 5 (review B2; Track WARDEN fills them in the THRUST CTRL pip block, windowPip): the file a click jumps to instead of
  // the role's own (WARDEN.sys while a resident fires the engine: pillar 4, the loss's cause), and the overriding mind's
  // words (`OVERRIDDEN · WARDEN.sys`), which the pip shows as data-override for FACE's amber. null: the role's own file, no
  // override.
  jumpId: string | null;
  override: string | null;
}

const PIP_GLYPH: Readonly<Record<PipLook, string>> = {
  ok: '●', degraded: '●', failing: '●', dead: '●', missing: '✕', unknown: '?', offline: '↻',
};

function hiddenShipFile(state: Readonly<GameState>, role: CapabilityRole): boolean {
  const file = getByRole(state, role);
  return !!file && (file.type === 'ship' || file.type === 'ship-backup') && !file.scanned;
}

// One pip per file behind a window (§7.1 title pips, C3: "window title pips name the backing
// file"). A ship file the kid has not scanned is a `?`: its damage stays hidden (§3.2). The THRUST CTRL pip carries
// the uncommanded bursts so far, counted as the warning counts them (ghost-thrust.ts ghostCountShown).
// Slice 5 (Track WARDEN's pip block, plan §2.7 step 3, review B2): while a corrupted resident fires the engine the pip is
// OVERRIDDEN by it (`100% · OVERRIDDEN · WARDEN.sys`: a mind, not a fault, so a healthy controller still reads its 100%),
// its count is the resident's own bursts, and a click jumps to the resident's file (pillar 4: the cause of the loss).
export function windowPip(state: Readonly<GameState>, role: CapabilityRole): PipModel {
  const model = filePip(state, role);
  if (role !== 'thrust-ctrl') return model;
  const fired = ghostCountShown(state);
  const counted = fired === 0 ? model : { ...model, count: GHOST_TEXT.pipCount(fired), title: `${model.title} · ${GHOST_TEXT.pipTitle(fired)}` };
  const by = engineOverriddenBy(state);
  if (by === null) return counted;
  return {
    ...counted,
    reading: counted.reading === '' && counted.look === 'ok' ? WARDEN_TEXT.pipHealthy : counted.reading,
    title: `${counted.title} · ${WARDEN_TEXT.pipTitle(by.name)}`,
    jumpId: by.fileId,
    override: WARDEN_TEXT.pipOverride(by.name),
  };
}

function filePip(state: Readonly<GameState>, role: CapabilityRole): PipModel {
  const label = ROLE_LABEL[role];
  if (hiddenShipFile(state, role)) {
    return {
      role, label, look: 'unknown', glyph: PIP_GLYPH.unknown, reading: '', title: `${label} · not scanned yet: SCAN it in the MIND`, count: '',
      jumpId: null, override: null,
    };
  }
  const health = roleHealth(state, role);
  const look: PipLook = health.offline ? 'offline' : health.band;
  const reading = health.integrity !== null && health.band !== 'ok' && health.band !== 'missing'
    ? `${shownIntegrity(health.integrity)}%`
    : '';
  const title = health.offline
    ? `${label} · ${health.offline === 'repairing' ? 'REPAIRING' : 'OFFLINE'}`
    : BAND_COPY[role][health.band];
  return { role, label, look, glyph: PIP_GLYPH[look], reading, title, count: '', jumpId: null, override: null };
}

// The mode toggle's label for the OTHER screen (§7.1, §9 WP4 item 12): its top problem, so the kid
// flying the ship sees `MIND ▸ ENGINE I/O 38%`, and the kid hacking sees `◀ SHIP · IMPACT 00:20`. With
// nothing more pressing in the mind it names run 1's colonists ask while that stands on the strip
// (LEAD-1: `MIND ▸ CHECK THE 2,400`), so a kid who flies past the strip's line still sees where the mind
// wants them.
export interface ToggleAlert {
  screen: 'tools' | 'memory';   // the screen the alert is about (the one not shown)
  head: string;                 // `MIND ▸` / `◀ SHIP ·`
  body: string;                 // `ENGINE I/O 38%` / `IMPACT 00:20`
  severity: 'alarm' | 'warn';
  hollow: boolean;              // one of HOLLOW's alerts: drawn in its pink (§5.1 "the toggle flashes pink")
}

// The AI files whose damage hurts the flight, most urgent first: the mind side of the toggle names
// the first one that is failing or worse (and not already being fixed).
const MIND_ALERT_ROLES: readonly CapabilityRole[] = ['engine-io', 'core', 'navplot', 'sensor', 'autopilot', 'telemetry', 'comms'];

export function toggleAlert(state: Readonly<GameState>, pred: Prediction): ToggleAlert | null {
  const flying = state.run.phase === 'flight' && state.burn.status === 'approaching';
  // While landing the mind can still call (WP6: HOLLOW eating a driver after the lock): its alerts still point the way
  // from amber; and from blue, an open window calls the kid back to launch (01-landing §4: `◀ SHIP · LZ-A OPEN`).
  if (!flying && state.run.phase !== 'landing') return null;
  if (state.run.coreLost) return null;
  if (state.ui.mode === 'tools') {
    const mindAlerts = state.alerts.list.filter((alert) => alert.layer === 'mind' && alert.severity !== 'info');
    const top = mindAlerts.find((alert) => alert.severity === 'alarm') ?? mindAlerts[0];
    if (top) return { screen: 'memory', head: 'MIND ▸', body: top.text, severity: top.severity === 'alarm' ? 'alarm' : 'warn', hollow: isHollowAlert(top) };
    if (!flying) return null;
    for (const role of MIND_ALERT_ROLES) {
      const health = roleHealth(state, role);
      if (health.offline || hiddenShipFile(state, role)) continue;
      if (health.band === 'failing' || health.band === 'dead' || health.band === 'missing') {
        return { screen: 'memory', head: 'MIND ▸', body: fileReading(state, role), severity: 'warn', hollow: false };
      }
    }
    return null;
  }
  if (!flying) {
    const open = state.landing.window;
    const launchable = state.landing.ended === null && state.landing.pods.some((record) => record.fate.kind === 'aboard');
    if (open === null || !launchable) return null;
    return { screen: 'tools', head: '◀ SHIP ·', body: LANDING_PLOT_TEXT.chipOpen(open.lz), severity: 'warn', hollow: false };
  }
  // WP10: the engine firing by itself for the first time, when it is the ship's only alarm (an IMPACT's countdown
  // outranks it), is named, not a countdown: the kid hacking in blue learns what just happened out there.
  const shipAlarms = state.alerts.list.filter((alert) => alert.layer === 'ship' && alert.severity === 'alarm');
  if (shipAlarms.length === 1 && shipAlarms[0]!.id === GHOST_ALARM_ID) {
    return { screen: 'tools', head: '◀ SHIP ·', body: shipAlarms[0]!.text, severity: 'alarm', hollow: false };
  }
  const chip = countdownChip(state, pred);
  const shipAlarm = shipAlarms.length > 0;
  if (chip && (shipAlarm || chip.urgent)) {
    return { screen: 'tools', head: '◀ SHIP ·', body: `${chip.event} ${chip.time}`, severity: shipAlarm ? 'alarm' : 'warn', hollow: false };
  }
  // WP10: the engine still firing by itself, counted (`◀ SHIP · UNCOMMANDED THRUST ×3`): a kid hacking in blue
  // hears the rumble and sees why, without a countdown to point at.
  const ghost = state.alerts.list.find((alert) => alert.id === GHOST_WARN_ID);
  if (ghost) return { screen: 'tools', head: '◀ SHIP ·', body: ghost.text, severity: 'warn', hollow: false };
  return null;
}

// --- THE DEAL on the ticker (WP10) ---------------------------------------------------------------

// A TERMINAL choice still standing, as the ticker shows it on the other screen: its words, the way there and its clock
// (`WANTS A DEAL · [TAB] 0:12`, after the speaker's tag), urgent in its last CHOICE_URGENT_SEC. While its line is still
// typing the timer has not started, and the ticker shows no clock (WP10 review: `0:15` standing still for the ~10 s
// the offer queued and typed behind the wake's bite echoes read as a broken countdown). null for a line with no choice
// open, or a choice with no ticker words (the ticker then shows the line itself).
export function choiceTicker(state: Readonly<GameState>, entry: Readonly<LogEntry>): { text: string; urgent: boolean } | null {
  const choice = entry.choice;
  if (!choice?.open || choice.tickerWords === null) return null;
  if (!choiceTimerRunning(state, entry)) return { text: `${choice.tickerWords} · [TAB]`, urgent: false };
  const left = choiceSecondsLeft(choice);
  return { text: `${choice.tickerWords} · [TAB] ${formatTac(left)}`, urgent: left <= CHOICE_URGENT_SEC };
}

// A HOLLOW verb's telegraph as it reads now (`> unlink repair.bak ... 2`): its number from the live verb, the way the
// TERMINAL counts it (WP11 part 2) and the ticker shows it from amber (WP11 review: the ticker kept `... 3` while the
// strip counted 2, 1). null while no verb counts down. Slice 5 (review m3): a corrupted resident's lock line (`speaker`
// 'resident') counts down from its own lock (state/resident-selectors.ts liveLockText, WARDEN's), never from HOLLOW's verb.
export function liveVerbText(state: Readonly<GameState>, speaker: Speaker = 'hollow-cmd'): string | null {
  if (speaker === 'resident') return liveLockText(state);
  const verb = state.hollow.verb;
  return verb === null ? null : HOLLOW_VERB.telegraph(verb.kind, verb.targetWord, verbSecondsLeft(verb));
}

// The amber MIND chip (§9 WP4 item 11): the mind at a glance from the ship screen.
export interface MindChipModel {
  busy: number;
  total: number;
  charge: number;
}

export function mindChipModel(state: Readonly<GameState>): MindChipModel {
  const busy = threadsBusy();
  return { busy, total: Math.max(threadsTotal(), busy), charge: chargeLeft(state) };
}

// --- Telemetry -------------------------------------------------------------------------------

export interface TelemetryModel {
  speed: string;      // km/s
  altitude: string;   // km above the surface
  // MM:SS to ▼, or — when no ▼ is ahead (passed, or the planet comes first), a burn is under way, or
  // ACCEPT ORBIT is the only way on (pace.ts apsisTimesHidden)
  timeToPeri: string;
}

export function telemetryModel(state: Readonly<GameState>, pred: Prediction): TelemetryModel {
  const { x, y, vx, vy } = state.orbit;
  const altitude = Math.max(0, Math.hypot(x, y) - state.level.planet.R);
  const periInSec = pred.outcome === 'impact' ? null : pred.periInSec;
  return {
    speed: Math.hypot(vx, vy).toFixed(2),
    altitude: Math.round(altitude).toLocaleString('en-US'),
    timeToPeri: periInSec === null || apsisTimesHidden(state, pred)
      ? NO_APSIS_TIME
      : formatCountdown(tac(Math.max(0, secUntil(pred, periInSec, state.clock.tSec)), state.level.tacticalWarp)),
  };
}

// --- Objective strip -------------------------------------------------------------------------

// What the strip says once the flight is over (the result banner explains the rest).
export const FLIGHT_OVER_LINE: Record<TerminalStatus, string> = {
  locked: TERMINAL.locked.word,
  accepted: TERMINAL.accepted.word,
  stranded: TERMINAL.stranded.word,
  escaped: TERMINAL.escaped.word,
  crashed: TERMINAL.crashed.word,
  abandoned: TERMINAL.abandoned.word,
};
