// Slice 7b: the FOUNDATION swapped its drivers-to-launch reads to selectors launchDrivers (slice-7-plan R24: THE LAST
// LANDING's radio drivers are never in memory); nothing else here changed.
// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §2.1, §3.2–§3.4, §3.6, §7.2). Pure: AUTODROP's
// volleys, the bay's count by a moment, v2's pass rows, v3's plan and the drop demos' offsets (03 §3.3, §3.8; 01 §3.2–§3.4).
// Everything reads the state and the cached drop solution (LandingView) and changes nothing, so the controller
// (autodrop.ts), the POD BAY window, the guidance slot and the suites share one answer.
//
// Times. A LzWindow's times are game seconds from its solution's asOfTSec; everything here works in absolute game time
// (WindowAt), rolled to "now" by landing-rules windowsAsOf, so a plan made a tick ago still names the same moments.
//
// The sure part of a window (01 §3.2) is where the whole dot (± s) lies inside the bracket. The drop solution solves it for
// the next pod's drop width (drop-cache: nextToLaunch's factors). v3 sends named pods, each with its own driver factor, so
// it judges each pod's sure part from the window's geometry: the dot sweeps the bracket at an even rate across a window
// (exact on a circle, close on the band's near-circular orbits), so the sure half-length is the open half-length scaled by
// (half-width − s) ÷ half-width. The pod the solution was solved for keeps the solved edges.
import type { GameState } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import type { BayState, DropSolution, LandingView, LaunchRecord, LzState, LzWindow, RepairHint } from '@/types/landing';
import { capabilitiesNow } from '@systems/capabilities';
import { dropHalfWidthKm } from '@systems/landing-solve';
import { bestRepairForDrop, dropFactors, isLaunchable, lzOpened, windowsAsOf } from '@systems/landing-rules';
import { groundKnownAt } from '@state/survey-selectors';
import { launchDrivers } from '@state/selectors';
import { demoSkill, AUTODROP_DEMO_TUNING } from '@systems/skill-tree';
import {
  AUTODROP_EDGE_MARGIN_TAC, AUTODROP_PLAN_MAX_PASSES, AUTODROP_SPACING_FRAC, BAY_RELOAD_TAC, BAY_SLOTS,
} from '@data/tuning';

// --- Windows in absolute game time ---------------------------------------------------------------------------------------

export interface Span {
  lo: number;
  hi: number;
}

// One LZ's window, absolute: the dot's centre in the bracket from `open` to `close`, `centre` between them (where the dot's
// centre crosses the bracket's centre), its in-band part, and its sure part for the solution's drop width (∩ in-band).
// `pass`: 0 for the solution's own window, n for the same window n periods on (the planet does not rotate, 01 §3.1).
export interface WindowAt {
  lz: string;
  open: number;
  close: number;
  centre: number;
  inBand: Span | null;
  sure: Span | null;
  launchRadius: number;
  halfWidthKm: number;
  pass: number;
}

function intersect(a: Readonly<Span> | null, b: Readonly<Span> | null): Span | null {
  if (a === null || b === null) return null;
  const lo = Math.max(a.lo, b.lo);
  const hi = Math.min(a.hi, b.hi);
  return hi > lo ? { lo, hi } : null;
}

function windowAt(sol: Readonly<DropSolution>, w: Readonly<LzWindow>, pass: number): WindowAt {
  const at = (inSec: number): number => sol.asOfTSec + inSec + pass * sol.periodSec;
  const inBand = w.inBandOpenInSec === null || w.inBandCloseInSec === null ? null : { lo: at(w.inBandOpenInSec), hi: at(w.inBandCloseInSec) };
  const sure = w.sureOpenInSec === null || w.sureCloseInSec === null ? null : { lo: at(w.sureOpenInSec), hi: at(w.sureCloseInSec) };
  return {
    lz: w.lz, open: at(w.openInSec), close: at(w.closeInSec), centre: at((w.openInSec + w.closeInSec) / 2),
    inBand, sure: intersect(sure, inBand), launchRadius: w.launchRadius, halfWidthKm: w.halfWidthKm, pass,
  };
}

// Every LZ's next in-band window as of `nowTSec` (an open one included), by opening. An LZ whose window is never in the band
// on this orbit is left out: nothing launched from outside the band (launchRefusal) can use it.
export function windowsAt(sol: Readonly<DropSolution>, nowTSec: number): WindowAt[] {
  if (sol.block !== null || sol.dot === null) return [];
  return windowsAsOf(sol, nowTSec).map((w) => windowAt(sol, w, 0))
    .filter((w) => w.inBand !== null && w.close > nowTSec)
    .sort((a, b) => a.open - b.open);
}

