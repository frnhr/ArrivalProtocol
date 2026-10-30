// Slice 1b, Track DROP: the drop-width model and its rules (01-landing §3.2–§3.6, §3.8, §3.11; slice-1b-plan §1.5, §4).
// Mostly pure: the factor tables by band (dropFactors never throws, a dead driver included), §3.2's m = 1.5 / 2 / 3 rows
// against windowsFor (widths ±1 km, sure seconds ±0.3 s, "never fits"), `uncertain`, no solution without Nav Plotter, Bay
// Ctrl's cadence by band and BAY OFFLINE in the refusal order, no-go scoring on every class and the guard in the arc's
// own word, the reach of a wide dot (L5's LAVA in reach), the 150 km rule, bestRepairForDrop's picks and L9's verdict
// (GO LOWER on crafted inputs: goLowerFit is ORBIT's), every DROP line within the strip with worst-case values. Then two
// short games on ARES-VII from a constructed lock: run 1's POD 02 (×2) with Sensor Interp at 78 (×1.5) is too wide for
// LZ-A, so the lesson and L9 name the REPAIR; and Bay Ctrl gone: NO BAY CTRL, [L] refused, the landing ends by itself.
import { check, finish } from './checks';
import { lockOn } from './harness-landing';
import { createHarness5 } from '../wp5/harness5';
import { createInitialState } from '@state/initial';
import type { GameState } from '@state/schema';
import type { DriverSegment, Segment, SegmentRole, SegmentState } from '@/types/segment';
import type { DropFactors, DropSolution, LandingState, LzState, LzWidth, NoGoArcState, ShipLandingDef } from '@/types/landing';
import { deriveCapabilities, BAND_COPY, BANDS, type Capabilities } from '@systems/capabilities';
import {
  bestRepairForDrop, bayOfflineIn, classifyLanding, dropFactors, dropTooWide, driverDropFactor, landingMoment, landingStuck,
  launchGuard, launchGuardText, launchRefusal, noGoInReach, podPoints, tooWideVerdict,
} from '@systems/landing-rules';
import { computeDropSolution, dropHalfWidthKm, type DropSolveInput } from '@systems/landing-solve';
import { requestLaunch } from '@systems/landing';
import { getDropSolution } from '@systems/drop-cache';
import { stateFromElements, type OrbitState } from '@/types/orbit';
import { getShip, SHIPS } from '@data/ships';
import { validateLandingDef } from '@data/landing-def';
import { DRIVER_RULES } from '@data/script';
import {
  LANDING_DROP_LINES, LANDING_END_TEXT, LANDING_LESSONS_1B, LAUNCH_REFUSAL_TEXT, LAUNCH_CONFIRM_TEXT,
} from '@data/landing-text';
import { DELETE_EFFECT } from '@data/tool-text';
import {
  BAY_SLOTS, COLONISTS_PER_POD, DOT_WIDE_LESSON_SEC, LANDING_NONE_LEFT_SEC, LANDING_TACTICAL_WARP, LZ_WIDTH_KM, MAX_LINE_CHARS,
  NO_GO_NEAR_EDGE_KM, OFF_SITE_SCORE_BY_CLASS,
} from '@data/tuning';

const R = 3390;
const MU = 43000;
const DEG = Math.PI / 180;
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

// --- Capabilities on the seed's memory, one role's file set to an integrity (or a state), or gone ----------------------
function seed(): GameState {
  return createInitialState({ seed: 1 });
}
function fileOf(state: GameState, role: SegmentRole): Segment & { integrity: number; state?: SegmentState } {
  const found = state.memory.find((seg) => seg.role === role);
  if (!found || !('integrity' in found)) throw new Error(`drop-model: the seed has no ${role} file`);
  return found as Segment & { integrity: number; state?: SegmentState };
}
function capsWith(set: Partial<Record<SegmentRole, number | null>>, offline: Partial<Record<SegmentRole, SegmentState>> = {}): Capabilities {
  const state = seed();
  for (const [role, integrity] of Object.entries(set) as [SegmentRole, number | null][]) {
    const seg = fileOf(state, role);
    if (integrity === null) state.memory[state.memory.indexOf(seg)] = { id: `gone-${role}`, name: 'Free', type: 'free', size: seg.size };
    else seg.integrity = integrity;
  }
  for (const [role, segState] of Object.entries(offline) as [SegmentRole, SegmentState][]) fileOf(state, role).state = segState;
  return deriveCapabilities(state, 0);
}
function driver(pod: number, integrity: number): DriverSegment {
  return { id: `driver_pod${pod}`, name: `POD ${pod}`, type: 'driver', size: 8, integrity, pod, family: `Fam${pod}`, colonists: COLONISTS_PER_POD, featured: [] };
}
const product = (f: DropFactors): number => f.sensor * f.plotter * f.driver;

