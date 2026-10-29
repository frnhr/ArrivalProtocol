// Slice 1a, F1: the landing's pure rules (src/systems/landing-rules.ts) and its data validators. The states are built by
// hand with only the fields the rules read (no store, no mounts), so the suite runs in well under a second.
import { check, finish } from './checks';
import {
  isLaunchable, driverTouch, launchQueue, nextToLaunch, bayShown, bayMembers, classifyLanding, lzDownFill, lzProjectedFill,
  lzRemaining, podPoints, launchRefusal, launchGuard, landingResult, onTargetTally, colonyName, canEverLaunch, missKm,
} from '@systems/landing-rules';
import type { GameState, ShipOutcome } from '@state/schema';
import type { DriverSegment, Segment } from '@/types/segment';
import type {
  DropSolution, ForgivenessClass, LandingState, LaunchRecord, LzState, LzWidth, Place, PodFate, PodRecord, Touch,
} from '@/types/landing';
import { createRng } from '@systems/rng';
import { SHIPS, validateLandingDef } from '@data/ships';
import { shipColonists, shipPodCount, validatePodRacks } from '@data/memory';
import { LAUNCH_CONFIRM_TEXT, LANDING_REPORT_TEXT, COLONY_NAME_POOL } from '@data/landing-text';
import { LZ_WIDTH_KM, COLONISTS_PER_POD, PODS_MAX, BAY_SLOTS } from '@data/tuning';

const R = 3390;
const DEG = Math.PI / 180;

function lz(label: string, centreDeg: number, pods: number, width: LzWidth = 'standard'): LzState {
  const widthKm = LZ_WIDTH_KM[width];
  return { label, centreRad: centreDeg * DEG, halfWidthRad: widthKm / 2 / R, widthKm, pods, ground: 'flat' };
}

function driver(pod: number, integrity = 100, extra: Partial<DriverSegment> = {}): DriverSegment {
  return {
    id: `driver_pod${pod}`, name: `POD ${pod}`, type: 'driver', size: 8, integrity, pod, family: `Fam${pod}`,
    colonists: COLONISTS_PER_POD, featured: [], ...extra,
  };
}

function pod(n: number, fate: PodFate = { kind: 'aboard' }, driverLost: PodRecord['driverLost'] = null): PodRecord {
  return { pod: n, family: `Fam${n}`, colonists: COLONISTS_PER_POD, featured: [], driverLost, restored: false, fate };
}

function launch(rad: number, touch: Touch = 'soft'): LaunchRecord {
  return {
    atTSec: 0, atAi: 0, source: 'player', launchRadius: 6000, dotRad: rad, halfWidthKm: 78, aimLz: null, landingRad: rad, touch,
    driverIntegrity: touch === 'soft' ? 100 : 40, arc: [], descentSec: 3.5,
  };
}

interface FakeOpts {
  lzs: LzState[];
  pods: PodRecord[];
  memory: Segment[];
  forgiveness?: ForgivenessClass;
  loadNext?: number | null;
  loaded?: number;
  cadenceLeftTac?: number;
  phase?: GameState['run']['phase'];
  ended?: LandingState['ended'];
  paused?: boolean;
  mode?: GameState['ui']['mode'];
  dv?: number;
}

// Only the slices the rules read; the cast is the point (a pure rule must not reach for anything else).
function fakeState(opts: FakeOpts): GameState {
  const landing: LandingState = {
    lzs: opts.lzs, noGo: [], forgiveness: opts.forgiveness ?? 'gentle', terrain: 'PLAINS', drag: false, finalShip: false, lead: 1,
    hurt: [], colonyFirstRun: null, colony: null, pods: opts.pods,
    bay: { loaded: opts.loaded ?? BAY_SLOTS, reloadTac: 0, cadenceLeftTac: opts.cadenceLeftTac ?? 0 },
    loadNext: opts.loadNext ?? null, startedAtTSec: 0, ended: opts.ended ?? null, lingerAiSec: null, noDriverAiSec: 0,
    fuelAtEndPct: null, orbitEpoch: 0,
  };
  return {
    run: { phase: opts.phase ?? 'landing' },
    clock: { paused: opts.paused ?? false, tSec: 0 },
    ui: { mode: opts.mode ?? 'tools' },
    burn: { lastTickDvKmS: opts.dv ?? 0 },
    memory: opts.memory,
    level: { planet: { R } },
    landing,
  } as unknown as GameState;
}

