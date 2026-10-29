import type { GameState, GuideLayer, Urgency } from '@state/schema';
import type { DropSolution, LzWindow } from '@/types/landing';
import type { CapabilityRole } from '@systems/capabilities';
import type { FsToolKind } from '@/types/fs-tool';
import type { Prediction } from '@systems/predict';
import { skipBlockReason } from '@systems/pace';
import { rootDeleteRunning } from '@systems/hollow';
import { rootDeletable } from '@systems/finale';
import { secFromNow } from '@systems/landing-solve';
import { isLaunchable, launchMomentInSec, lzDownFill, lzRemaining, nextToLaunch, targetWindow } from '@systems/landing-rules';
import { driversInMemory } from '@state/selectors';
import { podHintTarget, toolStepTarget, ROOT_HINT_TARGET } from '@data/fs-tools';
import { LANDING_LINES, podCode } from '@data/landing-text';
import { IS_DEV } from '@/env';
import { BAY_RELOAD_TAC, MAX_LINE_CHARS, WINDOW_TACTICAL_LEAD_TAC } from '@data/tuning';

// The landing's guidance table (01-landing §3.11, plan §1.5): the one line that names the next step while the pods go
// down, as flightObjective does for the flight. PURE: buildLandingContext reduces the state and the drop solution to
// "now" and to tactical seconds, and landingObjective picks the first matching row. No match throws in dev (v2 §6.3).
// A separate file from guidance.ts (which re-exports it) so the two tables stay disjoint and the import cycle stays out.
//
// | Row  | Situation                                                       | Line                                         |
// | L0   | the final ship is empty and the root can be deleted (the duel)  | EVERY POD IS DOWN — now DELETE THE ROOT      |
// | L1   | Nav Plotter dead or missing                                     | NO DROP SOLUTION — TAB, REPAIR NAV PLOTTER   |
// | L2   | 1b: thrust, a trim or GO LOWER ahead (asserted absent in 1a)    | the flight table's row                       |
// | L3   | a window is open and its LZ is full                             | LZ-A FULL — hold the pods for LZ-B           |
// | L4   | open, the whole dot fits, the bay ready, a pod can launch       | LAUNCH NOW — press [L] · LZ-A 1/3            |
// | L5   | open, the dot's centre in but its edges out, bay ready, a pod   | LAUNCH — press [L] · WIDE DROP, some may miss|
// | L6   | open, a pod can launch, the bay not ready                       | RELOADING — next pod in 0:02                 |
// | L7   | the next awaited window opens within 8 tac s, a pod can launch  | GET READY — LZ-A IN 0:05                     |
// |      | (or it is open, the dot's edges not in yet but coming this pass): the countdown runs to the sure part           |
// | L11  | no pod can launch now, and one aboard needs its driver repaired | POD 07 CAN'T LAUNCH — TAB, REPAIR its driver |
// | L12  | pods aboard and none can ever launch (no driver left)           | NO POD CAN LAUNCH — END LANDING parks them   |
// | L12b | no pod aboard: pods falling, or the linger before the report    | ALL PODS AWAY · 2 FALLING                    |
// | L13  | otherwise                                                        | WAIT — LZ-B in 2:10 ▸▸ · [F] to SKIP         |
// L12's twin (L12, id `landing-L12-band`): no LZ ever passes under the dot while the ship is in the band (a PARTIAL orbit
// whose band arc misses every bracket); with no engine in 1a nothing changes that, so END LANDING is the way on.
// "Open" is state.landing.window (landing.ts writes it from the in-band span, risk 13): out-of-band windows are never the
// window, and L13 names the next one OUT OF BAND.

export type LandingRow = 'L0' | 'L1' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L11' | 'L12' | 'L12b' | 'L13';

export interface LandingObjective {
  id: string;             // `landing-L4` (L12's twin: `landing-L12-band`): stable per row, the strip retypes on a new id
  row: LandingRow;
  text: string;           // ≤ MAX_LINE_CHARS
  keys: string[];
  urgency: Urgency;
  layer: GuideLayer;      // the screen whose controls do it: ◆ ship, ◇ mind (L0, L1, L11)
  repairs?: CapabilityRole;     // L1: the file whose REPAIR is the fix (the director lights the chip, then the file)
  highlight?: string | null;    // L0 (the root), L11 (the driver), in the MIND
  nextLz: string | null;        // the LZ the next SKIP flies to (the MIND CLEAR hint), null when none
}