// --- The factor tables (§3.8) ------------------------------------------------------------------------------------------
{
  const healthy = capsWith({ sensor: 100 });
  const driverRows: [number, number][] = [[100, 1], [80, 1], [79, 1.5], [50, 1.5], [49, 2], [25, 2], [24, 2], [0, 2]];
  const wrongDriver = driverRows.filter(([integrity, factor]) => dropFactors(healthy, driver(1, integrity)).driver !== factor);
  check('a driver\'s factor by band: ok 1, degraded 1.5, failing 2, dead 2 (display only, never throws)', wrongDriver.length === 0
    && driverDropFactor(10) === 2, wrongDriver.map(([integrity]) => integrity).join(', '));
  check('no pod named: the driver\'s factor is 1', dropFactors(healthy, null).driver === 1 && product(dropFactors(healthy, null)) === 1);
  const sensorRows: [number | null, number][] = [[100, 1], [79, 1.5], [49, 2.5], [24, 2.5], [null, 2.5]];
  const wrongSensor = sensorRows.filter(([integrity, factor]) => dropFactors(capsWith({ sensor: integrity }), null).sensor !== factor);
  check('Sensor Interp\'s factor: ok 1, degraded 1.5, failing / dead / missing 2.5', wrongSensor.length === 0, wrongSensor.map(String).join(' | '));
  const plotterRows: [number | null, number][] = [[100, 1], [79, 1.25], [49, 1.5], [24, 1], [null, 1]];
  const wrongPlotter = plotterRows.filter(([integrity, factor]) => dropFactors(capsWith({ sensor: 100, navplot: integrity }), null).plotter !== factor);
  check('Nav Plotter\'s factor: ok 1, degraded 1.25, failing 1.5 (dead and missing: no solution, 1)', wrongPlotter.length === 0,
    wrongPlotter.map(String).join(' | '));
  check('a Sensor Interp being repaired is offline: ×2.5 and the grey dot for the repair\'s seconds (risk 16)',
    dropFactors(capsWith({ sensor: 60 }, { sensor: 'repairing' }), null).sensor === 2.5 && capsWith({ sensor: 60 }, { sensor: 'repairing' }).drop.uncertain);
  check('the factors multiply: run 1\'s POD 02 (44) with Sensor Interp at 78 is ×3', product(dropFactors(capsWith({}), driver(2, 44))) === 3);
}

// --- §3.2's table, m = 1.5 / 2 / 3, against windowsFor ------------------------------------------------------------------
{
  const circular = (r: number): OrbitState => stateFromElements(r, 0, 0, 0, MU);
  const standard: LzState = { label: 'LZ-A', centreRad: 150 * DEG, halfWidthRad: LZ_WIDTH_KM.standard / 2 / R, widthKm: LZ_WIDTH_KM.standard, pods: 4, ground: 'flat' };
  const input = (r: number, factors: DropFactors): DropSolveInput => ({
    state: circular(r), tSec: 0, mu: MU, R, ring: { min: 4000, max: 10000 }, lzs: [standard], factors, solution: true, uncertain: false,
    validUntilTSec: null, solvable: true,
  });
  // The factors as the files give them: a degraded Sensor Interp (×1.5), a failing driver (×2), both (×3).
  const m15 = dropFactors(capsWith({}), driver(1, 100));
  const m2 = dropFactors(capsWith({ sensor: 100 }), driver(1, 40));
  const m3 = dropFactors(capsWith({}), driver(1, 40));
  check('the files give m = 1.5, 2 and 3', product(m15) === 1.5 && product(m2) === 2 && product(m3) === 3);
  // [r, factors, ±km, sure tac s or null for "never fits"]
  const rows: [number, DropFactors, number, number | null][] = [
    [5000, m15, 72, 6.4], [5000, m2, 97, 5.2], [5000, m3, 145, 2.8],
    [6000, m15, 117, 5.5], [6000, m2, 157, 2.9], [6000, m3, 235, null],
    [7000, m15, 162, 3.1], [7000, m2, 217, null],
  ];
  const wrong: string[] = [];
  for (const [r, factors, km, sure] of rows) {
    const w = computeDropSolution(input(r, factors)).windows[0]!;
    const tac = w.sureOpenInSec === null || w.sureCloseInSec === null ? null : (w.sureCloseInSec - w.sureOpenInSec) / LANDING_TACTICAL_WARP;
    const widthOk = near(w.halfWidthKm, km, 1);
    const sureOk = sure === null ? tac === null : tac !== null && near(tac, sure, 0.3);
    if (!widthOk || !sureOk) wrong.push(`${r} ×${product(factors)}: ±${w.halfWidthKm.toFixed(1)} km, ${tac === null ? 'never' : tac.toFixed(2)} s`);
  }
  check('§3.2: ±72/97/145 km at 5,000 (6.4/5.2/2.8 s), ±117/157 at 6,000 (5.5/2.9 s, ×3 never), ±162 at 7,000 (3.1 s, ×2 never)',
    wrong.length === 0, wrong.join(' | '));
}