function solution(dotDeg: number, inBand = true, block: DropSolution['block'] = null): DropSolution {
  return {
    asOfTSec: 0, periodSec: 14000, block,
    dot: block ? null : { rad: dotDeg * DEG, halfWidthKm: 78, launchRadius: 6000, inBand },
    arc: [], windows: [],
  };
}

// --- Bands: launchable and touch (§3.8's table) ---
{
  const rows: [number, boolean, Touch][] = [[100, true, 'soft'], [80, true, 'soft'], [79, true, 'soft'], [50, true, 'soft'],
    [49, true, 'hard'], [25, true, 'hard'], [24, false, 'hard'], [0, false, 'hard']];
  const bad = rows.filter(([integrity, launchable, touch]) => isLaunchable(driver(1, integrity)) !== launchable
    || (launchable && driverTouch(integrity) !== touch));
  check('ok and degraded launch soft, failing launches hard, dead can\'t launch', bad.length === 0, bad.map((row) => row[0]).join(', '));
  const blocked = [
    driver(1, 100, { infected: { side: 'left' } }), driver(1, 100, { operating: true }), driver(1, 100, { state: 'transferring' }),
    driver(1, 100, { state: 'repairing' }), driver(1, 100, { state: 'offline' }),
  ];
  check('infected, worked-on, moving, repairing and offline drivers can\'t launch', blocked.every((d) => !isLaunchable(d)));
}

// --- The queue, LOAD NEXT and the bay ---
{
  const memory = [driver(1), driver(2, 10), driver(3), driver(4, 100, { infected: { side: 'right' } }), driver(5)];
  const pods = [1, 2, 3, 4, 5].map((n) => pod(n));
  const lzs = [lz('LZ-A', 90, 5)];
  const plain = fakeState({ lzs, pods, memory });
  check('the queue is the launchable drivers in address order', launchQueue(plain).map((d) => d.pod).join(',') === '1,3,5');
  const pinned = fakeState({ lzs, pods, memory, loadNext: 5 });
  check('LOAD NEXT goes first', launchQueue(pinned).map((d) => d.pod).join(',') === '5,1,3' && nextToLaunch(pinned)?.pod === 5);
  const pinnedDead = fakeState({ lzs, pods, memory, loadNext: 2 });
  check('a LOAD NEXT pod that can\'t launch is skipped (and stays pinned)', nextToLaunch(pinnedDead)?.pod === 1);
  check('the bay shows min(loaded, launchable)', bayShown(fakeState({ lzs, pods, memory, loaded: 4 })) === 3
    && bayShown(fakeState({ lzs, pods, memory, loaded: 2 })) === 2);
  const members = bayMembers(fakeState({ lzs, pods, memory, loaded: 2, loadNext: 3 }));
  check('BAY tags the next loaded drivers, NEXT the first', members.bay.join(',') === '3,1' && members.next === 3);
  check('a pod can ever launch while its driver is in memory (a dead one can be repaired)', canEverLaunch(plain, 2) && !canEverLaunch(fakeState({ lzs, pods, memory: [driver(1)] }), 2));
}