// The windows `passes` orbits deep (v3's plan), by opening.
export function windowsAhead(sol: Readonly<DropSolution>, nowTSec: number, passes: number): WindowAt[] {
  if (!(sol.periodSec > 0) || !Number.isFinite(sol.periodSec)) return windowsAt(sol, nowTSec);
  const first = windowsAsOf(sol, nowTSec).filter((w) => w.inBandOpenInSec !== null);
  const all: WindowAt[] = [];
  for (let pass = 0; pass < passes; pass++) {
    for (const w of first) {
      const at = windowAt(sol, w, pass);
      if (at.close > nowTSec) all.push(at);
    }
  }
  return all.sort((a, b) => a.open - b.open);
}

// The sure part of `win` for a pod whose drop half-width there is `halfWidthKm` (∩ the in-band span), or null when the whole
// dot never fits: the solved edges for the solution's own width, else the open span scaled by the room left (file header).
export function podSureSpan(win: Readonly<WindowAt>, lz: Readonly<LzState>, halfWidthKm: number): Span | null {
  if (Math.abs(halfWidthKm - win.halfWidthKm) < 1e-6) return win.sure;
  const half = lz.widthKm / 2;
  const room = half - halfWidthKm;
  if (!(room > 0)) return null;
  const reach = ((win.close - win.open) / 2) * (room / half);
  return intersect({ lo: win.centre - reach, hi: win.centre + reach }, win.inBand);
}

// --- The volley ----------------------------------------------------------------------------------------------------------

// One volley (plan §3.2): `n` pods into `lz`, the first at `firstAtTSec` (game s), each later one `spacingSec` on.
export interface Volley {
  lz: string;
  n: number;
  firstAtTSec: number;
  spacingSec: number;
}

// Where a volley is timed from (playtest 1, OPEN-DECISIONS 120). 'centre': it straddles the window's centre (v1 CENTRE, v3's
// plan: plan R6). 'cue': it starts at the strip's cue, the sure part's opening (`LAUNCH NOW`), as AIM is measured (item 6:
// autodrop-plan dropDemoOffset), each later pod a cadence on: v2 PASS, which flies a pass's count and so wants every slot the
// sure part has (CORMORANT's LZ-B: the hand kid got 3 pods in from LAUNCH NOW, v2 centred 2, 4.5 s later).
export type VolleyAnchor = 'centre' | 'cue';

// The slots of the biggest volley of at most `maxN` pods inside `span`, timed from `anchor`: straddling `centre` + `offsetSec`
// (R6: the first at centre − (n − 1) × cadence × AUTODROP_SPACING_FRAC + offset), or from the cue (the first at span.lo +
// offset), each later one a cadence on, never before `earliest` (now, the bay's cadence, a volley already flying), and its
// last slot an edge margin inside the sure part's close: the AI tick launches up to a tick after a slot, and a pod launched
// past the edge would leave with its dot over it. A volley that would start before `earliest` starts there instead (the kid
// pressed [G] late, a claim came late): it shrinks to what is left.
export function volleySlots(
  span: Readonly<Span>, centre: number, earliest: number, offsetSec: number, cadenceSec: number, maxN: number, marginSec: number,
  anchor: VolleyAnchor = 'centre',
): { n: number; first: number } | null {
  const lo = Math.max(span.lo, earliest);
  const hi = span.hi - marginSec;
  for (let n = Math.min(maxN, BAY_SLOTS); n >= 1; n--) {
    const from = anchor === 'cue' ? span.lo : centre - (n - 1) * cadenceSec * AUTODROP_SPACING_FRAC;
    const first = Math.max(from + offsetSec, lo);
    if (first + (n - 1) * cadenceSec <= hi) return { n, first };
  }
  // An offset pushed even one pod out of a short sure part (review B2's probe: a 0.3 tac s sure part against a learned 0.33 s
  // late): the one pod goes in the middle of what is left of it instead (not on its edge, which the AI tick can pass). The
  // offset trims a volley (R5: trained by you is felt), but never makes a window that has room for a launch unflyable.
  // Playtest 1 (B-DROP's sweep): the middle of the sure part itself, or now once that has passed. The middle of what is
  // left from now receded half a tick every tick and never came (VESPER's v1 named `LAUNCHING` through a 0.28 tac s sure
  // part and sent nothing; the hold on [L] had hidden it: the kid let go).
  if (maxN >= 1 && lo <= hi) return { n: 1, first: Math.max((span.lo + hi) / 2, lo) };
  return null;
}