// --- uncertain, no solution ---------------------------------------------------------------------------------------------
{
  const uncertainRows: [number | null, boolean][] = [[100, false], [79, false], [49, true], [24, true], [null, true]];
  check('uncertain (the grey dot) for a failing, dead or missing Sensor Interp', uncertainRows.every(([integrity, want]) =>
    capsWith({ sensor: integrity }).drop.uncertain === want));
  const ship = stateFromElements(6000, 0, 0, 0, MU);
  const base = { state: ship, tSec: 0, mu: MU, R, ring: { min: 5000, max: 7000 }, lzs: [], factors: dropFactors(capsWith({ sensor: 40 }), null),
    validUntilTSec: null, solvable: true } as const;
  const grey = computeDropSolution({ ...base, solution: true, uncertain: capsWith({ sensor: 40 }).drop.uncertain });
  check('…the solution and its dot carry it (±195 km at 6,000 with Sensor Interp failing)', grey.uncertain && grey.dot?.uncertain === true
    && near(grey.dot.halfWidthKm, 195, 1), JSON.stringify(grey.dot));
  const noPlot = [capsWith({ navplot: 24 }), capsWith({ navplot: null })];
  check('no drop solution with Nav Plotter dead or missing (L1, NO DROP SOLUTION)', noPlot.every((caps) => !caps.drop.solution
    && computeDropSolution({ ...base, solution: caps.drop.solution, uncertain: false }).block === 'no-solution'));
}