// --- Classification, fill in touchdown order, the 400 + 800 case ---
{
  const lzs = [lz('LZ-A', 60, 3), lz('LZ-B', 180, 3)];
  const empty = { 'LZ-A': 0, 'LZ-B': 0 };
  check('a point in a bracket with room is LZ', classifyLanding(lzs, [], 61 * DEG, empty).place === 'lz');
  check('a point in a full bracket is MISLANDED', classifyLanding(lzs, [], 179 * DEG, { 'LZ-A': 0, 'LZ-B': 3 }).place === 'mislanded');
  check('a point outside every bracket is OFF-SITE', classifyLanding(lzs, [], 120 * DEG, empty).place === 'off-site');
  check('a no-go arc wins over everything', classifyLanding(lzs, [{ centreRad: 60 * DEG, halfWidthRad: 3 * DEG, word: 'LAVA' }], 60 * DEG, empty).place === 'no-go');
  const miss = missKm(lzs, (180 + 6.76 / 2 + 1) * DEG, R);
  check('missKm measures from the nearest bracket edge', miss !== null && Math.abs(miss - R * DEG) < 1, `${miss?.toFixed(1)} km`);

  // Fran's case: LZ-A and LZ-B count 600 each; 400 land in A, 800 in B (in touchdown order the 4th in B is mislanded).
  const order: [number, number][] = [[1, 60], [2, 180], [3, 180], [4, 60], [5, 180], [6, 181]];
  const pods: PodRecord[] = [];
  for (const [n, deg] of order) {
    const state = fakeState({ lzs, pods, memory: [] });
    const placement = classifyLanding(lzs, [], deg * DEG, lzDownFill(state));
    const points = podPoints(placement.place, 'soft', 'gentle', COLONISTS_PER_POD);
    pods.push(pod(n, { kind: 'down', launch: launch(deg * DEG), touchdown: { place: placement.place, lz: placement.lz, points, missKm: null, atAi: n } }));
  }
  const state = fakeState({ lzs, pods, memory: [] });
  const result = landingResult(state, 'locked');
  const rowA = result.lzs.find((row) => row.lz === 'LZ-A')!;
  const rowB = result.lzs.find((row) => row.lz === 'LZ-B')!;
  check('400 + 800 scores 1,150 (each colonist counted once)', result.points === 1150, `${result.points}`);
  check('400 + 800: LZ-A 400 landed, LZ-B 600 landed and 200 mislanded', rowA.landed === 400 && rowB.landed === 600 && rowB.mislanded === 200);
  check('400 + 800: the report says LZ-A 200 SHORT', LANDING_REPORT_TEXT.short(rowA.lz, rowA.count - rowA.landed - rowA.mislanded) === 'LZ-A 200 SHORT');
  check('the headline counts colonists in an LZ with room', result.landedOnTarget === 1000 && result.colonistsAboard === 1200);

  // Projected fill: pods falling into an LZ count for the guard before they are down (risk 12).
  const falling = fakeState({ lzs, memory: [], pods: [pod(1, { kind: 'falling', launch: launch(60 * DEG) }), pod(2, { kind: 'falling', launch: launch(100 * DEG) })] });
  check('projected fill adds falling pods by where they will land; down fill does not', lzProjectedFill(falling)['LZ-A'] === 1
    && lzDownFill(falling)['LZ-A'] === 0 && lzRemaining(falling)['LZ-A'] === 2);
}

// --- Every points combination (§3.9) ---
{
  const expect: [Place, Touch, ForgivenessClass, number][] = [
    ['lz', 'soft', 'gentle', 200], ['lz', 'hard', 'harsh', 100], ['mislanded', 'soft', 'rough', 150], ['mislanded', 'hard', 'gentle', 75],
    ['off-site', 'soft', 'gentle', 100], ['off-site', 'hard', 'gentle', 50], ['off-site', 'soft', 'rough', 50], ['off-site', 'hard', 'rough', 25],
    ['off-site', 'soft', 'harsh', 0], ['off-site', 'hard', 'harsh', 0], ['no-go', 'soft', 'gentle', 0], ['no-go', 'hard', 'rough', 0],
  ];
  const wrong = expect.filter(([place, touch, cls, points]) => podPoints(place, touch, cls, COLONISTS_PER_POD) !== points);
  check('points = 200 × place × touch for every place, touch and class', wrong.length === 0, wrong.map((row) => row.join(' ')).join(' | '));
}

// --- Refusals, in order ---
{
  const lzs = [lz('LZ-A', 90, 3)];
  const base: FakeOpts = { lzs, pods: [pod(1)], memory: [driver(1)] };
  const cases: [string, FakeOpts, DropSolution | null, string | null][] = [
    ['NOT LANDING', { ...base, phase: 'flight', ended: 'end-landing', paused: true }, null, 'NOT LANDING'],
    ['LANDING OVER', { ...base, ended: 'end-landing', paused: true }, null, 'LANDING OVER'],
    ['PAUSED', { ...base, paused: true, mode: 'memory' }, null, 'PAUSED'],
    ['SHIP SCREEN', { ...base, mode: 'memory', dv: 0.01 }, null, 'SHIP SCREEN'],
    ['ENGINE FIRING', { ...base, dv: 0.01 }, null, 'ENGINE FIRING'],
    ['NO DROP SOLUTION', base, solution(0, true, 'no-solution'), 'NO DROP SOLUTION'],
    ['OUT OF THE LAUNCH BAND', { ...base, memory: [] }, solution(90, false), 'OUT OF THE LAUNCH BAND'],
    ['NO POD READY', { ...base, memory: [driver(1, 10)], cadenceLeftTac: 1 }, solution(90), 'NO POD READY'],
    ['RELOADING', { ...base, cadenceLeftTac: 1, loaded: 0 }, solution(90), 'RELOADING'],
    ['BAY EMPTY', { ...base, loaded: 0 }, solution(90), 'BAY EMPTY'],
    ['clear', base, solution(90), null],
  ];
  const wrong = cases.filter(([, opts, sol, want]) => launchRefusal(fakeState(opts), sol, 'player') !== want);
  check('refusals come in the LaunchRefusal union\'s order', wrong.length === 0, wrong.map(([name, opts, sol]) => `${name} → ${launchRefusal(fakeState(opts), sol, 'player')}`).join(' | '));
  check('SHIP SCREEN is the kid\'s [L] only: a controller may launch from MIND', launchRefusal(fakeState({ ...base, mode: 'memory' }), solution(90), 'autodrop') === null);
}