// Everything the table reads, already reduced to "now" and tactical seconds.
export interface LandingContext {
  inMind: boolean;
  heldTool: FsToolKind | null;  // the tool in hand (a REPAIR or DELETE line lights its chip until then)
  finalShip: boolean;
  rootToDelete: boolean;    // the duel is on, its DELETE is not running, and something can still delete the root
  aboard: number;
  falling: number;
  block: boolean;           // NO DROP SOLUTION (L1)
  thrust: boolean;          // the engine delivered thrust this tick (L2: never in 1a)
  // The window open now; `sureInTac`: tactical s until its whole dot fits when that is still ahead this pass (then GET
  // READY counts down to it), else null (it fits now, or never will: a wide drop).
  open: { lz: string; sure: boolean; sureInTac: number | null; full: boolean; down: number; count: number } | null;
  nextWithRoom: string | null;   // the next LZ with projected room other than the open one (L3)
  canLaunch: boolean;       // a pod can launch right now (nextToLaunch)
  bayReady: boolean;        // a slot loaded and the cadence run out
  bayReadyInTac: number;    // tactical s until the bay can launch again (0 when ready)
  stuckPod: number | null;  // no pod can launch now and this one's driver needs a REPAIR (L11)
  anyCanEver: boolean;      // a pod aboard still has its driver in memory
  // The next window: the target (in band), else the next one (out of band). `inTac`: to its opening; `launchInTac`: to
  // its launch moment (landing-rules launchMomentInSec: the sure part's opening when it has one).
  next: { lz: string; inTac: number; launchInTac: number; inBand: boolean } | null;
  noBandWindow: boolean;    // pods aboard, and no LZ's window is ever in the band on this orbit (L12's twin)
  skipAvailable: boolean;   // F would start a SKIP now
}

// The next window as L13 names it: the in-band target (landing-rules targetWindow), else the next window of any LZ (it
// is out of band). Tactical seconds to its opening (its in-band opening when in band).
function nextWindow(state: Readonly<GameState>, sol: Readonly<DropSolution>): LandingContext['next'] {
  const now = state.clock.tSec;
  const warp = state.level.tacticalWarp;
  const target = targetWindow(state, sol, now);
  const launchAt = target === null ? null : launchMomentInSec(sol, target, now);
  if (target !== null && target.inBandOpenInSec !== null && launchAt !== null) {
    const inTac = Math.max(0, secFromNow(sol, target.inBandOpenInSec, now)) / warp;
    return { lz: target.lz, inTac, launchInTac: Math.max(0, launchAt) / warp, inBand: true };
  }
  const ahead: LzWindow | undefined = sol.windows.find((w) => secFromNow(sol, w.closeInSec, now) > 0);
  if (ahead === undefined) return null;
  const inTac = Math.max(0, secFromNow(sol, ahead.openInSec, now)) / warp;
  return { lz: ahead.lz, inTac, launchInTac: inTac, inBand: false };
}