// --- Bay Ctrl: the cadence by band and BAY OFFLINE in the refusal order -------------------------------------------------
interface Fake {
  bay?: number | null;
  mode?: GameState['ui']['mode'];
  dv?: number;
  noGo?: NoGoArcState[];
  lzs?: LzState[];
  memory?: Segment[];
  forgiveness?: LandingState['forgiveness'];
}
function bayCtrl(integrity: number): Segment {
  return { id: 'bay', name: 'Bay Ctrl', type: 'ship', role: 'bay', size: 6, integrity, scanned: false } as Segment;
}
function lzAt(label: string, centreDeg: number, width: LzWidth, pods = 4): LzState {
  return { label, centreRad: centreDeg * DEG, halfWidthRad: LZ_WIDTH_KM[width] / 2 / R, widthKm: LZ_WIDTH_KM[width], pods, ground: 'flat' };
}
function fake(opts: Fake = {}): GameState {
  const memory = opts.memory ?? [driver(1, 100)];
  const landing = {
    lzs: opts.lzs ?? [lzAt('LZ-A', 90, 'standard')], noGo: opts.noGo ?? [], forgiveness: opts.forgiveness ?? 'gentle', terrain: 'PLAINS',
    drag: false, finalShip: false, lead: 1, hurt: [], colonyFirstRun: null, colony: null,
    pods: memory.filter((seg): seg is DriverSegment => seg.type === 'driver').map((d) => ({ pod: d.pod, family: d.family, colonists: d.colonists,
      featured: [], driverLost: null, restored: false, fate: { kind: 'aboard' } })),
    bay: { loaded: BAY_SLOTS, reloadTac: 0, cadenceLeftTac: 0 }, loadNext: null, startedAtTSec: 0, ended: null, lingerAiSec: null,
    noDriverAiSec: 0, window: null, fuelAtEndPct: null, orbitEpoch: 0, decay: { lastKickTSec: null, kicks: 0, last: null }, goLow: null, declined: null, ghostBursts: 0,
  };
  return {
    run: { phase: 'landing' }, clock: { paused: false, tSec: 0 }, ui: { mode: opts.mode ?? 'tools' }, burn: { lastTickDvKmS: opts.dv ?? 0 },
    memory: opts.bay === null ? memory : [...memory, bayCtrl(opts.bay ?? 100)], level: { planet: { R } }, landing,
  } as unknown as GameState;
}
function dotAt(deg: number, halfWidthKm = 78, block: DropSolution['block'] = null): DropSolution {
  return {
    asOfTSec: 0, periodSec: 14000, block, dot: block ? null : { rad: deg * DEG, halfWidthKm, launchRadius: 6000, inBand: true, uncertain: false },
    arc: [], windows: [], uncertain: false, validUntilTSec: null,
  };
}
{
  const cadence = [100, 79, 49, 24].map((integrity) => capsWith({ bay: integrity }).bay.cadenceTac);
  check('Bay Ctrl\'s cadence by band: 2.0 / 2.7 / 4.0 / 10.0 tac s', cadence.join() === '2,2.7,4,10', cadence.join());
  const gone = capsWith({ bay: null }).bay;
  check('…missing: BAY OFFLINE (no cadence), said NO BAY CTRL', gone.offline && gone.cadenceTac === null && BAND_COPY.bay.missing === 'NO BAY CTRL'
    && LAUNCH_REFUSAL_TEXT['BAY OFFLINE'].startsWith('NO BAY CTRL'));
  const kid = { source: 'player', fromMind: false } as const;
  check('BAY OFFLINE comes after SHIP SCREEN…', launchRefusal(fake({ bay: null, mode: 'memory' }), null, kid) === 'SHIP SCREEN');
  check('…and before ENGINE FIRING, NO DROP SOLUTION and every bay reason', launchRefusal(fake({ bay: null, dv: 0.01 }), dotAt(0, 78, 'no-solution'), kid) === 'BAY OFFLINE'
    && launchRefusal(fake({ bay: null }), dotAt(90), kid) === 'BAY OFFLINE' && bayOfflineIn(fake({ bay: null })));
  check('…a dead Bay Ctrl still launches (one pod at a time), a healthy one too', launchRefusal(fake({ bay: 10 }), dotAt(90), kid) === null
    && launchRefusal(fake(), dotAt(90), kid) === null && !bayOfflineIn(fake({ bay: 10 })));
  check('landingStuck: Bay Ctrl gone with pods aboard ends the landing \'bay-offline\' (before \'no-driver-left\')',
    landingStuck(fake({ bay: null }), null) === 'bay-offline' && landingStuck(fake({ bay: null, memory: [driver(1, 10)] }), null) === 'bay-offline'
    && landingStuck(fake({ memory: [driver(1, 10)] }), null) === 'no-driver-left' && landingStuck(fake(), null) === null);
  check('…and with Bay Ctrl gone nothing is awaited and no pod can launch (no TACTICAL, WINDOW OPEN or GET READY)', (() => {
    const moment = landingMoment(fake({ bay: null }), dotAt(90), 0, true);
    return !moment.awaited && !moment.canLaunch && moment.target === null;
  })());
}

