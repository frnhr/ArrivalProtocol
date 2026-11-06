// Slice 4: Track FLIGHT edits this file for the ROUND tail only (docs/phase3/impl/slice-4-plan.md §5.2).
import type { GameState, GuideLayer, Urgency } from '@state/schema';
import type { DropSolution, LzWindow, RepairHint, TooWide } from '@/types/landing';
import type { Capabilities, CapabilityRole, PlotFaultCause } from '@systems/capabilities';
import type { FsToolKind } from '@/types/fs-tool';
import type { FlightObjective } from '@systems/guidance';
import { secFromNow } from '@systems/landing-solve';
import {
  decayWarnOrbits, driversThatCanEverLaunch, dropTooWide, isLaunchable, landingMoment, lzDownFill, lzRemaining, noGoInReach, podCounts,
  windowsAsOf,
  type LandingMoment,
} from '@systems/landing-rules';
import { capabilitiesNow, plotFault, ROLE_LABEL } from '@systems/capabilities';
import { rootDeletable, rootDeleteRunning } from '@state/selectors';
import { controllerSwapOf, type ControllerSwap } from '@systems/tool-targets';
import { fileHintTarget, podHintTarget, toolStepTarget, ROOT_HINT_TARGET } from '@data/fs-tools';
import { LANDING_DECAY_LINES, LANDING_DROP_LINES, LANDING_GHOST_LINES, LANDING_LINES, LANDING_NODROP_LINES, podCode } from '@data/landing-text';
import { HOLLOW_FINALE } from '@data/hollow-text';
import { IS_DEV } from '@/env';
import {
  BAY_RELOAD_TAC, DROP_UNCERTAIN_LEAD_TAC, MAX_LINE_CHARS, MISLANDED_FACTOR, TACTICAL_LEAD_BURN_TAC,
  WINDOW_TACTICAL_LEAD_TAC,
} from '@data/tuning';