// --- Guards: the inline confirms ---
{
  const lzs = [lz('LZ-A', 90, 1)];
  const offSite = launchGuard(fakeState({ lzs, pods: [pod(1)], memory: [driver(1)] }), solution(120));
  check('[L] off-site on a GENTLE world asks `LAUNCH OFF-SITE? PLAINS · scores 100`', offSite?.ask === 'off-site'
    && LAUNCH_CONFIRM_TEXT.offSite('PLAINS', offSite.points) === 'LAUNCH OFF-SITE? PLAINS · scores 100');
  const fullState = fakeState({ lzs, memory: [driver(2)], pods: [pod(1, { kind: 'falling', launch: launch(90 * DEG) }), pod(2)] });
  const full = launchGuard(fullState, solution(90));
  check('[L] at a full LZ asks `LZ-A IS FULL — LAUNCH ANYWAY? scores 150`', full?.ask === 'full' && full.lz === 'LZ-A'
    && LAUNCH_CONFIRM_TEXT.full('LZ-A', full.points) === 'LZ-A IS FULL — LAUNCH ANYWAY? scores 150');
  const hardOff = launchGuard(fakeState({ lzs, pods: [pod(1)], memory: [driver(1, 40)], forgiveness: 'rough' }), solution(120));
  check('a hard driver off-site on a ROUGH world scores 25', hardOff?.points === 25);
  check('no guard with the dot in a bracket with room', launchGuard(fakeState({ lzs, pods: [pod(1)], memory: [driver(1)] }), solution(90)) === null);
}

// --- The result: parked versus not launched, ON TARGET ---
{
  const lzs = [lz('LZ-A', 90, 4)];
  const pods = [
    pod(1, { kind: 'down', launch: launch(90 * DEG), touchdown: { place: 'lz', lz: 'LZ-A', points: 200, missKm: null, atAi: 1 } }),
    pod(2, { kind: 'aboard' }, 'eaten'),
    pod(3, { kind: 'aboard' }, 'dead'),
    pod(4, { kind: 'aboard' }),
  ];
  const state = fakeState({ lzs, pods, memory: [driver(4)] });
  const inOrbit = (['locked', 'partial', 'stranded', 'emergency'] as ShipOutcome[]).every((outcome) => {
    const result = landingResult(state, outcome);
    return result.parked.map((p) => `${p.pod}:${p.why}`).join(',') === '2:eaten,3:dead,4:no-time' && result.notLaunched === 0;
  });
  check('a landing that ends in orbit parks every pod still aboard, with why', inOrbit);
  const leftOrbit = (['crashed', 'escaped', 'abandoned'] as ShipOutcome[]).every((outcome) => {
    const result = landingResult(state, outcome);
    return result.parked.length === 0 && result.notLaunched === 3 * COLONISTS_PER_POD;
  });
  check('a ship that left orbit took its pods with it: NOT LAUNCHED', leftOrbit);
  const summary = landingResult(state, 'locked').pods;
  check('the pods\' detail keeps fate, place and why', summary[0]?.place === 'lz' && summary[1]?.fate === 'parked' && summary[1]?.parkedWhy === 'eaten');

  const tally = onTargetTally(state);
  check('ON TARGET counts unlaunched pods in the denominator', tally.onTargetPods === 1 && tally.pods === 4 && !tally.earned);
  check('ON TARGET is still possible only while every undecided pod could land soft', !tally.possible);
  const allDown = fakeState({ lzs, memory: [], pods: [1, 2, 3, 4].map((n) => pod(n, { kind: 'down', launch: launch(90 * DEG), touchdown: { place: 'lz', lz: 'LZ-A', points: 200, missKm: null, atAi: n } })) });
  check('four soft pods in an LZ with room earn ON TARGET', onTargetTally(allDown).earned);
  // A ship that ends mid-fall counts its falling pods where they come down, in touchdown order.
  const midFall = fakeState({ lzs: [lz('LZ-A', 90, 1)], memory: [], pods: [
    pod(1, { kind: 'falling', launch: { ...launch(90 * DEG), atAi: 2 } }),
    pod(2, { kind: 'falling', launch: { ...launch(91 * DEG), atAi: 1 } }),
    pod(3, { kind: 'falling', launch: launch(0) }),
  ] });
  const settled = landingResult(midFall, 'emergency');
  check('falling pods count where they land, in touchdown order', settled.points === 200 + 150 + 100
    && settled.pods[1]?.place === 'lz' && settled.pods[0]?.place === 'mislanded' && settled.pods[2]?.place === 'off-site');
}