// --- No-go arcs: scoring, the guard, the reach ---------------------------------------------------------------------------
function runtimeOf(def: ShipLandingDef): { lzs: LzState[]; noGo: NoGoArcState[] } {
  return {
    lzs: def.lzs.map((lz) => lzAt(lz.label, lz.centreDeg, lz.width, lz.pods)),
    noGo: def.noGo.map((arc) => ({ centreRad: arc.centreDeg * DEG, halfWidthRad: (arc.widthDeg / 2) * DEG, word: arc.word })),
  };
}
{
  const classes = Object.keys(OFF_SITE_SCORE_BY_CLASS) as LandingState['forgiveness'][];
  const zero = classes.every((cls) => podPoints('no-go', 'soft', cls, COLONISTS_PER_POD) === 0 && podPoints('no-go', 'hard', cls, COLONISTS_PER_POD) === 0);
  check(`a pod in a no-go arc scores 0 on every class (${classes.join(', ')}), soft or hard`, zero && classes.length === 3);
  const armed = SHIPS.filter((ship) => ship.landing.noGo.length > 0);
  check('VESPER and LAST LIGHT carry the no-go arcs (LAVA ×2, CLIFFS)', armed.map((ship) => ship.landing.noGo.map((arc) => arc.word).join('+')).join(', ')
    === 'LAVA+LAVA, CLIFFS', armed.map((ship) => ship.name).join(', '));
  for (const ship of armed) {
    const { lzs, noGo } = runtimeOf(ship.landing);
    const fill = Object.fromEntries(lzs.map((lz) => [lz.label, 0]));
    const everyArc = noGo.every((arc) => classifyLanding(lzs, noGo, arc.centreRad, fill).place === 'no-go'
      && classifyLanding(lzs, noGo, arc.centreRad + arc.halfWidthRad * 0.99, fill).place === 'no-go'
      && classifyLanding(lzs, noGo, arc.centreRad + arc.halfWidthRad * 1.01, fill).place === 'off-site');
    check(`${ship.name}: a landing point over an arc is NO-GO, just past its edge off-site`, everyArc);
    const arc = noGo[0]!;
    const guard = launchGuard(fake({ lzs, noGo, forgiveness: ship.landing.forgiveness }), dotAt(arc.centreRad / DEG));
    check(`${ship.name}: [L] over the arc asks \`LAUNCH INTO ${arc.word}? scores 0\``, guard?.ask === 'no-go' && guard.word === arc.word && guard.points === 0
      && launchGuardText(guard, ship.landing.terrain) === `LAUNCH INTO ${arc.word}? scores 0`, JSON.stringify(guard));
  }
  // The reach (risk 13): VESPER's LZ-B ends at 183.38°, its lava starts at 184.9° (90 km on). A dot centred at 183.0° (in
  // the bracket) reaches the lava at ±117 km (Sensor Interp degraded at 6,000 km) but not at ±78 (healthy).
  const vesper = runtimeOf(getShip(3).landing);
  const wide = noGoInReach(vesper.noGo, dotAt(183.0, 117).dot!, R);
  check('noGoInReach: VESPER\'s LZ-B edge, ±117 km reaches the LAVA, ±78 km does not', wide?.word === 'LAVA'
    && noGoInReach(vesper.noGo, dotAt(183.0, 78).dot!, R) === null);
  // A healthy SURE launch (the whole dot in the bracket) never reaches it (§2.1): the dot's far edge at LZ-B's edge.
  const sureEdge = 180 + LZ_WIDTH_KM.standard / 2 / R / DEG - 78 / R / DEG;
  check('…a healthy sure launch never does (plan §2.1)', noGoInReach(vesper.noGo, dotAt(sureEdge, 78).dot!, R) === null);
  check('…before NARROW LZ-C too: a dot at 298.2° reaches the lava ending at 296.4° at ±117 km', noGoInReach(vesper.noGo, dotAt(298.2, 117).dot!, R)?.word === 'LAVA'
    && noGoInReach(vesper.noGo, dotAt(298.2, 78).dot!, R) === null);
  check('…and no arcs, no reach (ARES-VII)', noGoInReach([], dotAt(183.0, 400).dot!, R) === null);
}

// --- The 150 km rule (§3.6, §3.15) -------------------------------------------------------------------------------------
{
  const gapKm = (def: ShipLandingDef): number => Math.min(...def.noGo.flatMap((arc) => def.lzs.map((lz) => {
    const apart = Math.min(Math.abs(arc.centreDeg - lz.centreDeg), 360 - Math.abs(arc.centreDeg - lz.centreDeg));
    return (apart - arc.widthDeg / 2 - (LZ_WIDTH_KM[lz.width] / 2 / R) / DEG) * DEG * R;
  })));
  const vesper = getShip(3);
  const last = getShip(4);
  const passes = (def: ShipLandingDef, pods: number): boolean => { try { validateLandingDef('t', def, pods, R); return true; } catch { return false; } };
  check('VESPER and LAST LIGHT pass the 150 km rule (their nearest arcs 88–90 km from a bracket edge)',
    passes(vesper.landing, 12) && passes(last.landing, 16) && near(gapKm(vesper.landing), 88, 3) && near(gapKm(last.landing), 88, 3),
    `${gapKm(vesper.landing).toFixed(0)} km, ${gapKm(last.landing).toFixed(0)} km`);
  // ARES-VII's WIDE LZ-A (160°) ends at 164.22°; a 4° arc's near edge 200 km (3.38°) past it is centred at 169.6°.
  const ares = getShip(0).landing;
  const arcAt = (gapKmWanted: number): ShipLandingDef => ({ ...ares, noGo: [{ centreDeg: 160 + (LZ_WIDTH_KM.wide / 2 / R) / DEG + gapKmWanted / R / DEG + 2, widthDeg: 4, word: 'LAVA' }] });
  check(`a crafted arc 200 km from the nearest bracket edge throws; 140 km passes (NO_GO_NEAR_EDGE_KM ${NO_GO_NEAR_EDGE_KM})`,
    !passes(arcAt(200), 3) && passes(arcAt(140), 3) && near(gapKm(arcAt(200)), 200, 0.5));
}