// The landing's guidance table (01-landing §3.11, plan §1.5): the one line that names the next step while the pods go
// down, as flightObjective does for the flight. PURE: buildLandingContext reduces the state and the drop solution to
// "now" and to tactical seconds, and landingObjective picks the first matching row. No match throws in dev (v2 §6.3).
// A separate file from guidance.ts (which re-exports it) so the two tables stay disjoint and the import cycle stays out:
// it imports guidance's TYPES only; the flight's row in landing (L2) is handed in by the caller (guidance landingFlightOf).
//
// Slice 1b (slice-1b-plan §3.0 item 6): every row below is wired to its context field. Track DROP owns this file after
// the foundation (Track ORBIT asks it for row changes); the fields' sources are the stubs in landing-rules (DROP) and
// landing-orbit (ORBIT), so a track fills its function and the row comes alive without editing this file.
//
// | Row  | Situation                                                       | Line                                         |
// | L0   | the final ship is empty and the root can be deleted (the duel)  | EVERY POD IS DOWN — now DELETE THE ROOT      |
// |      | (some parked or never launched: HOLLOW_FINALE.stripWaitsNobody, NO POD LEFT TO LAUNCH — now DELETE THE ROOT)    |
// | L1   | Nav Plotter dead or missing                                     | NO DROP SOLUTION — TAB, REPAIR NAV PLOTTER   |
// | L2   | a flight row applies (guidance landingFlightRow) and: thrust,   | the flight table's row, its id and warn kept |
// |      | the throttle held, no drop dot, the next window out of band, no | (F11-…, GO-LOW-keep, LIFT-…, F4-…, F10-…)    |
// |      | window in band, an impact course (F4); or the OFFERED burn ≤ 8 tac s away, except over an open window a pod  |
// |      | can launch in (L3–L6 first)                                                                                    |
// | L3   | a window is open, its LZ full, another LZ in the band has room  | LZ-A FULL — hold the pods for LZ-B           |
// | L3b  | open, its LZ full, NO in-band LZ has room, launch moment come,  | NO ROOM IN THE BAND — [L] lands in a full LZ |
// |      | bay ready, a pod can launch (the mislanded launch, review M1)   | (¾), or END LANDING                          |
// |      | (its twin `landing-L3b-wide`: the dot never fits this pass)     | NO ROOM … in a full LZ, WIDE DROP            |
// | L4   | open, the whole dot fits, the bay ready, a pod can launch       | LAUNCH NOW — press [L] · LZ-A 1/3            |
// | L5   | open, the dot's centre in but its edges out, bay ready, a pod   | LAUNCH — press [L] · WIDE DROP, some may miss|
// |      | (its twin `landing-L5-nogo`: the dot's span reaches a no-go arc)| LAUNCH — press [L] · WIDE DROP, LAVA in reach|
// | L6   | open, a pod can launch, the bay not ready                       | RELOADING — next pod in 0:02                 |
// | L7   | the next window's launch moment within 8 tac s, a pod can launch| GET READY — LZ-A IN 0:05                     |
// |      | (or it is open, the dot's edges not in yet but coming this pass): GET READY, WAIT and the beeps count to the   |
// |      | launch moment (landing-rules landingMoment: the sure part's opening, else the opening)                         |
// | L7b  | the engine fires by itself (Thrust Ctrl failing), it has fired | THE ENGINE FIRES BY ITSELF — [TAB], SWAP     |
// |      | in this landing, and a SWAP can hand the job to its backup      | THRUST CTRL (`-fixswap`: REPAIR Swap first)  |
// | L8   | Sensor Interp failing or worse, the awaited window ≤ 60 tac s   | DROP UNCERTAIN — TAB, REPAIR SENSOR INTERP   |
// |      | (by plotFault's cause: `-busy` while it repairs or moves, `-missing` with no file)                             |
// | L9   | the awaited LZ has no sure window, a REPAIR or GO LOWER gives one | DROP TOO WIDE FOR LZ-B — TAB, REPAIR POD 05,|
// |      | (landing-rules dropTooWide); ` · [F]` when a SKIP starts and it fits | or fly lower (no TAB in the MIND)        |
// | L10  | decay takes ▼ out of the band within DECAY_WARN_ORBITS orbits    | ORBIT DECAYING — out of the band in 2 orbits |
// | L11  | no pod can launch now, and one aboard needs its driver repaired | POD 07 CAN'T LAUNCH — TAB, REPAIR its driver |
// | L12  | (`landing-L12-bay`, right after L2) Bay Ctrl missing            | NO BAY CTRL — END LANDING parks them in orbit|
// | L12  | (`landing-L12-nodrop`, next) no drop dot, the tank empty or     | NO DROP DOT ON THIS ORBIT — END LANDING ...  |
// |      | short, not on a path into the planet (review M1)                |                                              |
// | L12  | pods aboard and none can ever launch (no driver left, or dead   | NO POD CAN LAUNCH — END LANDING parks them   |
// |      | with no REPAIR left)                                            |                                              |
// | L12b | no pod aboard: pods falling, or the linger before the report    | ALL PODS AWAY · 2 FALLING                    |
// | L13  | otherwise                                                        | WAIT — LZ-B in 2:10 ▸▸ · [F] to SKIP         |
// The order: L0, L1, L2, L12-bay, L12-nodrop, L3, L3b, L4, L5, L6, (L2 for a near offered burn), L7, L7b, L10, L8, L9, L11, L12, L12-band,
// L13-noroom, L13-nodrop, L12b, L13 (foundation review: L12-bay before any window row, since [L] refuses BAY OFFLINE;
// L10 before L8/L9, since a sinking orbit undoes the repair or GO LOWER they ask for).
// L13-nodrop (`landing-L13-nodrop`): no drop dot (an open path, an orbit outside dropSolvable) and no flight row leads,
// while a burn could still bring a dot back (else L12-nodrop).
// L12's twin (L12, id `landing-L12-band`): no LZ ever passes under the dot while the ship is in the band (a PARTIAL orbit
// whose band arc misses every bracket); once the engine is open (1b) L2 leads with the trim whenever a flight row
// applies, so this is reached only with no flight row: a closed loop on an empty tank. A declined trim still leads as L2
// (flightLeads reads the plan's row, not the offer; review minor 6, kept so: that trim is the only way to land anyone
// here, and the decline only stops pace and the SKIP from pulling the kid to it), and END LANDING is the way on.
// L13's twin (id `landing-L13-noroom`): no in-band LZ has room, and the full window L3b launches in is not here yet:
// `NO ROOM IN THE BAND — LZ-A in 2:10 · [F] to SKIP, or END LANDING` (pace and the SKIP wait on that window).
// Only LZs whose window is in the band are named, waited on or counted down to (review M1). "Open" is
// state.landing.window (landing.ts writes it from the in-band span, risk 13); L13 names an out-of-band window only when
// the landing waits on nothing in band (OUT OF BAND).