// The pods the bay holds at `atTSec` (01 §3.4's double window): BAY_SLOTS slots, a reload of BAY_RELOAD_TAC of world time per
// pod from `nowTSec`, less the launches planned before it in this pass (`launchesBefore`, game s; one before now counts as
// now). As landing.ts bayAfter: the reload runs only while a slot is empty, and a full bay holds no progress. `cadenceTac`
// spaces the launches, which `launchesBefore` already are: it takes no part in the count.
export function bayBy(
  bay: Readonly<BayState>, cadenceTac: number, launchesBefore: readonly number[], nowTSec: number, atTSec: number, warp: number,
): number {
  void cadenceTac;
  if (!(warp > 0)) throw new Error(`bayBy: warp ${warp}`);
  let loaded = bay.loaded;
  let reload = bay.reloadTac;
  let t = nowTSec;
  const advance = (to: number): void => {
    const dtTac = Math.max(0, to - t) / warp;
    t = Math.max(t, to);
    if (loaded >= BAY_SLOTS) return;
    reload += dtTac;
    while (reload >= BAY_RELOAD_TAC && loaded < BAY_SLOTS) {
      loaded++;
      reload -= BAY_RELOAD_TAC;
    }
    if (loaded >= BAY_SLOTS) reload = 0;
  };
  for (const at of [...launchesBefore].filter((time) => time < atTSec).sort((a, b) => a - b)) {
    advance(at);
    loaded = Math.max(0, loaded - 1);
  }
  advance(atTSec);
  return loaded;
}

// AUTODROP's learned offset (03 §3.3): from the kid's drop demos, tac s (1.5 late when untrained, plan R5).
export function autodropOffsetTac(state: Readonly<GameState>): number {
  return demoSkill(state.run.stats.dropDemos, AUTODROP_DEMO_TUNING).learnedOffsetTac;
}

// The earliest a launch may go: now, once the bay's cadence has run out.
function earliestLaunch(bay: Readonly<BayState>, nowTSec: number, warp: number): number {
  return nowTSec + Math.max(0, bay.cadenceLeftTac) * warp;
}

// The volley centred on window `w` (plan §3.2, R5, R6): the sure part is the sure span intersected with the in-band span;
// n = min(the bay loaded at the first launch (bayBy), the LZ's room, the launches that fit), first = centre − (n − 1) ×
// cadence × AUTODROP_SPACING_FRAC + offset, each later one a cadence on, all inside the sure part. `offsetTac` is the
// learned (or untrained) offset, `warp` the tactical warp. null: nothing fits.
export function centredVolley(
  view: Readonly<LandingView>, w: Readonly<LzWindow>, nowTSec: number, offsetTac: number, cadenceTac: number, warp: number,
  room: number, bay: Readonly<BayState>,
): Volley | null {
  const win = windowAt(view.solution, w, 0);
  return volleyOn(win, win.sure, nowTSec, offsetTac, cadenceTac, warp, room, bay, []);
}

function volleyOn(
  win: Readonly<WindowAt>, span: Readonly<Span> | null, nowTSec: number, offsetTac: number, cadenceTac: number, warp: number,
  room: number, bay: Readonly<BayState>, planned: readonly number[], notBefore = -Infinity, anchor: VolleyAnchor = 'centre',
): Volley | null {
  if (span === null || room < 1 || !(cadenceTac > 0)) return null;
  const cadenceSec = cadenceTac * warp;
  const earliest = Math.max(earliestLaunch(bay, nowTSec, warp), notBefore);
  for (let maxN = Math.min(room, BAY_SLOTS); maxN >= 1; maxN--) {
    const slots = volleySlots(span, win.centre, earliest, offsetTac * warp, cadenceSec, maxN, AUTODROP_EDGE_MARGIN_TAC * warp, anchor);
    if (slots === null) return null;
    if (bayBy(bay, cadenceTac, planned, nowTSec, slots.first, warp) >= slots.n) {
      return { lz: win.lz, n: slots.n, firstAtTSec: slots.first, spacingSec: cadenceSec };
    }
    maxN = Math.min(maxN, slots.n);
  }
  return null;
}