// --- bestRepairForDrop and L9's verdict ------------------------------------------------------------------------------------
{
  const repairTool = { id: 'repair', name: 'Repair', type: 'fs-tool', size: 4, integrity: 100, scanned: true, fsTool: 'repair', version: 1 } as Segment;
  // The seed's memory (Sensor Interp 78, Nav Plotter 100, REPAIR CHARGE) with a Repair, the next pod's driver at `next`.
  const shipWith = (next: number, set: Partial<Record<SegmentRole, number>> = {}, opts: { repair?: boolean; sensorState?: SegmentState } = {}): GameState => {
    const state = seed();
    state.memory = state.memory.filter((seg) => seg.type !== 'driver');
    state.memory.push(driver(1, next), ...(opts.repair === false ? [] : [repairTool]));
    for (const [role, integrity] of Object.entries(set) as [SegmentRole, number][]) fileOf(state, role).integrity = integrity;
    if (opts.sensorState) fileOf(state, 'sensor').state = opts.sensorState;
    state.level.planet = { ...state.level.planet, R };
    return state;
  };
  const wideLz = lzAt('LZ-A', 160, 'wide');
  const pick = (state: GameState, radius: number): string => {
    const hint = bestRepairForDrop(state, deriveCapabilities(state, 0), wideLz, radius);
    return hint === null ? 'none' : `${hint.file}${hint.file === 'driver' ? hint.pod : ''}×${hint.factor}`;
  };
  // Run 1's POD 02 (44, ×2) with Sensor Interp at 78 (×1.5) at 7,000 km: ±325 km, wider than WIDE LZ-A (250).
  check('×2 driver and ×1.5 Sensor Interp: the driver, the larger factor', pick(shipWith(44), 7000) === 'driver1×2', pick(shipWith(44), 7000));
  check('a tie (×1.5 driver, ×1.5 Sensor Interp, 8,000 km): the driver first', pick(shipWith(60), 8000) === 'driver1×1.5', pick(shipWith(60), 8000));
  check('Sensor Interp failing (×2.5) over a degraded Nav Plotter (×1.25)', pick(shipWith(100, { sensor: 40, navplot: 60 }), 8000) === 'sensor×2.5');
  check('Nav Plotter alone (failing ×1.5, 9,000 km)', pick(shipWith(100, { sensor: 100, navplot: 40 }), 9000) === 'navplot×1.5');
  check('no single repair gives a sure window (×2 driver, ×2.5 Sensor Interp at 9,000 km): none', pick(shipWith(44, { sensor: 30 }), 9000) === 'none');
  check('no REPAIR at hand: none', pick(shipWith(44, {}, { repair: false }), 7000) === 'none');
  check('Sensor Interp already repairing is not named (L8 says it): the driver', pick(shipWith(44, { sensor: 40 }, { sensorState: 'repairing' }), 6500) === 'driver1×2');
  check('a healthy drop needs no repair', pick(shipWith(100, { sensor: 100 }), 7000) === 'none');
  // The ×1.5 one, as drop-cache solves it: the width without the picked factor is below the LZ's half-width.
  check('…"gives one" is the width without that factor below the half-width', dropHalfWidthKm(7000, R, { sensor: 1.5, plotter: 1, driver: 1 }) < 250
    && dropHalfWidthKm(7000, R, { sensor: 1.5, plotter: 1, driver: 2 }) > 250);

  const hint = { file: 'driver', pod: 2, factor: 2 } as const;
  const fit = { targetRadiusKm: 7000, floorKm: 5100, sureTacAtTarget: 4 };
  check('L9\'s verdict: a REPAIR and GO LOWER (the fit carried)', JSON.stringify(tooWideVerdict('LZ-B', 1, hint, fit, false))
    === JSON.stringify({ lz: 'LZ-B', repair: hint, goLower: fit, launchRad: 1 }));
  check('…GO LOWER alone', JSON.stringify(tooWideVerdict('LZ-B', 1, null, fit, false)) === JSON.stringify({ lz: 'LZ-B', repair: null, goLower: fit, launchRad: 1 }));
  check('…decay warned: never GO LOWER (L10\'s lift goes up), the REPAIR alone', tooWideVerdict('LZ-B', 1, hint, fit, true)?.goLower === null
    && tooWideVerdict('LZ-B', 1, null, fit, true) === null);
  check('…neither: null, never { repair: null, goLower: null }', tooWideVerdict('LZ-B', 1, null, null, false) === null);
}