export type LandingRow = 'L0' | 'L1' | 'L2' | 'L3' | 'L3b' | 'L4' | 'L5' | 'L6' | 'L7' | 'L7b' | 'L8' | 'L9' | 'L10' | 'L11' | 'L12' | 'L12b' | 'L13';

export interface LandingObjective {
  // `landing-L4` (twins: `landing-L12-band`, `landing-L12-bay`, `landing-L13-noroom`, `landing-L5-nogo`, `landing-L8-busy`,
  // `landing-L8-missing`, `landing-L13-nodrop`): stable per row, the strip retypes on a new id. L2 keeps the flight row's own id (`F11-rp-low`).
  id: string;
  row: LandingRow;
  text: string;           // ≤ MAX_LINE_CHARS
  keys: string[];
  urgency: Urgency;
  layer: GuideLayer;      // the screen whose controls do it: ◆ ship, ◇ mind (L0, L1, L11)
  repairs?: CapabilityRole;     // L1, L8, L9: the file whose REPAIR is the fix (the director lights the chip, then the file)
  highlight?: string | null;    // L0 (the root), L9 and L11 (the driver), in the MIND
  warn?: boolean;               // L2: the flight row's warning colour (a dodge's last seconds), kept
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
  // No drop dot with Nav Plotter working: an open path, or an orbit outside the solver's domain (landing-orbit
  // dropSolvable). No window can be named, so L2 leads whenever it has a row, else `landing-L13-nodrop`.
  noDrop: boolean;
  thrust: boolean;          // the engine delivered thrust this tick (L2)
  firing: boolean;          // the throttle is held (the kid's or AUTOBURN's; L2)
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
  // --- Slice 1b ---
  flight: FlightObjective | null;       // the flight's row in landing (guidance landingFlightRow), L2's line
  flightBurnInTac: number | null;       // tactical s to the offered burn's START BURN (landing-orbit offerInTac)
  uncertain: { cause: PlotFaultCause } | null;  // L8: Sensor Interp failing or worse, the awaited window ≤ 60 tac s
  tooWide: TooWide | null;              // L9 (landing-rules dropTooWide)
  decay: { orbits: number } | null;     // L10: ▼ leaves the band in this many orbits (≤ DECAY_WARN_ORBITS)
  bayOffline: boolean;                  // L12-bay: Bay Ctrl missing (capabilities bay.offline)
  lavaInReach: string | null;           // L5's twin: the word of the no-go arc the dot's span reaches (landing-rules noGoInReach)
  // --- Slice 1b review fixes ---
  impact: boolean;          // the ship is on a path into the planet: the flight's row leads (F4, or the empty tank's)
  tankShort: boolean;       // no burn can change the orbit: the tank is empty, or short of the plan's burn (L12-nodrop)
  // L7b (review M2): the engine fires by itself (a failing Thrust Ctrl), it has done so in this landing, and a SWAP can
  // hand the job to its backup (tool-targets controllerSwapOf: the backup's name, and whether the Swap file can do it now).
  ghostSwap: ControllerSwap | null;
  // Slice 4 (Track FLIGHT): AUTOBURN's tail on L13's waits (LandingFlight.autoTail), null with none.
  autoTail?: { text: string; key: string | null } | null;
}