export function buildLandingContext(state: Readonly<GameState>, sol: Readonly<DropSolution> | null, pred: Prediction): LandingContext {
  if (state.run.phase !== 'landing') throw new Error(`buildLandingContext: not landing (phase ${state.run.phase})`);
  if (sol === null) throw new Error('buildLandingContext: no drop solution in LANDING');
  const { landing } = state;
  const aboard = landing.pods.filter((record) => record.fate.kind === 'aboard');
  const falling = landing.pods.filter((record) => record.fate.kind === 'falling').length;
  const inMemory = driversInMemory(state);
  const aboardDrivers = inMemory.filter((driver) => aboard.some((record) => record.pod === driver.pod));
  const canLaunch = nextToLaunch(state) !== null;
  const remaining = lzRemaining(state);
  const down = lzDownFill(state);
  const window = landing.window;
  const openLz = window === null ? undefined : landing.lzs.find((lz) => lz.label === window.lz);
  if (window !== null && openLz === undefined) throw new Error(`buildLandingContext: the open window's LZ '${window.lz}' is not on this ship`);
  const openWindow = window === null ? undefined : sol.windows.find((w) => w.lz === window.lz);
  const sureIn = window === null || window.sure || openWindow === undefined ? null : launchMomentInSec(sol, openWindow, state.clock.tSec);
  const open = window === null || openLz === undefined ? null : {
    lz: window.lz, sure: window.sure, sureInTac: sureIn !== null && sureIn > 0 ? sureIn / state.level.tacticalWarp : null,
    full: (remaining[window.lz] ?? 0) === 0, down: down[window.lz] ?? 0, count: openLz.pods,
  };
  // L3's "hold the pods for LZ-B": the LZ with room whose window comes next (targetWindow skips full ones), else any LZ
  // with room.
  const target = sol.block === null ? targetWindow(state, sol, state.clock.tSec) : null;
  const hasRoom = (lz: string): boolean => lz !== window?.lz && (remaining[lz] ?? 0) > 0;
  const nextWithRoom = target !== null && hasRoom(target.lz) ? target.lz : landing.lzs.find((lz) => hasRoom(lz.label))?.label ?? null;
  const { bay } = landing;
  const bayReadyInTac = bay.loaded >= 1 ? bay.cadenceLeftTac : Math.max(bay.cadenceLeftTac, BAY_RELOAD_TAC - bay.reloadTac);
  // A driver that needs the kid: in memory, aboard, unable to launch, and nobody working on it (a repair or a move
  // already running finishes by itself, and the next window will take it).
  const stuck = canLaunch ? undefined : aboardDrivers.find((driver) => !isLaunchable(driver) && !driver.operating
    && driver.state !== 'repairing' && driver.state !== 'transferring');
  const heldKind = state.ui.activeTool?.kind ?? null;
  return {
    inMind: state.ui.mode === 'memory',
    heldTool: heldKind,
    finalShip: landing.finalShip,
    rootToDelete: state.hollow.finale.phase === 'duel' && !rootDeleteRunning(state) && rootDeletable(state),
    aboard: aboard.length,
    falling,
    block: sol.block !== null,
    thrust: state.burn.lastTickDvKmS > 0,
    open,
    nextWithRoom,
    canLaunch,
    bayReady: bay.loaded >= 1 && bay.cadenceLeftTac <= 0,
    bayReadyInTac,
    stuckPod: stuck?.pod ?? null,
    anyCanEver: aboardDrivers.length > 0,
    next: sol.block === null ? nextWindow(state, sol) : null,
    noBandWindow: aboard.length > 0 && sol.block === null && sol.windows.length > 0 && sol.windows.every((w) => !w.inBand),
    skipAvailable: skipBlockReason(state, pred) === null,
  };
}

function line(
  row: LandingRow, text: string, keys: string[], urgency: Urgency, layer: GuideLayer, ctx: LandingContext,
  extra: Partial<Pick<LandingObjective, 'repairs' | 'highlight' | 'id'>> = {},
): LandingObjective {
  return { id: extra.id ?? `landing-${row}`, row, text, keys, urgency, layer, nextLz: ctx.next?.inBand ? ctx.next.lz : null, ...extra };
}

