import type { GameState, GuideLayer, Urgency } from '@state/schema';
import type { DropSolution, LzWindow } from '@/types/landing';
import type { CapabilityRole } from '@systems/capabilities';
import type { FsToolKind } from '@/types/fs-tool';
import { secFromNow } from '@systems/landing-solve';
import {
  driversThatCanEverLaunch, isLaunchable, landingMoment, lzDownFill, lzRemaining, podCounts, windowsAsOf, type LandingMoment,
} from '@systems/landing-rules';
import { rootDeletable, rootDeleteRunning } from '@state/selectors';
import { podHintTarget, toolStepTarget, ROOT_HINT_TARGET } from '@data/fs-tools';
import { LANDING_LINES, podCode } from '@data/landing-text';
import { HOLLOW_FINALE } from '@data/hollow-text';
import { IS_DEV } from '@/env';
import { BAY_RELOAD_TAC, MAX_LINE_CHARS, MISLANDED_FACTOR, WINDOW_TACTICAL_LEAD_TAC } from '@data/tuning';

// The landing's guidance table (01-landing §3.11, plan §1.5): the one line that names the next step while the pods go
// down, as flightObjective does for the flight. PURE: buildLandingContext reduces the state and the drop solution to
// "now" and to tactical seconds, and landingObjective picks the first matching row. No match throws in dev (v2 §6.3).
// A separate file from guidance.ts (which re-exports it) so the two tables stay disjoint and the import cycle stays out.
//
// | Row  | Situation                                                       | Line                                         |
// | L0   | the final ship is empty and the root can be deleted (the duel)  | EVERY POD IS DOWN — now DELETE THE ROOT      |
// |      | (some parked or never launched: HOLLOW_FINALE.stripWaitsNobody, NO POD LEFT TO LAUNCH — now DELETE THE ROOT)    |
// | L1   | Nav Plotter dead or missing                                     | NO DROP SOLUTION — TAB, REPAIR NAV PLOTTER   |
// | L2   | 1b: thrust, a trim or GO LOWER ahead (asserted absent in 1a)    | the flight table's row                       |
// | L3   | a window is open, its LZ full, another LZ in the band has room  | LZ-A FULL — hold the pods for LZ-B           |
// | L3b  | open, its LZ full, NO in-band LZ has room, launch moment come,  | NO ROOM IN THE BAND — [L] lands in a full LZ |
// |      | bay ready, a pod can launch (the mislanded launch, review M1)   | (¾), or END LANDING                          |
// | L4   | open, the whole dot fits, the bay ready, a pod can launch       | LAUNCH NOW — press [L] · LZ-A 1/3            |
// | L5   | open, the dot's centre in but its edges out, bay ready, a pod   | LAUNCH — press [L] · WIDE DROP, some may miss|
// | L6   | open, a pod can launch, the bay not ready                       | RELOADING — next pod in 0:02                 |
// | L7   | the next window's launch moment within 8 tac s, a pod can launch| GET READY — LZ-A IN 0:05                     |
// |      | (or it is open, the dot's edges not in yet but coming this pass): GET READY, WAIT and the beeps count to the   |
// |      | launch moment (landing-rules landingMoment: the sure part's opening, else the opening)                         |
// | L11  | no pod can launch now, and one aboard needs its driver repaired | POD 07 CAN'T LAUNCH — TAB, REPAIR its driver |
// | L12  | pods aboard and none can ever launch (no driver left, or dead   | NO POD CAN LAUNCH — END LANDING parks them   |
// |      | with no REPAIR left)                                            |                                              |
// | L12b | no pod aboard: pods falling, or the linger before the report    | ALL PODS AWAY · 2 FALLING                    |
// | L13  | otherwise                                                        | WAIT — LZ-B in 2:10 ▸▸ · [F] to SKIP         |
// L12's twin (L12, id `landing-L12-band`): no LZ ever passes under the dot while the ship is in the band (a PARTIAL orbit
// whose band arc misses every bracket); with no engine in 1a nothing changes that, so END LANDING is the way on.
// L13's twin (id `landing-L13-noroom`): no in-band LZ has room, and the full window L3b launches in is not here yet:
// `NO ROOM IN THE BAND — LZ-A in 2:10 · [F] to SKIP, or END LANDING` (pace and the SKIP wait on that window).
// Only LZs whose window is in the band are named, waited on or counted down to (review M1). "Open" is
// state.landing.window (landing.ts writes it from the in-band span, risk 13); L13 names an out-of-band window only when
// the landing waits on nothing in band (OUT OF BAND).

