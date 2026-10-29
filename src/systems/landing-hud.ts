import type { GameState } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import type {
  DropFactors, DropSolution, LzState, LzWindow, NoGoArcState, Place, PodRecord, Touch, TerrainWord,
} from '@/types/landing';
import { elementsFromState, propagateConic, semiMajorAxis, type Vec2 } from '@/types/orbit';
import { driversInMemory } from '@state/selectors';
import { angleDelta, dropHalfWidthKm, secFromNow } from '@systems/landing-solve';
import {
  bayMembers, bayShown, driverTouch, isLaunchable, launchGuard, launchRefusal, lzAt, lzDownFill, lzProjectedFill, nextToLaunch,
  launchMomentInSec, onTargetTally, targetWindow,
} from '@systems/landing-rules';
import {
  BAND_TEXT, GROUND_TRACK_TEXT, LANDING_HUD_TEXT, LANDING_PLOT_TEXT, LAUNCH_REFUSAL_TEXT, MINI_LANDING_TEXT, POD_BAY_STATUS_TEXT,
  POD_BAY_TEXT, DRIVER_DETAIL_TEXT, LAUNCH_CONFIRM_TEXT, minSec,
} from '@data/landing-text';
import {
  BAND_FAILING_MIN, BAY_RELOAD_TAC, BAY_SLOTS, BEACON_LAG_FRAC, GROUND_TRACK_AHEAD_MAX, GROUND_TRACK_SPAN_KM, POD_FIRST_DESCENT_SEC,
  STREAK_TRAIL_FRAC,
} from '@data/tuning';

// What the landing's own screens show (01-landing §4), as plain data: the NAV PLOT's brackets, dot, pod arc, streaks,
// landing marks and parked-pod beacons (plotLandingModel), the GROUND TRACK panel (groundTrackModel), the POD BAY
// window (bayWindowModel), the MIND's BAY / NEXT tags (podTags), a driver's predicted landing (driverLanding), the
// footer's pods (footerPods) and the mini-HUD's landing rows (miniHudLanding). Pure and DOM-free like flight-hud.ts:
// every function takes the state and, where it draws the drop, the drop solution, which the component reads from
// drop-cache's getDropSolution() (never currentDropSolution: that one re-solves on every call). "Window open now" is
// read from state.landing.window only (landing.ts writes it), so the strip, the brackets and [L] agree.
//
// Extendable as data (later slices fill what 1a leaves empty): no-go arcs (1b), out-of-band stretches (the windows a
// PARTIAL orbit can't use; 1b's decay), survey candidate brackets, drawn dashed (slice 6, `candidate`), and terrain
// glyphs per stretch of ground (slice 6's mapped terrain; 1a draws the planet's one terrain word everywhere).

// --- Shared pieces ------------------------------------------------------------------------------------------------------

function tacOf(state: Readonly<GameState>, gameSec: number): number {
  return gameSec / state.level.tacticalWarp;
}

// An LZ's counters (§3.5 "the counters show everywhere"): pods down in it (touchdown order, MISLANDED's fill), the
// projected fill (down plus falling into it: what [L]'s guard reads), and its count in pods.
export interface LzCounter {
  lz: string;
  down: number;
  projected: number;
  count: number;
  full: boolean;          // by the projected fill: a pod launched now at it would be mislanded
  text: string;           // `LZ-A 1/3`, `LZ-A 3/3 ✓`
}

export function lzCounters(state: Readonly<GameState>): LzCounter[] {
  const down = lzDownFill(state);
  const projected = lzProjectedFill(state);
  return state.landing.lzs.map((lz) => {
    const shownDown = down[lz.label] ?? 0;
    const shownProjected = projected[lz.label] ?? 0;
    return {
      lz: lz.label, down: shownDown, projected: shownProjected, count: lz.pods, full: shownProjected >= lz.pods,
      text: LANDING_PLOT_TEXT.bracket(lz.label, shownDown, lz.pods),
    };
  });
}