// The volley AUTODROP v1 (armed for a window) or v2 (a pass) would fly next, and its window: the first in-band window, by
// opening, of an LZ that `wants` pods (null: any LZ with room) whose sure part is not over, with `want(lz)` capping the count.
// A v2 pass passes `inPass` to keep to its own windows, and `anchor` 'cue' (OPEN-DECISIONS 120).
export interface NextVolley {
  win: WindowAt;
  volley: Volley;
}

export function nextVolley(
  state: Readonly<GameState>, view: Readonly<LandingView>, want: (lz: string) => number, inPass: (win: Readonly<WindowAt>) => boolean = () => true,
  anchor: VolleyAnchor = 'centre',
): NextVolley | null {
  const cadenceTac = view.bay.cadenceTac;
  if (cadenceTac === null) return null;
  const now = state.clock.tSec;
  const warp = state.level.tacticalWarp;
  const offset = autodropOffsetTac(state);
  // Two passes deep: a window whose sure part is over while it is still open is followed by its next, a period on.
  for (const win of windowsAhead(view.solution, now, 2)) {
    const n = Math.min(want(win.lz), view.remaining[win.lz] ?? 0);
    if (n < 1 || win.sure === null || win.sure.hi <= now || !inPass(win)) continue;
    const volley = volleyOn(win, win.sure, now, offset, cadenceTac, warp, n, view.bay, [], -Infinity, anchor);
    if (volley !== null) return { win, volley };
  }
  return null;
}

// --- v2: the pass's rows (plan §3.3) -------------------------------------------------------------------------------------

// One row of v2's POD BAY (plan §3.3): the count set for `lz`, how many this pass can fly there, and the shortfall the bay
// leaves by then (`B ×3 — BAY HAS 1 BY THEN`; null: none).
export interface PassRow {
  lz: string;
  want: number;
  fits: number;
  bayHas: number | null;
}

// v2's rows for the counts in `pass`, one per LZ with room, in label order. `fits` is what the LZ's window this pass can fly
// (its sure part ÷ the cadence + 1, its room, BAY_SLOTS); `bayHas` the bay's pods at that volley's first launch, given the
// launches planned before it in this pass (the windows in time order), when that is short of the count.
export function passRows(state: Readonly<GameState>, view: Readonly<LandingView>, pass: Readonly<Record<string, number>>): PassRow[] {
  const cadenceTac = view.bay.cadenceTac;
  const now = state.clock.tSec;
  const warp = state.level.tacticalWarp;
  const offset = autodropOffsetTac(state);
  const wins = windowsAt(view.solution, now);
  const planned: number[] = [];
  const byLz = new Map<string, PassRow>();
  for (const win of wins) {
    const room = view.remaining[win.lz] ?? 0;
    if (room < 1 || byLz.has(win.lz)) continue;
    const want = Math.max(0, Math.min(room, Math.round(pass[win.lz] ?? 0)));
    const span = win.sure !== null && win.sure.hi > now ? win.sure : null;
    // What the window can fly, the bay aside (a full bay of BAY_SLOTS stands in for the count), timed from the cue as the
    // pass flies it (OPEN-DECISIONS 120).
    const geometric = cadenceTac === null || span === null ? null
      : volleySlots(span, win.centre, earliestLaunch(view.bay, now, warp), offset * warp, cadenceTac * warp, room, AUTODROP_EDGE_MARGIN_TAC * warp, 'cue');
    const fits = geometric?.n ?? 0;
    const flown = Math.min(want, fits);
    let bayHas: number | null = null;
    if (geometric !== null && cadenceTac !== null && flown > 0) {
      const has = bayBy(view.bay, cadenceTac, planned, now, geometric.first, warp);
      if (has < want) bayHas = has;
      const go = Math.min(flown, has);
      for (let i = 0; i < go; i++) planned.push(geometric.first + i * cadenceTac * warp);
    }
    byLz.set(win.lz, { lz: win.lz, want, fits, bayHas });
  }
  for (const lz of state.landing.lzs) {
    const room = view.remaining[lz.label] ?? 0;
    if (room >= 1 && !byLz.has(lz.label)) {
      byLz.set(lz.label, { lz: lz.label, want: Math.max(0, Math.min(room, Math.round(pass[lz.label] ?? 0))), fits: 0, bayHas: null });
    }
  }
  return state.landing.lzs.map((lz) => byLz.get(lz.label)).filter((row): row is PassRow => row !== undefined);
}