function evaluate(ctx: LandingContext): LandingObjective | null {
  const empty = ctx.aboard === 0 && ctx.falling === 0;
  // L0: the final ship is empty and the root is still to delete; the report waits for the duel (finalePending).
  if (ctx.finalShip && empty && ctx.rootToDelete) {
    const highlight = ctx.inMind ? toolStepTarget('delete', ctx.heldTool, ROOT_HINT_TARGET) : null;
    return line('L0', LANDING_LINES.L0, [], 'now', 'mind', ctx, { highlight });
  }
  if (ctx.block) {
    return line('L1', ctx.inMind ? LANDING_LINES.L1Mind : LANDING_LINES.L1, ctx.inMind ? [] : ['TAB'], 'now', 'mind', ctx, { repairs: 'navplot' });
  }
  // L2 (1a STUB, risk 1): the engine cannot fire during the landing, so thrust here is a bug. 1b opens the engine and
  // this row becomes the flight table's F3–F11 (trims, GO LOWER's KEEP HOLDING).
  if (ctx.thrust && IS_DEV) throw new Error('landingObjective: thrust during the landing (the engine is closed in 1a: L2 is 1b)');
  const open = ctx.open;
  if (open !== null && ctx.aboard > 0) {
    if (open.full) return line('L3', LANDING_LINES.L3(open.lz, ctx.nextWithRoom), [], 'now', 'ship', ctx);
    // The centre is in but the edges are not yet, and they will be this pass: GET READY counts on to the sure part
    // (launchMomentInSec), so the first pod never goes half off-site. L5 is for a dot that won't fit at all.
    if (ctx.canLaunch && open.sureInTac !== null) return line('L7', LANDING_LINES.L7(open.lz, open.sureInTac), [], 'now', 'ship', ctx);
    if (ctx.canLaunch && ctx.bayReady) {
      if (open.sure) return line('L4', LANDING_LINES.L4(open.lz, open.down, open.count), ['L'], 'now', 'ship', ctx);
      return line('L5', LANDING_LINES.L5, ['L'], 'now', 'ship', ctx);
    }
    if (ctx.canLaunch) return line('L6', LANDING_LINES.L6(ctx.bayReadyInTac), [], 'now', 'ship', ctx);
  }
  if (ctx.aboard > 0 && ctx.canLaunch && ctx.next !== null && ctx.next.inBand && ctx.next.inTac <= WINDOW_TACTICAL_LEAD_TAC) {
    return line('L7', LANDING_LINES.L7(ctx.next.lz, ctx.next.launchInTac), [], 'now', 'ship', ctx);
  }
  if (ctx.aboard > 0 && ctx.stuckPod !== null) {
    const highlight = ctx.inMind ? toolStepTarget('repair', ctx.heldTool, podHintTarget(podCode(ctx.stuckPod))) : null;
    const text = ctx.inMind ? LANDING_LINES.L11Mind(ctx.stuckPod) : LANDING_LINES.L11(ctx.stuckPod);
    return line('L11', text, ctx.inMind ? [] : ['TAB'], 'soon', 'mind', ctx, { highlight });
  }
  if (ctx.aboard > 0 && !ctx.anyCanEver) return line('L12', LANDING_LINES.L12, [], 'now', 'ship', ctx);
  if (ctx.aboard > 0 && ctx.noBandWindow) return line('L12', LANDING_LINES.L12band, [], 'now', 'ship', ctx, { id: 'landing-L12-band' });
  if (ctx.aboard === 0) return line('L12b', LANDING_LINES.L12b(ctx.falling), [], 'wait', 'ship', ctx);
  if (ctx.next !== null) {
    const skip = ctx.skipAvailable && ctx.next.inBand;
    return line('L13', LANDING_LINES.L13(ctx.next.lz, ctx.next.inTac, skip, !ctx.next.inBand), skip ? ['F'] : [], 'wait', 'ship', ctx);
  }
  return null;
}

// A ship row that asks for [L] (or counts down to it, or names the POD BAY's END LANDING) says [TAB] first in the MIND,
// as the flight's fromMind does: `LAUNCH NOW — [TAB], press [L] · LZ-A 1/3`. [L] there only buzzes SHIP SCREEN.
const SHIP_ACTION_ROWS: ReadonlySet<LandingRow> = new Set<LandingRow>(['L4', 'L5', 'L6', 'L7', 'L12']);
const HEAD_SEPARATOR = ' — ';

function fromMind(objective: LandingObjective, ctx: LandingContext): LandingObjective {
  if (!ctx.inMind || objective.layer !== 'ship' || !SHIP_ACTION_ROWS.has(objective.row)) return objective;
  const keys = ['TAB', ...objective.keys];
  const split = objective.text.indexOf(HEAD_SEPARATOR);
  if (split < 0) return { ...objective, text: `[TAB] BACK${HEAD_SEPARATOR}${objective.text}`, keys };
  const head = objective.text.slice(0, split);
  const full = `${head}${HEAD_SEPARATOR}[TAB], ${objective.text.slice(split + HEAD_SEPARATOR.length)}`;
  return { ...objective, text: full.length <= MAX_LINE_CHARS ? full : `${head}${HEAD_SEPARATOR}[TAB] BACK`, keys };
}

// The table, worded for the screen the kid is on. Every situation in LANDING matches a row, so no match is a table bug
// and throws (as the director does for a live flight with no flight line); a line too long for the strip throws in dev.
export function landingObjective(ctx: LandingContext): LandingObjective {
  const evaluated = evaluate(ctx);
  if (evaluated === null) throw new Error(`landingObjective: no row matches (${JSON.stringify(ctx)})`);
  const objective = fromMind(evaluated, ctx);
  if (IS_DEV && objective.text.length > MAX_LINE_CHARS) {
    throw new Error(`landingObjective: '${objective.text}' is ${objective.text.length} chars (max ${MAX_LINE_CHARS})`);
  }
  return objective;
}