// --- The colony's name ---
{
  const def = { colonyFirstRun: 'RIVERSIDE' };
  check('run 1 keeps the written colony name', colonyName(def, 'Okafor', createRng(1), true) === 'RIVERSIDE');
  const names = new Set<string>();
  let deterministic = true;
  for (let seed = 0; seed < 40; seed++) {
    const name = colonyName(def, 'Okafor', createRng(seed), false);
    if (name !== colonyName(def, 'Okafor', createRng(seed), false)) deterministic = false;
    names.add(name);
  }
  check('later runs roll the name deterministically from the seed', deterministic);
  check('…as `OKAFOR LANDING` or a pool name', [...names].every((name) => name === 'OKAFOR LANDING' || COLONY_NAME_POOL.includes(name))
    && names.has('OKAFOR LANDING') && names.size > 2, [...names].join(', '));
  check('a ship with no written name rolls one even on run 1', colonyName({ colonyFirstRun: null }, 'Reyes', createRng(3), true) !== '');
}

// --- The ships' landing data and its validators ---
{
  const pods = SHIPS.map((ship) => shipPodCount(ship));
  check('the five ships carry 3 / 5 / 12 / 12 / 16 pods', pods.join(',') === '3,5,12,12,16');
  check('the fleet carries 9,600 colonists', SHIPS.reduce((sum, ship) => sum + shipColonists(ship), 0) === 9600);
  check('every ship has at most PODS_MAX pods', pods.every((n) => n <= PODS_MAX));
  const bad = (fn: () => void): boolean => { try { fn(); return false; } catch { return true; } };
  const ares = SHIPS[0]!;
  check('validateLandingDef throws when the counts miss the pods', bad(() => validateLandingDef('t', ares.landing, 4, R)));
  check('validateLandingDef throws on brackets under 12° apart edge to edge', bad(() => validateLandingDef('t', {
    ...ares.landing, lzs: [{ label: 'LZ-A', centreDeg: 10, width: 'wide', pods: 1 }, { label: 'LZ-B', centreDeg: 25, width: 'wide', pods: 2 }],
  }, 3, R)));
  check('…including across 0°', bad(() => validateLandingDef('t', {
    ...ares.landing, lzs: [{ label: 'LZ-A', centreDeg: 5, width: 'wide', pods: 1 }, { label: 'LZ-B', centreDeg: 350, width: 'wide', pods: 2 }],
  }, 3, R)));
  check('validateLandingDef throws on duplicate labels and on more than 16 pods', bad(() => validateLandingDef('t', {
    ...ares.landing, lzs: [{ label: 'LZ-A', centreDeg: 10, width: 'wide', pods: 1 }, { label: 'LZ-A', centreDeg: 120, width: 'wide', pods: 2 }],
  }, 3, R)) && bad(() => validateLandingDef('t', { ...ares.landing, lzs: [{ label: 'LZ-A', centreDeg: 10, width: 'wide', pods: 17 }] }, 17, R)));
  check('validatePodRacks throws on pod racks with under 40 free blocks', bad(() => validatePodRacks({
    ...ares, memory: { ...ares.memory, podRacks: { B: 'R P P P P P P P', C: 'P P P P P P P P', D: 'P P P P P _24' } },
    landing: { ...ares.landing, lzs: [{ label: 'LZ-A', centreDeg: 160, width: 'wide', pods: 20 }] },
  })));
  check('validatePodRacks throws when the drivers miss the LZ counts', bad(() => validatePodRacks({
    ...ares, landing: { ...ares.landing, lzs: [{ label: 'LZ-A', centreDeg: 160, width: 'wide', pods: 4 }] },
  })));
  check('validatePodRacks throws on a last pod rack with under 24 trailing free', bad(() => validatePodRacks({
    ...ares, memory: { ...ares.memory, podRacks: { B: 'R _32 P P P', C: '_64', D: '_48 P P' } },
    landing: { ...ares.landing, lzs: [{ label: 'LZ-A', centreDeg: 160, width: 'wide', pods: 5 }] },
  })));
}

finish();