// The counts [G] would fly this pass when the kid has set none for an LZ (plan §3.3: prefilled the first time with
// min(room, this pass's capacity), so [G] alone does something sensible), merged with the kid's own (kept between
// passes, clamped to room).
export function passCounts(state: Readonly<GameState>, view: Readonly<LandingView>): Record<string, number> {
  const set = state.landing.autodrop.pass;
  const prefill: Record<string, number> = {};
  for (const lz of state.landing.lzs) prefill[lz.label] = view.remaining[lz.label] ?? 0;
  const rows = passRows(state, view, prefill);
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const kid = set[row.lz];
    counts[row.lz] = kid === undefined ? Math.min(row.fits, row.bayHas ?? row.fits) : Math.max(0, Math.min(view.remaining[row.lz] ?? 0, kid));
  }
  return counts;
}

// --- v3: the plan (plan §3.4) --------------------------------------------------------------------------------------------

export interface PlanRow {
  pass: number;
  lz: string;
  n: number;
  atTSec: number;
  pods: number[];
  mislanded: number;      // pods sent at the wrong-split rate (×MISLANDED_FACTOR): the leftovers, in the last rows
  forecast: boolean;      // after DropSolution.validUntilTSec: drawn dim, re-planned at the kick
  // Review m7: the last moment (game s) any of its pods can still leave (the chosen pods' sure part, an edge margin in). A row
  // past it was missed (ENGINE FIRING, a late claim) and the memo re-plans instead of holding it as row 0.
  untilTSec: number;
}

export interface LandingPlan {
  rows: PlanRow[];          // in time order
  passes: number;
  perLz: Record<string, number>;
  neverFits: { lz: string; repair: RepairHint | null }[];
  complete: boolean;        // every LZ with room reaches its count (with an opened LZ: every pod that fits lands in plan)
  // The LZs the check line marks short (`✗ LZ-C`, `✗ B, C`): the never-fits and every LZ left under its count. Playtest 1,
  // C-SITES: with an LZ opened on a found site the counts add up to more than the pods, so an LZ is short only while some pod
  // that fits is planned for no LZ with room, and an opened LZ (planned 0) never is.
  short: string[];
  // Slice 4c (Track DROP): pods with a fitting LZ that lie past AUTODROP_PLAN_MAX_PASSES, as whole passes more (the table's
  // `+n PASSES`); 0 when the plan holds them all.
  laterPasses: number;
  // Review M2: the pods aboard the plan holds for no window (in no row, and not kept for a pass past the table), healthiest
  // first. In a window the plan does not use, AUTODROP pins LOAD NEXT to the first of them, so the kid's [L] there throws one
  // of these and never a pod the plan kept for a sure window.
  outside: number[];
}

const EMPTY_PLAN: LandingPlan = { rows: [], passes: 0, perLz: {}, neverFits: [], complete: false, short: [], laterPasses: 0, outside: [] };

interface PlanPod {
  pod: number;
  driver: DriverSegment;
  widthFactor: number;   // the product of its drop factors: the smaller, the healthier (the narrower its dot)
  order: number;         // its place in memory order (the launch queue without LOAD NEXT's pin: review M2)
}

// The plan memo (plan §2.3, R18): one entry, keyed on everything the plan reads.
let memoKey: string | null = null;
let memoPlan: LandingPlan = EMPTY_PLAN;

function planKey(state: Readonly<GameState>, view: Readonly<LandingView>, pods: readonly PlanPod[], wins: readonly WindowAt[]): string {
  const sol = view.solution;
  return [
    // Slice 6 (R13): sitesRev, so an LZ SURVEY moved re-plans.
    state.run.rev, state.landing.orbitEpoch, state.landing.sitesRev, Math.round(sol.periodSec), sol.validUntilTSec === null ? '-' : Math.round(sol.validUntilTSec),
    state.landing.loadNext ?? '-', view.bay.loaded, view.bay.cadenceTac ?? '-', autodropOffsetTac(state).toFixed(3),
    pods.map((pod) => `${pod.pod}:${pod.widthFactor.toFixed(4)}`).join(','),
    Object.entries(view.remaining).map(([lz, n]) => `${lz}=${n}`).join(','),
    wins.map((win) => `${win.lz}@${Math.round(win.open)}`).join(','),
    state.landing.pods.filter((record) => record.fate.kind !== 'aboard').length,
  ].join('|');
}