export type LandingRow = 'L0' | 'L1' | 'L3' | 'L3b' | 'L4' | 'L5' | 'L6' | 'L7' | 'L11' | 'L12' | 'L12b' | 'L13';

export interface LandingObjective {
  id: string;             // `landing-L4` (twins: `landing-L12-band`, `landing-L13-noroom`): stable per row, the strip retypes on a new id
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
  everyPodDown: boolean;    // every pod of the ship is down (L0's EVERY POD IS DOWN; else NO POD LEFT TO LAUNCH)
  aboard: number;
  falling: number;
  block: boolean;           // NO DROP SOLUTION (L1)
  thrust: boolean;          // the engine delivered thrust this tick (L2: never in 1a)
  // The window open now; `sureInTac`: tactical s until its whole dot fits when that is still ahead this pass (then GET
  // READY counts down to it), else null (it fits now, or never will: a wide drop).
  open: { lz: string; sure: boolean; sureInTac: number | null; full: boolean; down: number; count: number } | null;
  nextWithRoom: string | null;   // the next in-band LZ with projected room other than the open one (L3)
  roomInBand: boolean;      // an LZ whose window is in the band has projected room (else L3b and its wait)
  canLaunch: boolean;       // a pod can launch right now (nextToLaunch)
  bayReady: boolean;        // a slot loaded and the cadence run out
  bayReadyInTac: number;    // tactical s until the bay can launch again (0 when ready)
  stuckPod: number | null;  // no pod can launch now and this one's driver needs a REPAIR (L11)
  anyCanEver: boolean;      // a pod aboard can launch some day (landing-rules driverCanEverLaunch)
  // The next window: the awaited one (in band; `full` when no in-band LZ has room), else the next one (out of band).
  // `inTac`: to its opening; `launchInTac`: to its launch moment (the sure part's opening when it has one).
  next: { lz: string; inTac: number; launchInTac: number; inBand: boolean; full: boolean } | null;
  noBandWindow: boolean;    // pods aboard, and no LZ's window is ever in the band on this orbit (L12's twin)
  skipAvailable: boolean;   // F would start a SKIP now
}

// The next window as L13 names it: the awaited window (landing-rules landingMoment's target), else the next window of any
// LZ (it is out of band). Tactical seconds to its opening (its in-band opening when in band).
function nextWindow(state: Readonly<GameState>, sol: Readonly<DropSolution>, moment: LandingMoment): LandingContext['next'] {
  const now = state.clock.tSec;
  const warp = state.level.tacticalWarp;
  const target = moment.target;
  if (target !== null) {
    return {
      lz: target.lz, inTac: Math.max(0, target.openInSec) / warp, launchInTac: Math.max(0, target.launchInSec) / warp, inBand: true,
      full: target.full,
    };
  }
  const ahead: LzWindow | undefined = windowsAsOf(sol, now).find((w) => secFromNow(sol, w.closeInSec, now) > 0);
  if (ahead === undefined) return null;
  const inTac = Math.max(0, secFromNow(sol, ahead.openInSec, now)) / warp;
  return { lz: ahead.lz, inTac, launchInTac: inTac, inBand: false, full: (lzRemaining(state)[ahead.lz] ?? 0) === 0 };
}