// --- Every DROP line fits the strip, with worst-case values -----------------------------------------------------------
{
  const words = SHIPS.flatMap((ship) => ship.landing.noGo.map((arc) => arc.word));
  const longestWord = words.reduce((a, b) => (b.length > a.length ? b : a), 'LAVA');
  const lz = 'LZ-D';
  const lines = [
    LANDING_DROP_LINES.L8, LANDING_DROP_LINES.L8Mind, LANDING_DROP_LINES.L8busy('repairing'), LANDING_DROP_LINES.L8busy('moving'),
    LANDING_DROP_LINES.L8missing + LANDING_DROP_LINES.L9skip, LANDING_DROP_LINES.L5noGo(longestWord), LANDING_DROP_LINES.L12bay,
    ...['SENSOR INTERP', 'NAV PLOTTER', 'POD 16', null].flatMap((file) => [true, false].flatMap((lower) => [true, false].map((tab) =>
      (file === null && !lower ? '' : LANDING_DROP_LINES.L9(lz, file, lower || file === null, tab)) + LANDING_DROP_LINES.L9skip))),
    `DROP TOO WIDE FOR ${lz} — [TAB], fly lower${LANDING_DROP_LINES.L9skip}`,
    LAUNCH_REFUSAL_TEXT['BAY OFFLINE'], LAUNCH_CONFIRM_TEXT.noGo(longestWord, 0), ...Object.values(LANDING_END_TEXT).filter((t): t is string => t !== null),
    ...Object.values(LANDING_LESSONS_1B), ...BANDS.map((band) => BAND_COPY.bay[band]), DELETE_EFFECT.bay,
  ];
  const long = lines.filter((text) => text.length > MAX_LINE_CHARS);
  check(`every DROP line is at most ${MAX_LINE_CHARS} chars (the arcs' longest word ${longestWord}, LZ-D, POD 16, [TAB] and the SKIP tail)`,
    long.length === 0, long.join(' | '));
  check('the lessons carry no layer glyph (the strip draws ◆ from the rule\'s layer)', Object.values(LANDING_LESSONS_1B).every((text) => !/^[◆◇]/.test(text)));
  check('the worst L9 is exactly at the limit with its SKIP tail', (LANDING_DROP_LINES.L9(lz, 'SENSOR INTERP', true, true) + LANDING_DROP_LINES.L9skip).length === MAX_LINE_CHARS);
}