// The whole landing as v3 would fly it from now (03 §3.8, plan §3.4; pure, memoised on the launches so far, orbitEpoch, the
// drop factors and loadNext: R18):
// • the counts: each LZ with room takes pods that fit it, the narrowest LZ first with the healthiest drivers, every wider
//   one the least healthy whose drop still fits; an LZ no pod fits on this orbit is left out with the REPAIR that would
//   give it a sure window (landing-rules bestRepairForDrop);
// • the schedule: the windows in time order, AUTODROP_PLAN_MAX_PASSES deep, each flown with as many of its LZ's pods as fit
//   its sure part (their own drop widths) and the bay holds then (bayBy, 20 s reloads), centred as v1's volleys are;
// • the leftovers (pods no count can use) go into a window of a fitting LZ after every count row, at the wrong-split rate.
// • Playtest 1, C-SITES (plan §3.13): an LZ the kid opened on a found site (landing-rules lzOpened) was planned to take none
//   and has its site's ROOM. Once one stands, the LZs are served in three tiers: CONTROL's LZs on ground not known bad, then
//   the opened ones, then every LZ on ground known ROCKY or WET (each tier by the narrowest-first rule). So the pods CONTROL's
//   sound LZs still want go there, the pods a bad or never-fitting LZ would have taken go to the opened one, and nothing goes
//   mislanded while an opened LZ has room.
export function planLanding(state: Readonly<GameState>, view: Readonly<LandingView>): LandingPlan {
  const cadenceTac = view.bay.cadenceTac;
  const sol = view.solution;
  if (cadenceTac === null || sol.block !== null || sol.dot === null) return EMPTY_PLAN;
  const now = state.clock.tSec;
  const caps = capabilitiesNow(state);
  const R = state.level.planet.R;
  // Address order, not LOAD NEXT's (review M2): the plan's ties go the same way whatever is pinned, so AUTODROP's own pin of
  // a pod outside the plan never moves that pod into it.
  const queue = launchDrivers(state).filter(isLaunchable);
  const pods: PlanPod[] = queue.map((driver, order) => {
    const f = dropFactors(caps, driver);
    return { pod: driver.pod, driver, widthFactor: f.sensor * f.plotter * f.driver, order };
  });
  const wins = windowsAhead(sol, now, AUTODROP_PLAN_MAX_PASSES);
  const key = planKey(state, view, pods, wins);
  // A first row whose moment passed with no launch is re-planned from now (review m7: the key has no "now").
  if (key === memoKey && !((memoPlan.rows[0]?.untilTSec ?? Infinity) < now)) return memoPlan;
  const plan = computePlan(state, view, pods, wins, cadenceTac, caps, R);
  memoKey = key;
  memoPlan = plan;
  return plan;
}

// Forgets the plan memo (the world reset; a suite timing the plan cold).
export function forgetPlanMemo(): void {
  memoKey = null;
  memoPlan = EMPTY_PLAN;
}