// `skipAvailable`: whether [F] would start a SKIP now (pace skipBlockReason, read by the caller), so this module imports
// nothing stateful.
export function buildLandingContext(state: Readonly<GameState>, sol: Readonly<DropSolution> | null, skipAvailable: boolean): LandingContext {
  if (state.run.phase !== 'landing') throw new Error(`buildLandingContext: not landing (phase ${state.run.phase})`);
  if (sol === null) throw new Error('buildLandingContext: no drop solution in LANDING');
  const { landing } = state;
  const counts = podCounts(state);
  const canEver = driversThatCanEverLaunch(state);
  const moment = landingMoment(state, sol, state.clock.tSec);
  const down = lzDownFill(state);
  const window = landing.window;
  const openLz = window === null ? undefined : landing.lzs.find((lz) => lz.label === window.lz);
  if (window !== null && openLz === undefined) throw new Error(`buildLandingContext: the open window's LZ '${window.lz}' is not on this ship`);
  const momentOpen = moment.open;
  const sureIn = momentOpen === null || momentOpen.launchCome || momentOpen.window === null ? null : momentOpen.window.launchInSec;
  const open = momentOpen === null || openLz === undefined ? null : {
    lz: momentOpen.lz, sure: momentOpen.sure, sureInTac: sureIn !== null && sureIn > 0 ? sureIn / state.level.tacticalWarp : null,
    full: momentOpen.full, down: down[momentOpen.lz] ?? 0, count: openLz.pods,
  };
  // L3's "hold the pods for LZ-B": the next in-band LZ with room (landingMoment's windows are in band only).
  const nextWithRoom = moment.upcoming.find((w) => !w.full && w.lz !== window?.lz)?.lz ?? null;
  const { bay } = landing;
  const bayReadyInTac = bay.loaded >= 1 ? bay.cadenceLeftTac : Math.max(bay.cadenceLeftTac, BAY_RELOAD_TAC - bay.reloadTac);
  // A driver that needs the kid: in memory, aboard, unable to launch, nobody working on it (a repair or a move already
  // running finishes by itself, and the next window will take it), and able to launch some day (L11 never asks for a
  // REPAIR that can't be started: that is L12).
  const stuck = moment.canLaunch ? undefined : canEver.find((driver) => !isLaunchable(driver) && !driver.operating
    && driver.state !== 'repairing' && driver.state !== 'transferring');
  const heldKind = state.ui.activeTool?.kind ?? null;
  return {
    inMind: state.ui.mode === 'memory',
    heldTool: heldKind,
    finalShip: landing.finalShip,
    rootToDelete: state.hollow.finale.phase === 'duel' && !rootDeleteRunning(state) && rootDeletable(state),
    everyPodDown: counts.down === landing.pods.length,
    aboard: counts.aboard,
    falling: counts.falling,
    block: sol.block !== null,
    thrust: state.burn.lastTickDvKmS > 0,
    open,
    nextWithRoom,
    roomInBand: moment.roomInBand,
    canLaunch: moment.canLaunch,
    bayReady: bay.loaded >= 1 && bay.cadenceLeftTac <= 0,
    bayReadyInTac,
    stuckPod: stuck?.pod ?? null,
    anyCanEver: canEver.length > 0,
    next: sol.block === null ? nextWindow(state, sol, moment) : null,
    noBandWindow: counts.aboard > 0 && moment.noBand,
    skipAvailable,
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
  // L0: the final ship is empty and the root is still to delete; the report waits for the duel (finalePending). EVERY
  // POD IS DOWN only when they all are: a ship that parked some (END LANDING, the auto-end) says NO POD LEFT TO LAUNCH.
  if (ctx.finalShip && empty && ctx.rootToDelete) {
    const highlight = ctx.inMind ? toolStepTarget('delete', ctx.heldTool, ROOT_HINT_TARGET) : null;
    return line('L0', ctx.everyPodDown ? LANDING_LINES.L0 : HOLLOW_FINALE.stripWaitsNobody, [], 'now', 'mind', ctx, { highlight });
  }
  if (ctx.block) {
    return line('L1', ctx.inMind ? LANDING_LINES.L1Mind : LANDING_LINES.L1, ctx.inMind ? [] : ['TAB'], 'now', 'mind', ctx, { repairs: 'navplot' });
  }
  // L2 (1a STUB, risk 1): the engine cannot fire during the landing, so thrust here is a bug. 1b opens the engine and
  // this row becomes the flight table's F3–F11 (trims, GO LOWER's KEEP HOLDING).
  if (ctx.thrust && IS_DEV) throw new Error('landingObjective: thrust during the landing (the engine is closed in 1a: L2 is 1b)');
  const open = ctx.open;
  if (open !== null && ctx.aboard > 0) {
    if (open.full && ctx.roomInBand) return line('L3', LANDING_LINES.L3(open.lz, ctx.nextWithRoom), [], 'now', 'ship', ctx);
    // No in-band LZ has room (review M1): this full window is the one launch left, at the mislanded score. Until its
    // launch moment the wait row below counts to it (as GET READY would); RELOADING as usual.
    if (open.full) {
      if (ctx.canLaunch && open.sureInTac === null && ctx.bayReady) return line('L3b', LANDING_LINES.L3b(MISLANDED_FACTOR), ['L'], 'now', 'ship', ctx);
      if (ctx.canLaunch && open.sureInTac === null) return line('L6', LANDING_LINES.L6(ctx.bayReadyInTac), [], 'now', 'ship', ctx);
    } else {
      // The centre is in but the edges are not yet, and they will be this pass: GET READY counts on to the sure part
      // (landingMoment's launch moment), so the first pod never goes half off-site. L5 is for a dot that won't fit at all.
      if (ctx.canLaunch && open.sureInTac !== null) return line('L7', LANDING_LINES.L7(open.lz, open.sureInTac), [], 'now', 'ship', ctx);
      if (ctx.canLaunch && ctx.bayReady) {
        if (open.sure) return line('L4', LANDING_LINES.L4(open.lz, open.down, open.count), ['L'], 'now', 'ship', ctx);
        return line('L5', LANDING_LINES.L5, ['L'], 'now', 'ship', ctx);
      }
      if (ctx.canLaunch) return line('L6', LANDING_LINES.L6(ctx.bayReadyInTac), [], 'now', 'ship', ctx);
    }
  }
  const next = ctx.next;
  if (ctx.aboard > 0 && ctx.canLaunch && next !== null && next.inBand && !next.full && next.launchInTac <= WINDOW_TACTICAL_LEAD_TAC) {
    return line('L7', LANDING_LINES.L7(next.lz, next.launchInTac), [], 'now', 'ship', ctx);
  }
  if (ctx.aboard > 0 && ctx.stuckPod !== null) {
    const highlight = ctx.inMind ? toolStepTarget('repair', ctx.heldTool, podHintTarget(podCode(ctx.stuckPod))) : null;
    const text = ctx.inMind ? LANDING_LINES.L11Mind(ctx.stuckPod) : LANDING_LINES.L11(ctx.stuckPod);
    return line('L11', text, ctx.inMind ? [] : ['TAB'], 'soon', 'mind', ctx, { highlight });
  }
  if (ctx.aboard > 0 && !ctx.anyCanEver) return line('L12', LANDING_LINES.L12, [], 'now', 'ship', ctx);
  if (ctx.aboard > 0 && ctx.noBandWindow) return line('L12', LANDING_LINES.L12band, [], 'now', 'ship', ctx, { id: 'landing-L12-band' });
  if (ctx.aboard > 0 && !ctx.roomInBand && next !== null && next.inBand) {
    const skip = ctx.skipAvailable;
    return line('L13', LANDING_LINES.L13noRoom(next.lz, next.launchInTac, skip), skip ? ['F'] : [], 'wait', 'ship', ctx, { id: 'landing-L13-noroom' });
  }
  if (ctx.aboard === 0) return line('L12b', LANDING_LINES.L12b(ctx.falling), [], 'wait', 'ship', ctx);
  if (next !== null) {
    const skip = ctx.skipAvailable && next.inBand;
    return line('L13', LANDING_LINES.L13(next.lz, next.launchInTac, skip, !next.inBand), skip ? ['F'] : [], 'wait', 'ship', ctx);
  }
  return null;
}

// A ship row that asks for [L] (or counts down to it, or names the POD BAY's END LANDING) says [TAB] first in the MIND,
// as the flight's fromMind does: `LAUNCH NOW — [TAB], press [L] · LZ-A 1/3`. [L] there only buzzes SHIP SCREEN.
const SHIP_ACTION_ROWS: ReadonlySet<LandingRow> = new Set<LandingRow>(['L3b', 'L4', 'L5', 'L6', 'L7', 'L12']);
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