// The flight's part of the landing table, handed in by the caller (guidance landingFlightOf builds it from the flight
// context), so this module imports no guidance values. `row`: landingFlightRow's line, null when no flight row applies;
// `burnInTac`: tactical s to the offered burn's START BURN, null with no offer; `impact` and `tankShort`: the prediction's
// outcome and the tank against the plan's burn (review fixes B1, M1).
export interface LandingFlight {
  row: FlightObjective | null;
  burnInTac: number | null;
  impact: boolean;          // the prediction hits the planet
  tankShort: boolean;       // FUEL is 0, or less than the plan's burn needs (Prediction.fuelShort)
  // Slice 4 (Track FLIGHT, the ROUND tail): AUTOBURN's tail for the wait rows, ` · or [B] ROUND` while [B] would round the
  // orbit, ` · AUTO ARMED` while it waits; `autoKey` the key the tail offers (B), or null. Absent: none.
  autoTail?: { text: string; key: string | null } | null;
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

// L8's state (§3.11): Sensor Interp failing or worse (the grey dot), the window the landing waits on at most
// DROP_UNCERTAIN_LEAD_TAC away, and the blinding file is Sensor Interp (plotFault): its cause picks the wording.
function uncertainOf(caps: Readonly<Capabilities>, moment: LandingMoment, warp: number): LandingContext['uncertain'] {
  if (!caps.drop.uncertain || moment.target === null) return null;
  if (Math.max(0, moment.target.openInSec) / warp > DROP_UNCERTAIN_LEAD_TAC) return null;
  const fault = plotFault(caps);
  return fault !== null && fault.role === 'sensor' ? { cause: fault.cause } : null;
}

// L10's state (§3.7): decay takes ▼ out of the band within DECAY_WARN_ORBITS orbits (landing-rules decayWarnOrbits, the
// rule L9's `goLower` reads too).
function decayOf(state: Readonly<GameState>): LandingContext['decay'] {
  const orbits = decayWarnOrbits(state);
  return orbits === null ? null : { orbits };
}

// `skipAvailable`: whether [F] would start a SKIP now (pace skipBlockReason, read by the caller); `flight`: the flight's
// row in landing (guidance landingFlightOf, read by the caller). So this module imports no guidance or pace values.
export function buildLandingContext(
  state: Readonly<GameState>, sol: Readonly<DropSolution> | null, skipAvailable: boolean, flight: Readonly<LandingFlight>,
): LandingContext {
  if (state.run.phase !== 'landing') throw new Error(`buildLandingContext: not landing (phase ${state.run.phase})`);
  if (sol === null) throw new Error('buildLandingContext: no drop solution in LANDING');
  const { landing } = state;
  const counts = podCounts(state);
  const canEver = driversThatCanEverLaunch(state);
  const caps = capabilitiesNow(state);
  const moment = landingMoment(state, sol, state.clock.tSec, caps.bay.offline);
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
  const solved = sol.block === null;
  return {
    inMind: state.ui.mode === 'memory',
    heldTool: heldKind,
    finalShip: landing.finalShip,
    rootToDelete: state.hollow.finale.phase === 'duel' && !rootDeleteRunning(state) && rootDeletable(state),
    everyPodDown: counts.down === landing.pods.length,
    aboard: counts.aboard,
    falling: counts.falling,
    block: sol.block !== null,
    noDrop: sol.block === null && sol.dot === null,
    thrust: state.burn.lastTickDvKmS > 0,
    firing: state.burn.firing,
    open,
    nextWithRoom,
    roomInBand: moment.roomInBand,
    canLaunch: moment.canLaunch,
    bayReady: bay.loaded >= 1 && bay.cadenceLeftTac <= 0,
    bayReadyInTac,
    stuckPod: stuck?.pod ?? null,
    anyCanEver: canEver.length > 0,
    next: solved ? nextWindow(state, sol, moment) : null,
    noBandWindow: counts.aboard > 0 && moment.noBand,
    skipAvailable,
    flight: flight.row,
    flightBurnInTac: flight.burnInTac,
    uncertain: solved ? uncertainOf(caps, moment, state.level.tacticalWarp) : null,
    tooWide: solved ? dropTooWide(state, sol, caps) : null,
    decay: decayOf(state),
    bayOffline: caps.bay.offline,
    lavaInReach: sol.dot === null ? null : noGoInReach(landing.noGo, sol.dot, state.level.planet.R)?.word ?? null,
    impact: flight.impact,
    tankShort: flight.tankShort,
    ghostSwap: caps.thrustCtrl.ghost !== null && landing.ghostBursts > 0 ? controllerSwapOf(state) : null,
    autoTail: flight.autoTail ?? null,
  };
}

// L13's waits carry AUTOBURN's tail (03 §3.7, slice 4: `WAIT — LZ-B in 2:10 ▸▸ · or [B] ROUND`) when it fits: only a tail, so
// it never outranks a launch, a repair or a burn row.
function withAutoTail(objective: LandingObjective, ctx: LandingContext): LandingObjective {
  const tail = ctx.autoTail ?? null;
  if (tail === null || (objective.text + tail.text).length > MAX_LINE_CHARS) return objective;
  return { ...objective, text: objective.text + tail.text, keys: tail.key === null ? objective.keys : [...objective.keys, tail.key] };
}

function line(
  row: LandingRow, text: string, keys: string[], urgency: Urgency, layer: GuideLayer, ctx: LandingContext,
  extra: Partial<Pick<LandingObjective, 'repairs' | 'highlight' | 'id'>> = {},
): LandingObjective {
  return { id: extra.id ?? `landing-${row}`, row, text, keys, urgency, layer, nextLz: ctx.next?.inBand ? ctx.next.lz : null, ...extra };
}

// L2: the flight's row as it is (its id, words, keys, urgency and layer), so the director's filter, isReleaseRow,
// followDirector and flight-controls' lineAsks read the same step they read in flight.
function flightLine(flight: FlightObjective, ctx: LandingContext): LandingObjective {
  const extra: Partial<Pick<LandingObjective, 'repairs' | 'id'>> = { id: flight.id };
  if (flight.repairs !== undefined) extra.repairs = flight.repairs;
  const objective = line('L2', flight.text, flight.keys, flight.urgency, flight.layer ?? 'ship', ctx, extra);
  return flight.warn === true ? { ...objective, warn: true } : objective;
}

// When the flight's row leads (L2) whatever the window does: a burn is happening, an impact course (F4, or the empty
// tank's row), no drop dot while a burn can still bring one back (with the tank short, L12-nodrop says END LANDING:
// review M1), or the landing can't go on without a burn (the next window out of band, no window in band).
function flightLeads(flight: FlightObjective, ctx: LandingContext): boolean {
  return ctx.thrust || ctx.firing || ctx.impact || flight.id.startsWith('F4') || (ctx.noDrop && !ctx.tankShort)
    || ctx.next?.inBand === false || ctx.noBandWindow;
}

// The offered burn's START BURN is within the lead: L2 leads too, except over an open window a pod can launch in (L3,
// L3b, L4, L5, L6 first: the launch is the moment; the burn waits a pass or is declined, landing.ts).
function flightBurnNear(ctx: LandingContext): boolean {
  return ctx.flight !== null && ctx.flightBurnInTac !== null && ctx.flightBurnInTac <= TACTICAL_LEAD_BURN_TAC;
}

// A waiting row's SKIP tail (risk 12): ` · [F]` when a SKIP would start and the line still fits, else [F] as a key alone,
// so a row that shadows L13's `[F] to SKIP` never takes the SKIP away.
function withSkip(text: string, ctx: LandingContext): { text: string; keys: string[] } {
  if (!ctx.skipAvailable) return { text, keys: [] };
  const tailed = text + LANDING_DROP_LINES.L9skip;
  return { text: tailed.length <= MAX_LINE_CHARS ? tailed : text, keys: ['F'] };
}

// L9's REPAIR as the strip names the file, and what lights in the MIND.
function repairLabel(hint: RepairHint): string {
  switch (hint.file) {
    case 'driver': return podCode(hint.pod);
    case 'sensor': return ROLE_LABEL.sensor;
    case 'navplot': return ROLE_LABEL.navplot;
    default: throw new Error(`repairLabel: unknown file '${String((hint as RepairHint).file)}'`);
  }
}

// L9: a REPAIR-naming line is a MIND row (it lights Sensor Interp's or Nav Plotter's chip, or the driver once REPAIR is
// in hand) and says TAB from the ship, as L1, L8 and L11 do; GO LOWER alone is a ship row (the burn is timed by L2, and
// from the MIND fromMind adds the [TAB]). Both keep the SKIP (risk 12): L9 shadows L13's `[F] to SKIP`.
function tooWideLine(wide: TooWide, ctx: LandingContext): LandingObjective {
  const repair = wide.repair;
  if (repair === null && wide.goLower === null) throw new Error(`tooWideLine: L9 for ${wide.lz} with neither a REPAIR nor GO LOWER (dropTooWide returns null then)`);
  const tab = repair !== null && !ctx.inMind;
  const { text, keys } = withSkip(LANDING_DROP_LINES.L9(wide.lz, repair === null ? null : repairLabel(repair), wide.goLower !== null, tab), ctx);
  if (repair === null) return line('L9', text, keys, 'soon', 'ship', ctx);
  const withTab = tab ? ['TAB', ...keys] : keys;
  if (repair.file !== 'driver') return line('L9', text, withTab, 'soon', 'mind', ctx, { repairs: repair.file });
  const highlight = ctx.inMind ? toolStepTarget('repair', ctx.heldTool, podHintTarget(podCode(repair.pod))) : null;
  return line('L9', text, withTab, 'soon', 'mind', ctx, { highlight });
}

// L7b: SWAP Thrust Ctrl to its backup, as the flight's F2 words a SWAP (from the ship [TAB] first; in the MIND the SWAP
// chip, then the file, lit as the VESPER lesson does), or REPAIR the Swap file first when it is too damaged to pick up.
// It keeps the SKIP (risk 12: it shadows L13's `[F] to SKIP`).
function ghostLine(swap: ControllerSwap, ctx: LandingContext): LandingObjective {
  const tab = ctx.inMind ? [] : ['TAB'];
  if (!swap.swapReady) {
    const { text, keys } = withSkip(ctx.inMind ? LANDING_GHOST_LINES.fixSwapMind : LANDING_GHOST_LINES.fixSwap, ctx);
    return line('L7b', text, [...tab, ...keys], 'soon', 'mind', ctx, { id: 'landing-L7b-fixswap' });
  }
  const { text, keys } = withSkip(ctx.inMind ? LANDING_GHOST_LINES.swapMind(swap.name) : LANDING_GHOST_LINES.swap, ctx);
  const highlight = ctx.inMind ? toolStepTarget('swap', ctx.heldTool, fileHintTarget('thrust-ctrl')) : null;
  return line('L7b', text, [...tab, ...keys], 'soon', 'mind', ctx, { highlight });
}

function uncertainLine(cause: PlotFaultCause, ctx: LandingContext): LandingObjective {
  switch (cause) {
    case 'hurt':
      return line('L8', ctx.inMind ? LANDING_DROP_LINES.L8Mind : LANDING_DROP_LINES.L8, ctx.inMind ? [] : ['TAB'], 'soon', 'mind', ctx,
        { repairs: 'sensor' });
    case 'repairing':
    case 'moving':
      return line('L8', LANDING_DROP_LINES.L8busy(cause), [], 'soon', 'mind', ctx, { id: 'landing-L8-busy' });
    case 'missing': {
      const { text, keys } = withSkip(LANDING_DROP_LINES.L8missing, ctx);
      return line('L8', text, keys, 'wait', 'ship', ctx, { id: 'landing-L8-missing' });
    }
    default: throw new Error(`uncertainLine: unknown cause '${String(cause)}'`);
  }
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
  // L2: the engine is open in LANDING (1b): the flight's row leads while a burn happens, or while the landing needs one
  // (trims, GO LOWER's KEEP HOLDING, the 'lift' burn, DON'T HIT THE PLANET, F9/F10 on an open path).
  const flight = ctx.flight;
  if (flight !== null && flightLeads(flight, ctx)) return flightLine(flight, ctx);
  // L12-bay: with Bay Ctrl missing no window and no REPAIR helps (landingMoment's canLaunch and awaited are false).
  if (ctx.aboard > 0 && ctx.bayOffline) return line('L12', LANDING_DROP_LINES.L12bay, [], 'now', 'ship', ctx, { id: 'landing-L12-bay' });
  // L12-nodrop (review M1): no drop dot and no burn can bring one back. Not on a path into the planet: END LANDING is
  // refused there, and the flight's row says what saves the ship.
  if (ctx.aboard > 0 && ctx.noDrop && ctx.tankShort && !ctx.impact) {
    return line('L12', LANDING_NODROP_LINES.L12noDrop, [], 'now', 'ship', ctx, { id: 'landing-L12-nodrop' });
  }
  const open = ctx.open;
  const burnNear = flightBurnNear(ctx);
  if (flight !== null && burnNear && !(open !== null && ctx.aboard > 0 && ctx.canLaunch)) return flightLine(flight, ctx);
  if (open !== null && ctx.aboard > 0) {
    if (open.full && ctx.roomInBand) return line('L3', LANDING_LINES.L3(open.lz, ctx.nextWithRoom), [], 'now', 'ship', ctx);
    // No in-band LZ has room (review M1): this full window is the one launch left, at the mislanded score. Until its
    // launch moment the wait row below counts to it (as GET READY would); RELOADING as usual.
    if (open.full) {
      if (ctx.canLaunch && open.sureInTac === null && ctx.bayReady) {
        // Its twin when the dot never fits this pass (review minor 8): WIDE DROP, as L5 says it.
        if (!open.sure) return line('L3b', LANDING_DROP_LINES.L3bWide, ['L'], 'now', 'ship', ctx, { id: 'landing-L3b-wide' });
        return line('L3b', LANDING_LINES.L3b(MISLANDED_FACTOR), ['L'], 'now', 'ship', ctx);
      }
      if (ctx.canLaunch && open.sureInTac === null) return line('L6', LANDING_LINES.L6(ctx.bayReadyInTac), [], 'now', 'ship', ctx);
    } else {
      // The centre is in but the edges are not yet, and they will be this pass: GET READY counts on to the sure part
      // (landingMoment's launch moment), so the first pod never goes half off-site. L5 is for a dot that won't fit at all.
      if (ctx.canLaunch && open.sureInTac !== null) {
        if (flight !== null && burnNear) return flightLine(flight, ctx);
        return line('L7', LANDING_LINES.L7(open.lz, open.sureInTac), [], 'now', 'ship', ctx);
      }
      if (ctx.canLaunch && ctx.bayReady) {
        if (open.sure) return line('L4', LANDING_LINES.L4(open.lz, open.down, open.count), ['L'], 'now', 'ship', ctx);
        if (ctx.lavaInReach !== null) {
          return line('L5', LANDING_DROP_LINES.L5noGo(ctx.lavaInReach), ['L'], 'now', 'ship', ctx, { id: 'landing-L5-nogo' });
        }
        return line('L5', LANDING_LINES.L5, ['L'], 'now', 'ship', ctx);
      }
      if (ctx.canLaunch) return line('L6', LANDING_LINES.L6(ctx.bayReadyInTac), [], 'now', 'ship', ctx);
    }
  }
  if (flight !== null && burnNear) return flightLine(flight, ctx);
  const next = ctx.next;
  if (ctx.aboard > 0 && ctx.canLaunch && next !== null && next.inBand && !next.full && next.launchInTac <= WINDOW_TACTICAL_LEAD_TAC) {
    return line('L7', LANDING_LINES.L7(next.lz, next.launchInTac), [], 'now', 'ship', ctx);
  }
  // L7b (review M2): the engine fires by itself. Its bursts sink ▼ under the planet in minutes, mostly unseen inside
  // SKIPs (only the landing's first stops one), so the strip names the cause and its fix before any wait.
  if (ctx.aboard > 0 && ctx.ghostSwap !== null) return ghostLine(ctx.ghostSwap, ctx);
  // L10 above L8 and L9: a sinking orbit undoes any repair or GO LOWER. It carries the 'lift' burn's key only (a LIFT-*
  // row; never GO LOWER's [S], which would sink it faster); the row leads as L2 once that burn is near.
  if (ctx.aboard > 0 && ctx.decay !== null) {
    const keys = flight !== null && flight.id.startsWith('LIFT') ? flight.keys : [];
    return line('L10', LANDING_DECAY_LINES.L10(ctx.decay.orbits), keys, 'soon', 'ship', ctx);
  }
  if (ctx.aboard > 0 && ctx.uncertain !== null) return uncertainLine(ctx.uncertain.cause, ctx);
  if (ctx.aboard > 0 && ctx.tooWide !== null) return tooWideLine(ctx.tooWide, ctx);
  if (ctx.aboard > 0 && ctx.stuckPod !== null) {
    const highlight = ctx.inMind ? toolStepTarget('repair', ctx.heldTool, podHintTarget(podCode(ctx.stuckPod))) : null;
    const text = ctx.inMind ? LANDING_LINES.L11Mind(ctx.stuckPod) : LANDING_LINES.L11(ctx.stuckPod);
    return line('L11', text, ctx.inMind ? [] : ['TAB'], 'soon', 'mind', ctx, { highlight });
  }
  if (ctx.aboard > 0 && !ctx.anyCanEver) return line('L12', LANDING_LINES.L12, [], 'now', 'ship', ctx);
  if (ctx.aboard > 0 && ctx.noBandWindow) return line('L12', LANDING_LINES.L12band, [], 'now', 'ship', ctx, { id: 'landing-L12-band' });
  if (ctx.aboard > 0 && !ctx.roomInBand && next !== null && next.inBand) {
    const skip = ctx.skipAvailable;
    return withAutoTail(line('L13', LANDING_LINES.L13noRoom(next.lz, next.launchInTac, skip), skip ? ['F'] : [], 'wait', 'ship', ctx, { id: 'landing-L13-noroom' }), ctx);
  }
  // No drop dot and no flight row to lead (B1 of the foundation review): say why no window is named, never throw.
  if (ctx.aboard > 0 && ctx.noDrop) return line('L13', LANDING_NODROP_LINES.L13noDrop, [], 'wait', 'ship', ctx, { id: 'landing-L13-nodrop' });
  if (ctx.aboard === 0) return line('L12b', LANDING_LINES.L12b(ctx.falling), [], 'wait', 'ship', ctx);
  if (next !== null) {
    const skip = ctx.skipAvailable && next.inBand;
    return withAutoTail(line('L13', LANDING_LINES.L13(next.lz, next.launchInTac, skip, !next.inBand), skip ? ['F'] : [], 'wait', 'ship', ctx), ctx);
  }
  return null;
}

// A ship row that asks for [L] (or counts down to it, or names the POD BAY's END LANDING) says [TAB] first in the MIND,
// as the flight's fromMind does: `LAUNCH NOW — [TAB], press [L] · LZ-A 1/3`. [L] there only buzzes SHIP SCREEN. L9's
// GO LOWER alone (a ship row: the burn is flown from the amber screen) does too: `DROP TOO WIDE FOR LZ-C — [TAB], fly lower`.
const SHIP_ACTION_ROWS: ReadonlySet<LandingRow> = new Set<LandingRow>(['L3b', 'L4', 'L5', 'L6', 'L7', 'L9', 'L12']);
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