function computePlan(
  state: Readonly<GameState>, view: Readonly<LandingView>, pods: readonly PlanPod[], wins: readonly WindowAt[], cadenceTac: number,
  caps: ReturnType<typeof capabilitiesNow>, R: number,
): LandingPlan {
  const now = state.clock.tSec;
  const warp = state.level.tacticalWarp;
  const offset = autodropOffsetTac(state);
  const sol = view.solution;
  const lzOf = new Map(state.landing.lzs.map((lz) => [lz.label, lz]));
  const sureFor = (pod: Readonly<PlanPod>, win: Readonly<WindowAt>): Span | null => {
    const lz = lzOf.get(win.lz);
    if (lz === undefined) throw new Error(`planLanding: window for an unknown LZ '${win.lz}'`);
    return podSureSpan(win, lz, dropHalfWidthKm(win.launchRadius, R, dropFactors(caps, pod.driver)));
  };
  const passZero = wins.filter((win) => win.pass === 0);
  const fits = (pod: Readonly<PlanPod>, lz: string): boolean => passZero.some((win) => win.lz === lz && sureFor(pod, win) !== null);

  // The counts.
  const need = new Map<string, number>();
  for (const lz of state.landing.lzs) {
    const room = view.remaining[lz.label] ?? 0;
    if (room > 0) need.set(lz.label, room);
  }
  const byHealth = [...pods].sort((a, b) => a.widthFactor - b.widthFactor || a.order - b.order);
  const neverFits: LandingPlan['neverFits'] = [];
  const opened = new Set(state.landing.lzs.filter((lz) => lzOpened(state.landing, lz.label)).map((lz) => lz.label));
  // C-SITES' tiers (the header); 0 for every LZ while none is opened, so the order is the narrowest-first one as before.
  const tier = (label: string): number => {
    if (opened.size === 0) return 0;
    const lz = lzOf.get(label)!;
    if (lz.ground !== 'flat' && groundKnownAt(state.landing, label)) return 2;
    return opened.has(label) ? 1 : 0;
  };
  const order = [...need.keys()].sort((a, b) => tier(a) - tier(b) || (lzOf.get(a)!.widthKm - lzOf.get(b)!.widthKm) || a.localeCompare(b));
  let pool = [...byHealth];
  const assigned = new Map<string, PlanPod[]>();
  let narrowestServed = false;
  for (const lz of order) {
    const fitting = pool.filter((pod) => fits(pod, lz));
    if (fitting.length === 0) {
      if (!byHealth.some((pod) => fits(pod, lz))) {
        const win = passZero.find((candidate) => candidate.lz === lz);
        neverFits.push({ lz, repair: win === undefined ? null : bestRepairForDrop(state, caps, lzOf.get(lz)!, win.launchRadius) });
      }
      continue;
    }
    const want = need.get(lz) ?? 0;
    // The narrowest LZ any pod fits takes the healthiest drivers; a wider one the least healthy whose drop still fits.
    const taken = !narrowestServed ? fitting.slice(0, want) : fitting.slice(Math.max(0, fitting.length - want));
    narrowestServed = true;
    const takenSet = new Set(taken);
    assigned.set(lz, [...taken].sort((a, b) => a.widthFactor - b.widthFactor || a.order - b.order));
    pool = pool.filter((pod) => !takenSet.has(pod));
  }

  // The schedule.
  const rows: PlanRow[] = [];
  const planned: number[] = [];
  const cadenceSec = cadenceTac * warp;
  const fly = (win: Readonly<WindowAt>, candidates: readonly PlanPod[], notBefore: number, mislanded: boolean): PlanPod[] => {
    for (let k = Math.min(candidates.length, BAY_SLOTS); k >= 1; k--) {
      const chosen = candidates.slice(0, k);
      let span: Span | null = { lo: -Infinity, hi: Infinity };
      for (const pod of chosen) span = intersect(span, sureFor(pod, win));
      if (span === null || span.hi <= now) continue;
      const last = planned.length === 0 ? -Infinity : Math.max(...planned) + cadenceSec;
      const volley = volleyOn(win, span, now, offset, cadenceTac, warp, k, view.bay, planned, Math.max(notBefore, last));
      if (volley === null || volley.n < k) continue;
      for (let i = 0; i < k; i++) planned.push(volley.firstAtTSec + i * cadenceSec);
      rows.push({
        pass: win.pass + 1, lz: win.lz, n: k, atTSec: volley.firstAtTSec, pods: chosen.map((pod) => pod.pod), mislanded: mislanded ? k : 0,
        forecast: sol.validUntilTSec !== null && volley.firstAtTSec > sol.validUntilTSec,
        untilTSec: span.hi - AUTODROP_EDGE_MARGIN_TAC * warp,
      });
      return chosen;
    }
    return [];
  };
  for (const win of wins) {
    const list = assigned.get(win.lz);
    if (list === undefined || list.length === 0) continue;
    const sent = fly(win, list, -Infinity, false);
    assigned.set(win.lz, list.filter((pod) => !sent.includes(pod)));
  }
  const perLz: Record<string, number> = {};
  for (const row of rows) perLz[row.lz] = (perLz[row.lz] ?? 0) + row.n;
  const unscheduled = [...assigned.values()].reduce((sum, list) => sum + list.length, 0);
  // The leftovers: after every count row, into a fitting LZ (the wrong-split rate), never off-site.
  const lastCount = planned.length === 0 ? -Infinity : Math.max(...planned);
  let leftovers = pool.filter((pod) => state.landing.lzs.some((lz) => fits(pod, lz.label)));
  for (const win of wins) {
    if (leftovers.length === 0) break;
    const candidates = leftovers.filter((pod) => fits(pod, win.lz));
    if (candidates.length === 0) continue;
    const sent = fly(win, candidates, lastCount + cadenceSec, true);
    leftovers = leftovers.filter((pod) => !sent.includes(pod));
  }
  rows.sort((a, b) => a.atTSec - b.atTSec);
  // Whole passes more for what lies past the table (at least one per BAY_SLOTS pods left that fit).
  const laterPasses = unscheduled > 0 ? Math.ceil(unscheduled / BAY_SLOTS) : 0;
  let complete = neverFits.length === 0 && [...need].every(([lz, n]) => (perLz[lz] ?? 0) >= n);
  let short = [...new Set([...neverFits.map((never) => never.lz), ...[...need].filter(([lz, n]) => (perLz[lz] ?? 0) < n).map(([lz]) => lz)])].sort();
  if (opened.size > 0) {
    // C-SITES: the counts add up to more than the pods. Complete when every pod that fits some LZ is in a count row (not a
    // leftover's, not past the table), as many as the LZs have room for.
    const fitting = byHealth.filter((pod) => [...need.keys()].some((lz) => fits(pod, lz))).length;
    const demand = Math.min(fitting, [...need.values()].reduce((sum, n) => sum + n, 0));
    const covered = rows.filter((row) => row.mislanded === 0).reduce((sum, row) => sum + row.n, 0);
    complete = demand > 0 && covered >= demand;
    short = complete ? [] : short.filter((lz) => !opened.has(lz));
    if (complete) neverFits.length = 0;
  }
  const held = new Set([...rows.flatMap((row) => row.pods), ...[...assigned.values()].flatMap((list) => list.map((pod) => pod.pod))]);
  const outside = byHealth.filter((pod) => !held.has(pod.pod)).map((pod) => pod.pod);
  return {
    rows, passes: rows.reduce((most, row) => Math.max(most, row.pass), 0), perLz, neverFits, complete, short, laterPasses, outside,
  };
}