// How a bracket looks (§4): `full` once its count is reached (by the projected fill), else `open` while the dot's centre
// is in it in the band (the GROUND TRACK's bright dashed bracket), `sure` while the whole dot fits (green), `target` for
// the LZ the next window opens for, `idle` otherwise. `candidate` is SURVEY's dashed bracket (slice 6).
export type BracketLook = 'idle' | 'target' | 'open' | 'sure' | 'full' | 'candidate';

export interface BracketModel {
  lz: string;
  centreRad: number;
  halfWidthRad: number;
  widthKm: number;
  down: number;
  count: number;
  look: BracketLook;
  label: string;          // `LZ-A 1/3`
  outOfBand: boolean;     // its next window can't be launched from inside the band (a PARTIAL orbit): hatched
}

function windowOf(sol: Readonly<DropSolution> | null, lz: string): LzWindow | null {
  return sol?.windows.find((w) => w.lz === lz) ?? null;
}

export function bracketModels(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): BracketModel[] {
  const { landing } = state;
  const target = targetWindow(state, sol, state.clock.tSec);
  const counters = lzCounters(state);
  return landing.lzs.map((lz, i) => {
    const counter = counters[i]!;
    const win = windowOf(sol, lz.label);
    // Full first: a green bracket says "launch here", and a pod launched into a full LZ is mislanded.
    let look: BracketLook = 'idle';
    if (counter.full) look = 'full';
    else if (landing.window?.lz === lz.label) look = landing.window.sure ? 'sure' : 'open';
    else if (target?.lz === lz.label) look = 'target';
    return {
      lz: lz.label, centreRad: lz.centreRad, halfWidthRad: lz.halfWidthRad, widthKm: lz.widthKm, down: counter.down,
      count: lz.pods, look, label: counter.text, outOfBand: win !== null && !win.inBand,
    };
  });
}

// The drop dot (§3.3): where a pod launched now would land, how wide, whether the ship is in the band (grey outside),
// which bracket its centre is in and whether the whole dot fits there, and how centred it is (0 at the bracket's edge,
// 1 dead centre: the window tone's pitch, §4).
export interface DotModel {
  rad: number;
  halfWidthKm: number;
  halfWidthRad: number;
  inBand: boolean;
  lz: string | null;
  fits: 'none' | 'centre' | 'whole';
  centredness: number | null;
}

export function dropDotModel(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): DotModel | null {
  const dot = sol?.dot ?? null;
  if (sol === null || sol.block !== null || dot === null) return null;
  const R = state.level.planet.R;
  const halfWidthRad = dot.halfWidthKm / R;
  const lz = lzAt(state.landing.lzs, dot.rad);
  let fits: DotModel['fits'] = 'none';
  let centredness: number | null = null;
  if (lz !== null) {
    const off = Math.abs(angleDelta(lz.centreRad, dot.rad));
    fits = off + halfWidthRad <= lz.halfWidthRad ? 'whole' : 'centre';
    centredness = Math.max(0, Math.min(1, 1 - off / lz.halfWidthRad));
  }
  return { rad: dot.rad, halfWidthKm: dot.halfWidthKm, halfWidthRad, inBand: dot.inBand, lz: lz?.label ?? null, fits, centredness };
}

// The window tone (§4: lockTone(fraction), fraction = how centred the dot is), or null: silent unless a window is open
// now (state.landing.window) and the dot sits in that window's bracket.
export function windowToneFraction(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): number | null {
  const open = state.landing.window;
  if (state.run.phase !== 'landing' || open === null || state.clock.paused) return null;
  const dot = dropDotModel(state, sol);
  if (dot === null || dot.lz !== open.lz) return null;
  return dot.centredness;
}

// --- The NAV PLOT (§4) --------------------------------------------------------------------------------------------------