// --- ARES-VII run 1: POD 02 is too wide for LZ-A (the lesson, then L9 names the REPAIR) -------------------------------
const h = createHarness5(1, { soulsFound: true });
const state = (): GameState => h.store.getState();
function freshLanding(seedNo: number, extra: (draft: GameState) => void = () => {}): void {
  h.resetTo('flight', seedNo);
  h.noFault();
  h.store.update((draft) => {
    draft.hollow.phase = 'dormant';
    draft.director.done.push(...DRIVER_RULES.map((rule) => rule.id));
    // A Repair in the first free gap that holds it (run 1 arrives with SCAN only): L9 names a REPAIR only when one can run.
    const at = draft.memory.findIndex((seg) => seg.type === 'free' && seg.size >= 4);
    const gap = draft.memory[at]!;
    const repair = { id: 'repair', name: 'Repair', type: 'fs-tool', size: 4, integrity: 100, scanned: true, fsTool: 'repair', version: 1 } as Segment;
    draft.memory.splice(at, 1, repair, ...(gap.size > 4 ? [{ ...gap, id: `${gap.id}-rest`, size: gap.size - 4 }] : []));
    extra(draft);
  });
  lockOn(h, { r: 7000 });
}
{
  freshLanding(1);
  h.store.update((draft) => { draft.landing.loadNext = 2; });
  h.step();
  const sol = getDropSolution()!;
  const caps = deriveCapabilities(state(), 0);
  const wide = dropTooWide(state(), sol, caps);
  check('ARES-VII at 7,000 km, POD 02 next (×3, ±325 km): DROP TOO WIDE FOR LZ-A, REPAIR POD 02', wide?.lz === 'LZ-A'
    && wide.repair?.file === 'driver' && wide.repair.pod === 2 && sol.dot !== null && near(sol.dot.halfWidthKm, 325, 2),
    `${JSON.stringify(wide)} ±${sol.dot?.halfWidthKm.toFixed(0)} km`);
  h.stepFor(0.5);
  const first = h.shown();
  h.stepFor(DOT_WIDE_LESSON_SEC + 0.5);
  const then = h.shown();
  check('the strip: the lesson THE DOT IS WIDE first, once…', first?.id === 'lesson-dot-wide' && first.text === LANDING_LESSONS_1B.dotWide,
    `${first?.id} '${first?.text}'`);
  // Track ORBIT: goLowerFit is real, so 7,000 → the floor fits POD 02's ×3 dot too: L9 adds `or fly lower`, and GO LOWER is
  // offered on exactly that LZ (landing.ts builds its aim only when dropTooWide says goLower).
  check('…then L9 itself, with the TAB and the SKIP', then?.id === 'landing-L9'
    && then.text === 'DROP TOO WIDE FOR LZ-A — TAB, REPAIR POD 02, or fly lower · [F]', `${then?.id} '${then?.text}'`);
  check('…and GO LOWER is offered for LZ-A exactly while L9 says or fly lower',
    (dropTooWide(state(), getDropSolution()!, deriveCapabilities(state(), 0))?.goLower ?? null) !== null && state().landing.goLow?.lz === 'LZ-A',
    JSON.stringify(state().landing.goLow));
  // Repaired, the drop is ×1.5 (±162 km): it fits LZ-A, and L9 goes.
  h.store.update((draft) => {
    const pod2 = draft.memory.find((seg) => seg.type === 'driver' && seg.pod === 2);
    if (pod2 && pod2.type === 'driver') pod2.integrity = 100;
  });
  h.stepFor(0.5);
  check('…POD 02 repaired: the dot fits, no L9 (and the lesson never comes back)', dropTooWide(state(), getDropSolution()!, deriveCapabilities(state(), 0)) === null
    && h.shown()?.id !== 'landing-L9' && h.shown()?.id !== 'lesson-dot-wide', `${h.shown()?.id}`);
  // Without the LOAD NEXT pin POD 01 goes first (×1.5): no L9 at all.
  freshLanding(1);
  h.step();
  check('POD 01 next (×1.5, ±162 km): LZ-A has a sure window, no L9', dropTooWide(state(), getDropSolution()!, deriveCapabilities(state(), 0)) === null);
}

// --- Bay Ctrl gone in the landing: NO BAY CTRL, [L] refused, the auto-end --------------------------------------------------
{
  freshLanding(2, (draft) => {
    draft.memory = draft.memory.map((seg) => (seg.role === 'bay' ? { id: `free-${seg.id}`, name: 'Free', type: 'free', size: seg.size } : seg));
  });
  h.stepFor(0.5);
  const refused = requestLaunch(h.store, { source: 'player' });
  check('Bay Ctrl gone: [L] is refused BAY OFFLINE', refused.kind === 'refused' && refused.reason === 'BAY OFFLINE', JSON.stringify(refused));
  check('…the strip says NO BAY CTRL — END LANDING parks them in orbit', h.shown()?.id === 'landing-L12-bay'
    && h.shown()?.text === LANDING_DROP_LINES.L12bay, `${h.shown()?.id} '${h.shown()?.text}'`);
  const aboard = state().landing.pods.length;
  h.stepUntil(() => state().landing.ended !== null, LANDING_NONE_LEFT_SEC + 5);
  check(`…and the landing ends by itself ('bay-offline') after ${LANDING_NONE_LEFT_SEC} s, every pod parked in orbit (no time)`,
    state().landing.ended === 'bay-offline' && state().landing.pods.every((record) => record.fate.kind === 'parked' && record.fate.why === 'no-time')
    && aboard > 0, `${state().landing.ended} · ${state().landing.pods.map((record) => record.fate.kind).join(',')}`);
  h.stepUntil(() => state().run.phase === 'report', 10);
  check('…then the LANDING REPORT, with the bay\'s ending in words', state().run.phase === 'report' && LANDING_END_TEXT['bay-offline'] !== null);
}

finish();