// --- Demos (plan §3.6; review M3) ----------------------------------------------------------------------------------------

// A launch's offset from its window's centre (where the dot's centre crosses the bracket's centre), tactical s; null
// off-site or outside its window. What AUTODROP's centring is measured by (the suites), not what it learns from.
export function centreOffsetTac(sol: Readonly<DropSolution>, launch: Readonly<LaunchRecord>, warp: number): number | null {
  const win = launchWindow(sol, launch, warp);
  return win === null ? null : (launch.atTSec - win.centre) / warp;
}

// A manual launch as a drop demo (review M3, a deviation from 03 §2's "minus the moment the dot was at the bracket centre"):
// the launch's time − the slot the strip cued it at, ÷ the tactical warp. The first launch into a window is cued at its
// launch moment (landing-rules launchMomentInSec: where the whole dot first fits, `LAUNCH NOW`; its in-band opening for a
// WIDE DROP, `LAUNCH — press [L]`), each later one a cadence after the launch before it in the same window (the bay's
// `RELOADING` → `LAUNCH NOW`). So a kid who does exactly what the strip says teaches AUTODROP no offset, and AUTODROP's
// centring stays its own, as AUTOBURN's demos are measured against START BURN. `earlier`: the game times of the launches
// already made (any source; those outside this window are ignored), `cadenceSec` the bay's cadence in game s. null when
// it is not a demo (off-site: no bracket under the dot's centre).
export function dropDemoOffset(
  sol: Readonly<DropSolution>, launch: Readonly<LaunchRecord>, warp: number, cadenceSec: number, earlier: readonly number[],
): number | null {
  const win = launchWindow(sol, launch, warp);
  if (win === null) return null;
  const moment = win.sure?.lo ?? win.inBand?.lo ?? win.open;
  const before = earlier.filter((at) => at >= win.open && at < launch.atTSec);
  const cue = before.length === 0 ? moment : Math.max(moment, Math.max(...before) + cadenceSec);
  return (launch.atTSec - cue) / warp;
}

function launchWindow(sol: Readonly<DropSolution>, launch: Readonly<LaunchRecord>, warp: number): WindowAt | null {
  if (launch.aimLz === null || sol.block !== null || !(warp > 0)) return null;
  const w = windowsAsOf(sol, launch.atTSec).find((candidate) => candidate.lz === launch.aimLz);
  if (w === undefined) return null;
  const win = windowAt(sol, w, 0);
  return launch.atTSec < win.open || launch.atTSec > win.close ? null : win;
}