// A falling pod's streak along its fixed arc (LaunchRecord.arc, decided at launch), run over its descentSec of AI time:
// the trail behind the head, the head itself, and whether it is below the atmosphere line (white-hot).
export interface StreakModel {
  pod: number;
  trail: Vec2[];          // world km, oldest first, ending at the head
  head: Vec2;
  progress: number;       // 0 at launch, 1 at touchdown
  hot: boolean;           // the head is inside the atmosphere: the entry flare
  first: boolean;         // run 1's first pod (the slower, brighter streak)
}

// The arc bent so it ends where the pod really lands: the solver's arc ends at the dot's centre, the pod at
// dotRad + u × s (≤ the drop width away), so the arc turns by that much, growing along it.
function bentArc(arc: readonly Vec2[], turnRad: number): Vec2[] {
  const last = arc.length - 1;
  return arc.map((point, i) => {
    const angle = (turnRad * i) / Math.max(1, last);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
  });
}

function pointAlong(arc: readonly Vec2[], at: number): Vec2 {
  const scaled = Math.max(0, Math.min(1, at)) * (arc.length - 1);
  const i = Math.min(arc.length - 2, Math.floor(scaled));
  const a = arc[i]!;
  const b = arc[i + 1]!;
  const t = scaled - i;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function podStreaks(state: Readonly<GameState>): StreakModel[] {
  const aiNow = state.clock.aiSec;
  const rAtm = state.level.planet.rAtm;
  const streaks: StreakModel[] = [];
  for (const record of state.landing.pods) {
    if (record.fate.kind !== 'falling') continue;
    const launch = record.fate.launch;
    if (launch.arc.length < 2) throw new Error(`podStreaks: pod ${record.pod}'s arc has ${launch.arc.length} points`);
    const arc = bentArc(launch.arc, angleDelta(launch.dotRad, launch.landingRad));
    const progress = Math.max(0, Math.min(1, (aiNow - launch.atAi) / launch.descentSec));
    const head = pointAlong(arc, progress);
    const from = Math.max(0, progress - STREAK_TRAIL_FRAC);
    const trail: Vec2[] = [pointAlong(arc, from)];
    const last = arc.length - 1;
    for (let i = Math.ceil(from * last); i < progress * last; i++) trail.push(arc[i]!);
    trail.push(head);
    streaks.push({
      pod: record.pod, trail, head, progress, hot: Math.hypot(head.x, head.y) < rAtm,
      first: launch.descentSec >= POD_FIRST_DESCENT_SEC,
    });
  }
  return streaks;
}

// A pod down on the surface (§4: `◘` where it landed), in its place's colour.
export interface LandMark {
  pod: number;
  rad: number;
  place: Place;
  touch: Touch;
  lz: string | null;
}

export function landMarks(state: Readonly<GameState>): LandMark[] {
  return state.landing.pods.flatMap((record) => (record.fate.kind === 'down'
    ? [{ pod: record.pod, rad: record.fate.launch.landingRad, place: record.fate.touchdown.place, touch: record.fate.touchdown.touch, lz: record.fate.touchdown.lz }]
    : []));
}

// The pods parked in orbit (§3.10), riding the ship's orbit as small blinking beacons, BEACON_LAG_FRAC of a period
// apart behind the ship (they left it when the landing ended).
export interface Beacon {
  pod: number;
  pos: Vec2;
}

export function parkedBeacons(state: Readonly<GameState>): Beacon[] {
  const parked = state.landing.pods.filter((record) => record.fate.kind === 'parked');
  if (parked.length === 0) return [];
  const { mu } = state.level.planet;
  const el = elementsFromState(state.orbit, mu);
  if (!(el.e < 1)) return [];
  const a = semiMajorAxis(el);
  const period = 2 * Math.PI * Math.sqrt((a * a * a) / mu);
  return parked.map((record, i) => {
    // Behind the ship by (i + 1) lags: forward by the rest of the period.
    const at = propagateConic(state.orbit, mu, period * (1 - BEACON_LAG_FRAC * (i + 1)));
    return { pod: record.pod, pos: { x: at.x, y: at.y } };
  });
}

export interface NoGoModel {
  centreRad: number;
  halfWidthRad: number;
  word: string;
}

function noGoModels(noGo: readonly NoGoArcState[]): NoGoModel[] {
  return noGo.map((arc) => ({ centreRad: arc.centreRad, halfWidthRad: arc.halfWidthRad, word: arc.word }));
}

// The NAV PLOT's ring name (§4): `SAFE ORBIT · LAUNCH BAND` in flight, `LAUNCH BAND` while landing.
export function ringLabel(state: Readonly<GameState>): string {
  return state.run.phase === 'landing' ? BAND_TEXT.ringLanding : BAND_TEXT.ringFlight;
}

export interface PlotLandingModel {
  brackets: BracketModel[];
  noGo: NoGoModel[];
  dot: DotModel | null;
  arc: { points: Vec2[]; inBand: boolean } | null;   // dotted bright amber, grey outside the band
  streaks: StreakModel[];
  marks: LandMark[];
  beacons: Beacon[];
}

// Everything the landing adds to the NAV PLOT, or null outside LANDING.
export function plotLandingModel(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): PlotLandingModel | null {
  if (state.run.phase !== 'landing') return null;
  const dot = dropDotModel(state, sol);
  const aboard = state.landing.ended === null && state.landing.pods.some((record) => record.fate.kind === 'aboard');
  const arc = dot !== null && aboard && sol !== null && sol.arc.length >= 2 ? { points: sol.arc, inBand: dot.inBand } : null;
  return {
    brackets: bracketModels(state, sol),
    noGo: noGoModels(state.landing.noGo),
    dot: aboard ? dot : null,
    arc,
    streaks: podStreaks(state),
    marks: landMarks(state),
    beacons: parkedBeacons(state),
  };
}

// --- The GROUND TRACK (§4) ----------------------------------------------------------------------------------------------

// A span on one of the panel's lines, as fractions of its width (the strip's may run past 0..1: the component clips).
export interface Span {
  from: number;
  to: number;
}

export interface GroundBracket extends Span {
  lz: string;
  look: BracketLook;
  label: string;          // `[ LZ-A · 1/3 ]`
  outOfBand: boolean;
}

export interface GroundMark {
  pod: number;
  at: number;             // fraction across the line
  place: Place;
  touch: Touch;
}

export interface GroundAhead {
  lz: string;
  text: string;           // `LZ-B ▸ 2:10`
  open: boolean;
  full: boolean;
}

// The terrain glyph rows (§4: `≈` water, `·` plains, `^` rock, red `////` no-go). A stretch of the strip and its glyph;
// in 1a one stretch with the planet's terrain word everywhere, slice 6's survey maps more.
export interface TerrainStretch extends Span {
  glyph: string;
}

const TERRAIN_GLYPH: Readonly<Record<TerrainWord, string>> = {
  PLAINS: '·',
  GRASSLAND: '"',
  OCEAN: '≈',
  VOLCANIC: '^',
};

export function terrainGlyph(terrain: TerrainWord): string {
  return TERRAIN_GLYPH[terrain];
}

export interface GroundTrackModel {
  header: string;               // KEPLER-186F · RIVERSIDE
  // The whole planet unrolled, 0..1 starting at angle 0 in the direction of travel.
  planet: {
    brackets: GroundBracket[];
    noGo: Span[];
    outOfBand: Span[];
    marks: GroundMark[];
    dot: number | null;
    view: Span;                 // the main strip's stretch of it
  };
  // The main strip: GROUND_TRACK_SPAN_KM of surface under the fixed central dot; ahead is to the right.
  strip: {
    spanKm: number;
    groundKm: number;           // the ground under the dot, in km from angle 0 (the glyph rows scroll by it)
    terrain: TerrainStretch[];
    brackets: GroundBracket[];
    noGo: (Span & { word: string })[];
    marks: GroundMark[];
    dot: { half: number; inBand: boolean; fits: DotModel['fits']; text: string } | null;
    ahead: GroundAhead[];
  };
  blocked: string | null;       // NO DROP SOLUTION (and nothing on the strip but the ground)
  outOfBand: boolean;           // the ship is outside the launch band now: the dot greys
}

function travelSign(state: Readonly<GameState>): 1 | -1 {
  const { x, y, vx, vy } = state.orbit;
  return x * vy - y * vx >= 0 ? 1 : -1;
}

// An angle's place on the unrolled planet line (0..1 from angle 0 along the travel direction).
function planetFrac(rad: number, sign: 1 | -1): number {
  const turn = (sign * rad) / (2 * Math.PI);
  return turn - Math.floor(turn);
}

export function groundTrackModel(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): GroundTrackModel {
  const { landing } = state;
  const R = state.level.planet.R;
  const sign = travelSign(state);
  const dot = dropDotModel(state, sol);
  const brackets = bracketModels(state, sol);
  const marks = landMarks(state);
  // With no dot the strip centres on the ship's own ground point, so the brackets still scroll by.
  const centreRad = dot?.rad ?? Math.atan2(state.orbit.y, state.orbit.x);
  const spanKm = GROUND_TRACK_SPAN_KM;
  const stripAt = (rad: number): number => 0.5 + (sign * angleDelta(centreRad, rad) * R) / spanKm;
  const stripSpan = (centre: number, half: number): Span => {
    const mid = stripAt(centre);
    const halfFrac = (half * R) / spanKm;
    return { from: mid - halfFrac, to: mid + halfFrac };
  };
  const planetSpan = (centre: number, half: number): Span => {
    const mid = planetFrac(centre, sign);
    const halfFrac = half / (2 * Math.PI);
    return { from: mid - halfFrac, to: mid + halfFrac };
  };
  const bracketOn = (model: BracketModel, span: Span, label: string): GroundBracket => ({
    ...span, lz: model.lz, look: model.look, label, outOfBand: model.outOfBand,
  });
  const stripBrackets = brackets.map((model) => bracketOn(model, stripSpan(model.centreRad, model.halfWidthRad),
    GROUND_TRACK_TEXT.bracket(model.lz, model.down, model.count)));
  const onStrip = (span: Span): boolean => span.to > 0 && span.from < 1;

  // The next LZs past the right edge, soonest window first, with its countdown.
  const now = state.clock.tSec;
  const ahead: GroundAhead[] = [];
  if (sol !== null && sol.block === null) {
    const counters = lzCounters(state);
    const waiting = sol.windows
      // To the launch moment where there is one (the strip's and the chip's count), else to the opening.
      .map((w) => ({ w, inSec: launchMomentInSec(sol, w, now) ?? secFromNow(sol, w.openInSec, now) }))
      .filter(({ w }) => {
        const bracket = stripBrackets.find((b) => b.lz === w.lz);
        return bracket !== undefined && bracket.from >= 1;
      })
      .sort((a, b) => a.inSec - b.inSec)
      .slice(0, GROUND_TRACK_AHEAD_MAX);
    for (const { w, inSec } of waiting) {
      const full = counters.find((counter) => counter.lz === w.lz)?.full ?? false;
      const open = inSec <= 0;
      const text = full ? GROUND_TRACK_TEXT.aheadFull(w.lz)
        : open ? GROUND_TRACK_TEXT.aheadOpen(w.lz) : GROUND_TRACK_TEXT.ahead(w.lz, minSec(tacOf(state, inSec)));
      ahead.push({ lz: w.lz, text, open, full });
    }
  }

  const blocked = sol !== null && sol.block !== null ? GROUND_TRACK_TEXT.noSolution
    : dot === null ? GROUND_TRACK_TEXT.noDot : null;
  const viewHalf = spanKm / 2 / R;
  const viewMid = planetFrac(centreRad, sign);
  const viewHalfFrac = viewHalf / (2 * Math.PI);
  return {
    header: GROUND_TRACK_TEXT.header(state.mission.destination, landing.colony),
    planet: {
      brackets: brackets.map((model) => bracketOn(model, planetSpan(model.centreRad, model.halfWidthRad), model.lz)),
      noGo: landing.noGo.map((arc) => planetSpan(arc.centreRad, arc.halfWidthRad)),
      outOfBand: brackets.filter((model) => model.outOfBand).map((model) => planetSpan(model.centreRad, model.halfWidthRad)),
      marks: marks.map((mark) => ({ pod: mark.pod, at: planetFrac(mark.rad, sign), place: mark.place, touch: mark.touch })),
      dot: dot === null ? null : planetFrac(dot.rad, sign),
      view: { from: viewMid - viewHalfFrac, to: viewMid + viewHalfFrac },
    },
    strip: {
      spanKm,
      groundKm: sign * centreRad * R,
      terrain: [{ from: 0, to: 1, glyph: terrainGlyph(landing.terrain) }],
      brackets: stripBrackets.filter(onStrip),
      noGo: landing.noGo.map((arc) => ({ ...stripSpan(arc.centreRad, arc.halfWidthRad), word: arc.word })).filter(onStrip),
      marks: marks.map((mark) => ({ pod: mark.pod, at: stripAt(mark.rad), place: mark.place, touch: mark.touch }))
        .filter((mark) => mark.at >= 0 && mark.at <= 1),
      dot: dot === null ? null : {
        half: dot.halfWidthKm / spanKm, inBand: dot.inBand, fits: dot.fits, text: GROUND_TRACK_TEXT.drop(dot.halfWidthKm),
      },
      ahead,
    },
    blocked,
    outOfBand: dot !== null && !dot.inBand,
  };
}

// --- The POD BAY window (§4) --------------------------------------------------------------------------------------------

// [ L · LAUNCH POD ]: `go` when [L] would launch into an open window now, `asks` when it would launch after a confirm
// (the dot off-site, or its LZ full), `blocked` with the refusal's words otherwise.
export type LaunchLook = 'go' | 'asks' | 'blocked';

export interface BayWindowModel {
  launch: { label: string; look: LaunchLook; status: string };
  bay: { shown: number; loaded: number; slots: number; reloadTac: number | null; text: string };
  next: { pod: number; family: string; touch: Touch; halfWidthKm: number | null; text: string } | null;
  nextText: string;                 // the NEXT line, or why there is none
  lzs: LzCounter[];
  cantLaunch: number;               // pods aboard that can't launch now
  aboard: number;
  endLanding: { label: string; confirm: string; enabled: boolean };
}

function podsAboard(state: Readonly<GameState>): PodRecord[] {
  return state.landing.pods.filter((record) => record.fate.kind === 'aboard');
}

export function bayWindowModel(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): BayWindowModel {
  const { landing } = state;
  const shown = bayShown(state);
  const reloading = landing.bay.loaded < BAY_SLOTS;
  const reloadTac = reloading ? Math.max(0, BAY_RELOAD_TAC - landing.bay.reloadTac) : null;
  const refusal = launchRefusal(state, sol, { source: 'player', fromMind: false });
  const aboard = podsAboard(state);
  let look: LaunchLook = 'blocked';
  let status = refusal === null ? POD_BAY_STATUS_TEXT.ready : LAUNCH_REFUSAL_TEXT[refusal];
  // In the MIND the window isn't on screen; the button still says what it would do from amber.
  if (refusal === 'SHIP SCREEN') status = POD_BAY_STATUS_TEXT.ready;
  if (refusal === null || refusal === 'SHIP SCREEN') {
    // No guard: the dot is in a bracket with room, in the band, so the window is open (or opens on this AI tick).
    const guard = sol !== null ? launchGuard(state, sol) : null;
    look = guard === null ? 'go' : 'asks';
    if (guard !== null) status = guard.ask === 'full' && guard.lz !== null ? POD_BAY_STATUS_TEXT.full(guard.lz) : POD_BAY_STATUS_TEXT.offSite;
  }
  if (aboard.length === 0) status = POD_BAY_STATUS_TEXT.allAway;

  const nextDriver = nextToLaunch(state);
  const next = nextDriver === null ? null : driverLanding(state, nextDriver, sol);
  const launchable = new Set(driversInMemory(state).filter(isLaunchable).map((driver) => driver.pod));
  const cantLaunch = aboard.filter((record) => !launchable.has(record.pod)).length;
  return {
    launch: { label: POD_BAY_TEXT.launch, look, status },
    bay: { shown, loaded: landing.bay.loaded, slots: BAY_SLOTS, reloadTac, text: POD_BAY_TEXT.bay(shown, BAY_SLOTS, reloadTac) },
    next: nextDriver === null || next === null ? null : {
      pod: nextDriver.pod, family: nextDriver.family, touch: driverTouch(nextDriver.integrity), halfWidthKm: next.halfWidthKm,
      text: POD_BAY_TEXT.next(nextDriver.pod, nextDriver.family, driverTouch(nextDriver.integrity), next.halfWidthKm ?? 0),
    },
    nextText: nextDriver === null ? (aboard.length === 0 ? POD_BAY_STATUS_TEXT.allAway : POD_BAY_STATUS_TEXT.noNext)
      : POD_BAY_TEXT.next(nextDriver.pod, nextDriver.family, driverTouch(nextDriver.integrity), next?.halfWidthKm ?? 0),
    lzs: lzCounters(state),
    cantLaunch,
    aboard: aboard.length,
    endLanding: {
      label: POD_BAY_TEXT.endLanding, confirm: LAUNCH_CONFIRM_TEXT.endLanding(aboard.length),
      enabled: landing.ended === null && state.run.phase === 'landing',
    },
  };
}

// --- The MIND ------------------------------------------------------------------------------------------------------------

// The BAY / NEXT tags (§3.4): the next launchable drivers the bay holds slots for say BAY, the very next one NEXT.
export type PodTag = 'BAY' | 'NEXT';

export function podTags(state: Readonly<GameState>): Map<number, PodTag> {
  const tags = new Map<number, PodTag>();
  if (state.run.phase !== 'landing' || state.landing.ended !== null) return tags;
  const { bay, next } = bayMembers(state);
  for (const pod of bay) tags.set(pod, DRIVER_DETAIL_TEXT.tagBay);
  if (next !== null) tags.set(next, DRIVER_DETAIL_TEXT.tagNext);
  return tags;
}

// How a driver's pod would land if it launched now (§3.8 detail panel): soft with its drop width, hard, or not at all.
export type DriverOutlook = 'soft' | 'hard' | 'cant';

export interface DriverLanding {
  outlook: DriverOutlook;
  halfWidthKm: number | null;   // null: no drop to judge (no solution, or below the surface)
  text: string;                 // `WILL LAND SOFT · DROP ±78 km`, `WILL LAND HARD`, `CAN'T LAUNCH — REPAIR IT`
  tag: PodTag | null;
}

// `factors`: the drop width's multipliers for this driver (landing-rules dropFactors(caps, driver), all 1 in 1a); a
// component passes them so this stays free of the capabilities' live thread count.
export function driverLanding(
  state: Readonly<GameState>, driver: Readonly<DriverSegment>, sol: Readonly<DropSolution> | null,
  factors: DropFactors = { sensor: 1, plotter: 1, driver: 1 },
): DriverLanding {
  const outlook: DriverOutlook = driver.integrity < BAND_FAILING_MIN ? 'cant' : driverTouch(driver.integrity);
  const R = state.level.planet.R;
  const radius = sol?.dot?.launchRadius ?? Math.hypot(state.orbit.x, state.orbit.y);
  const halfWidthKm = radius > R ? dropHalfWidthKm(radius, R, factors) : null;
  const text = outlook === 'cant' ? DRIVER_DETAIL_TEXT.cantLaunch
    : outlook === 'hard' ? DRIVER_DETAIL_TEXT.hard
      : halfWidthKm === null ? 'WILL LAND SOFT' : DRIVER_DETAIL_TEXT.soft(halfWidthKm);
  return { outlook, halfWidthKm, text, tag: podTags(state).get(driver.pod) ?? null };
}

// The footer (§4): `PODS: 8 ABOARD · 3 LANDED · 1 CAN'T LAUNCH`, in pods. CAN'T LAUNCH counts the pods aboard whose
// driver is gone or can't launch right now (dead, infected, busy).
export interface FooterPods {
  aboard: number;
  landed: number;
  cantLaunch: number;
  text: string;
}

export function footerPods(state: Readonly<GameState>): FooterPods {
  const launchable = new Set(driversInMemory(state).filter(isLaunchable).map((driver) => driver.pod));
  let aboard = 0;
  let landed = 0;
  let cantLaunch = 0;
  for (const record of state.landing.pods) {
    if (record.fate.kind === 'down') landed++;
    if (record.fate.kind !== 'aboard') continue;
    aboard++;
    if (!launchable.has(record.pod)) cantLaunch++;
  }
  return { aboard, landed, cantLaunch, text: LANDING_HUD_TEXT.footer(aboard, landed, cantLaunch) };
}

// The mini-HUD's landing rows in blue (§4): the next window (`LZ-A OPEN`, `LZ-B IN 2:10`), the bay, the pods down, and
// the ON TARGET star as it stands (`★ ON TARGET 5/6`: gold while earned, the hurt yellow while it can still be, an
// empty star once it can't).
export interface MiniHudLanding {
  window: { text: string; open: boolean } | null;
  bay: string;
  down: string;
  onTarget: { text: string; tone: 'good' | 'risk' | 'lost' };
}

export function miniHudLanding(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): MiniHudLanding | null {
  if (state.run.phase !== 'landing') return null;
  const { landing } = state;
  const now = state.clock.tSec;
  const aboard = podsAboard(state).length;
  let window: MiniHudLanding['window'] = null;
  if (aboard === 0 || landing.ended !== null) window = { text: MINI_LANDING_TEXT.allAway, open: false };
  else {
    // Counting to the launch moment (the strip's GET READY), OPEN once it has come.
    const next = targetWindow(state, sol, now);
    const inSec = next === null || sol === null ? null : launchMomentInSec(sol, next, now);
    if (landing.window !== null && (landing.window.sure || inSec === null || inSec <= 0)) {
      window = { text: MINI_LANDING_TEXT.windowOpen(landing.window.lz), open: true };
    } else if (next !== null && inSec !== null) {
      window = { text: MINI_LANDING_TEXT.windowIn(next.lz, minSec(tacOf(state, inSec))), open: false };
    }
  }
  const down = landing.pods.filter((record) => record.fate.kind === 'down').length;
  const tally = onTargetTally(state);
  const tone = tally.earned ? 'good' : tally.possible ? 'risk' : 'lost';
  return {
    window,
    bay: MINI_LANDING_TEXT.bay(bayShown(state), BAY_SLOTS),
    down: MINI_LANDING_TEXT.down(down, landing.pods.length),
    onTarget: { text: `${tone === 'lost' ? '☆' : '★'} ${LANDING_HUD_TEXT.onTarget(tally.onTargetPods, tally.pods)}`, tone },
  };
}

// The LZ a touchdown float rises from on the plot and the strip (`+200 LANDED · LZ-A`): its bracket, else the landing
// point itself (off-site).
export function lzOf(lzs: readonly LzState[], label: string | null): LzState | null {
  return label === null ? null : lzs.find((lz) => lz.label === label) ?? null;
}
