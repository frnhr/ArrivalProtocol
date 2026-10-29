// Slice 1a, Track UI: the landing's screen models (src/systems/landing-hud.ts, the landing parts of flight-hud.ts and
// hollow-hud.ts). Pure: a world from the foundation's constructors (createInitialState, beginLanding), the ship put on a
// circular orbit by hand, the drop solved by landing-solve directly (no store, no mounts, nothing flown).
import { check, finish } from './checks';
import type { GameState } from '@state/schema';
import type { DropSolution, LaunchRecord, PodFate } from '@/types/landing';
import type { Prediction } from '@systems/predict';
import { createInitialState } from '@state/initial';
import { beginLanding } from '@state/actions';
import { freshUnitRacks } from '@systems/carry';
import { getShip } from '@data/ships';
import { computeDropSolution, angleDelta } from '@systems/landing-solve';
import { windowOpenNow, lzAt } from '@systems/landing-rules';
import {
  lzCounters, bracketModels, dropDotModel, windowToneFraction, groundTrackModel, bayWindowModel, podTags, footerPods,
  miniHudLanding, podStreaks, landMarks, parkedBeacons, plotLandingModel, ringLabel, driverLanding, terrainGlyph,
} from '@systems/landing-hud';
import { countdownChip, headerCrumbs, toggleAlert } from '@systems/flight-hud';
import { miniStripRows } from '@systems/hollow-hud';
import { isDriver } from '@state/selectors';
import { BAND_TEXT } from '@data/landing-text';
import { BAY_SLOTS, GROUND_TRACK_SPAN_KM } from '@data/tuning';

const DEG = Math.PI / 180;
const NO_PRED = {} as Prediction;   // the landing's chip and alert read the drop solution, not the flight's prediction

function world(shipIndex = 0): GameState {
  const state = createInitialState({ seed: 7, shipIndex, carried: shipIndex === 0 ? null : freshUnitRacks(getShip(shipIndex)) });
  state.run.phase = 'landing';
  state.ui.mode = 'tools';
  state.burn.status = 'locked';
  beginLanding(state);
  return state;
}

function circle(state: GameState, angleRad: number, r: number, retro = false): void {
  const v = Math.sqrt(state.level.planet.mu / r) * (retro ? -1 : 1);
  state.orbit = { x: r * Math.cos(angleRad), y: r * Math.sin(angleRad), vx: -v * Math.sin(angleRad), vy: v * Math.cos(angleRad) };
}

function solve(state: GameState): DropSolution {
  return computeDropSolution({
    state: state.orbit, tSec: state.clock.tSec, mu: state.level.planet.mu, R: state.level.planet.R, ring: state.level.ring,
    lzs: state.landing.lzs, factors: { sensor: 1, plotter: 1, driver: 1 }, solution: true,
  });
}

// The ship on a circle of radius r, placed so the dot's centre sits at `dotRad`; the window state written as landing.ts
// writes it each AI tick.
function aim(state: GameState, dotRad: number, r = 6000, retro = false): DropSolution {
  circle(state, 0, r, retro);
  const lead = angleDelta(0, solve(state).dot!.rad);
  circle(state, dotRad - lead, r, retro);
  const sol = solve(state);
  state.landing.window = windowOpenNow(sol, state.clock.tSec);
  return sol;
}

function launchAt(state: GameState, sol: DropSolution, landingRad: number, atAi: number, descentSec = 3.5): LaunchRecord {
  return {
    atTSec: state.clock.tSec, atAi, source: 'player', launchRadius: sol.dot!.launchRadius, dotRad: sol.dot!.rad,
    halfWidthKm: sol.dot!.halfWidthKm, aimLz: lzAt(state.landing.lzs, sol.dot!.rad)?.label ?? null, landingRad,
    predictedTouch: 'soft', driverIntegrity: 100, arc: sol.arc.map((p) => ({ ...p })), descentSec, firstOfRun: false,
  };
}

function setFate(state: GameState, pod: number, fate: PodFate): void {
  const record = state.landing.pods.find((candidate) => candidate.pod === pod);
  if (!record) throw new Error(`no pod ${pod}`);
  record.fate = fate;
  if (fate.kind !== 'aboard') state.memory = state.memory.filter((seg) => !(isDriver(seg) && seg.pod === pod));
}

function down(state: GameState, sol: DropSolution, pod: number, place: 'lz' | 'mislanded' | 'off-site', lz: string | null, touch: 'soft' | 'hard' = 'soft'): void {
  const centre = lz === null ? sol.dot!.rad : state.landing.lzs.find((candidate) => candidate.label === lz)!.centreRad;
  const launch = launchAt(state, sol, centre, 0);
  setFate(state, pod, { kind: 'down', launch, touchdown: { place, lz, points: 200, missKm: null, touch, atAi: 3.5 } });
}

// --- ARES-VII, LZ-A at 160° (WIDE), the dot dead centre ---

{
  const state = world();
  const lzA = state.landing.lzs[0]!;
  const sol = aim(state, lzA.centreRad);
  check('window: the dot in LZ-A at 6,000 km is a sure window', state.landing.window?.lz === 'LZ-A' && state.landing.window.sure,
    JSON.stringify(state.landing.window));
  check('counters: LZ-A 0/3', lzCounters(state).map((c) => c.text).join() === 'LZ-A 0/3');
  const brackets = bracketModels(state, sol);
  check('brackets: LZ-A sure (green) while the whole dot fits', brackets[0]?.look === 'sure' && brackets[0].label === 'LZ-A 0/3');
  const dot = dropDotModel(state, sol)!;
  check('dot: ±78 km at 6,000 km, whole in LZ-A, centred', Math.round(dot.halfWidthKm) === 78 && dot.fits === 'whole'
    && dot.lz === 'LZ-A' && dot.centredness! > 0.98, `±${dot.halfWidthKm.toFixed(1)} ${dot.fits} ${dot.centredness?.toFixed(3)}`);
  check('window tone: about 1 at the centre', (windowToneFraction(state, sol) ?? 0) > 0.98);

  const track = groundTrackModel(state, sol);
  const bracket = track.strip.brackets.find((b) => b.lz === 'LZ-A');
  check('ground track: header KEPLER-186F', track.header === 'KEPLER-186F', track.header);
  check('ground track: LZ-A straddles the fixed central dot', bracket !== undefined && bracket.from < 0.5 && bracket.to > 0.5
    && Math.abs((bracket.from + bracket.to) / 2 - 0.5) < 0.01, JSON.stringify(bracket));
  check('ground track: the bracket is 500 km of the 3,000 km strip', bracket !== undefined
    && Math.abs((bracket.to - bracket.from) * GROUND_TRACK_SPAN_KM - 500) < 1);
  check('ground track: `[ LZ-A · 0/3 ]`, sure', bracket?.label === '[ LZ-A · 0/3 ]' && bracket.look === 'sure');
  check('ground track: the dot reads DROP ±78 km', track.strip.dot?.text === 'DROP ±78 km' && track.strip.dot.fits === 'whole');
  check('ground track: plains glyph', track.strip.terrain[0]?.glyph === terrainGlyph('PLAINS') && terrainGlyph('OCEAN') === '≈');
  check('ground track: the planet line holds the strip around the dot', track.planet.dot !== null
    && track.planet.view.from < track.planet.dot && track.planet.view.to > track.planet.dot);
  state.landing.colony = 'RIVERSIDE';
  check('ground track: header names the colony once it has one', groundTrackModel(state, sol).header === 'KEPLER-186F · RIVERSIDE');

  const bay = bayWindowModel(state, sol);
  check('bay: [ L · LAUNCH POD ] goes', bay.launch.label === '[ L · LAUNCH POD ]' && bay.launch.look === 'go', bay.launch.status);
  // Four slots loaded, three pods: the bay shows what could go (§2: `BAY ▮▮▮▯ 3/4` at ORBIT LOCK).
  check('bay: BAY ▮▮▮▯ 3/4 with three pods', bay.bay.text === 'BAY ▮▮▮▯ 3/4' && bay.bay.loaded === BAY_SLOTS, bay.bay.text);
  check('bay: NEXT POD 01 · OKAFOR · SOFT · ±78 km', bay.nextText === 'NEXT POD 01 · OKAFOR · SOFT · ±78 km', bay.nextText);
  check('bay: END LANDING asks about the 3 pods', bay.endLanding.confirm === '3 PODS WILL BE PARKED IN ORBIT · NOT COUNTED');

  const chip = countdownChip(state, NO_PRED, sol);
  check('chip: `LZ-A OPEN` counts to the close', chip?.kind === 'window' && chip.label === 'LZ-A OPEN' && /^\d\d:\d\d$/.test(chip.time),
    JSON.stringify(chip));
  state.ui.mode = 'memory';
  const alert = toggleAlert(state, NO_PRED);
  check('toggle: `◀ SHIP · LZ-A OPEN` from blue during a window', alert?.head === '◀ SHIP ·' && alert.body === 'LZ-A OPEN', JSON.stringify(alert));
  const bayHidden = bayWindowModel(state, sol);
  check('bay: from blue the button still reads what [L] does in amber', bayHidden.launch.look === 'go');
  state.ui.mode = 'tools';
  check('ring: LAUNCH BAND while landing', ringLabel(state) === BAND_TEXT.ringLanding);
  check('mini-HUD: LZ-A OPEN, BAY ▮▮▮▮', miniHudLanding(state, sol)?.window?.text === 'LZ-A OPEN' && miniHudLanding(state, sol)?.bay === 'BAY ▮▮▮▯');
}

// --- The dot ahead of LZ-A: waiting for the window ---

{
  const state = world();
  const lzA = state.landing.lzs[0]!;
  const sol = aim(state, lzA.centreRad - 60 * DEG);
  check('away: no window', state.landing.window === null);
  check('away: LZ-A is the target bracket', bracketModels(state, sol)[0]?.look === 'target');
  check('away: no window tone', windowToneFraction(state, sol) === null);
  const track = groundTrackModel(state, sol);
  check('away: LZ-A is off the strip, waiting at the right edge with its countdown',
    track.strip.brackets.length === 0 && /^LZ-A ▸ \d+:\d\d$/.test(track.strip.ahead[0]?.text ?? ''), JSON.stringify(track.strip.ahead));
  const chip = countdownChip(state, NO_PRED, sol);
  check('away: chip `LZ-A IN mm:ss`', chip?.label === 'LZ-A IN' && chip.time !== '00:00', JSON.stringify(chip));
  check('away: the bay asks first (off-site)', bayWindowModel(state, sol).launch.look === 'asks');
  check('away: mini-HUD `LZ-A IN m:ss`', /^LZ-A IN \d+:\d\d$/.test(miniHudLanding(state, sol)?.window?.text ?? ''));
  // Nearer: inside the strip, ahead of the dot (to the right).
  const near = aim(state, lzA.centreRad - 8 * DEG);
  const nearBracket = groundTrackModel(state, near).strip.brackets[0];
  check('near: LZ-A on the strip, right of the dot', nearBracket !== undefined && nearBracket.from > 0.5 && nearBracket.to < 1,
    JSON.stringify(nearBracket));
  // A retrograde orbit (h < 0) runs the other way round: ahead is still to the right.
  const retro = aim(state, lzA.centreRad + 8 * DEG, 6000, true);
  const retroBracket = groundTrackModel(state, retro).strip.brackets[0];
  check('retro: LZ-A ahead stays to the right', retroBracket !== undefined && retroBracket.from > 0.5, JSON.stringify(retroBracket));
  // Out of the band: the dot greys and [L] refuses.
  const high = aim(state, lzA.centreRad, state.level.ring.max + 2000);
  check('out of band: no window, the dot greys', state.landing.window === null && groundTrackModel(state, high).outOfBand
    && dropDotModel(state, high)?.inBand === false);
  check('out of band: the bay refuses with the words', bayWindowModel(state, high).launch.look === 'blocked'
    && bayWindowModel(state, high).launch.status === 'OUT OF THE LAUNCH BAND', bayWindowModel(state, high).launch.status);
}

// --- Reload, BAY / NEXT, LOAD NEXT, the hurt driver ---

{
  const state = world();
  const sol = aim(state, state.landing.lzs[0]!.centreRad);
  state.landing.bay = { loaded: 3, reloadTac: 8, cadenceLeftTac: 1.2 };
  const bay = bayWindowModel(state, sol);
  check('reload: BAY ▮▮▮▯ 3/4 · RELOAD 0:12', bay.bay.text === 'BAY ▮▮▮▯ 3/4 · RELOAD 0:12', bay.bay.text);
  check('cadence: the button waits, RELOADING', bay.launch.look === 'blocked' && bay.launch.status === 'RELOADING', bay.launch.status);
  const tags = podTags(state);
  check('tags: three in the BAY, POD 01 NEXT', tags.get(1) === 'NEXT' && tags.get(2) === 'BAY' && tags.get(3) === 'BAY', JSON.stringify([...tags]));
  state.landing.loadNext = 3;
  check('LOAD NEXT: POD 03 is NEXT', podTags(state).get(3) === 'NEXT' && bayWindowModel(state, sol).next?.pod === 3);
  state.landing.loadNext = null;
  const brandt = state.memory.find((seg) => isDriver(seg) && seg.pod === 2);
  if (!brandt || !isDriver(brandt)) throw new Error('no POD 02');
  check('detail: POD 02 at 44% WILL LAND HARD, in the BAY', driverLanding(state, brandt, sol).text === 'WILL LAND HARD'
    && driverLanding(state, brandt, sol).tag === 'BAY');
  const okafor = state.memory.find((seg) => isDriver(seg) && seg.pod === 1);
  if (!okafor || !isDriver(okafor)) throw new Error('no POD 01');
  check('detail: POD 01 WILL LAND SOFT · DROP ±78 km, NEXT', driverLanding(state, okafor, sol).text === 'WILL LAND SOFT · DROP ±78 km'
    && driverLanding(state, okafor, sol).tag === 'NEXT');
  brandt.integrity = 10;
  check('detail: dead, CAN\'T LAUNCH — REPAIR IT', driverLanding(state, brandt, sol).text === "CAN'T LAUNCH — REPAIR IT");
  check('footer: PODS: 3 ABOARD · 0 LANDED · 1 CAN\'T LAUNCH', footerPods(state).text === "PODS: 3 ABOARD · 0 LANDED · 1 CAN'T LAUNCH",
    footerPods(state).text);
  const rows = miniStripRows(state);
  check('mini-strip: drivers are driver / driver-hurt', rows.flat().filter((cell) => cell.kind === 'driver').length === 2
    && rows.flat().filter((cell) => cell.kind === 'driver-hurt').length === 1);
}

// --- Streaks, marks, beacons, crumbs, ALL DOWN ---

{
  const state = world();
  const sol = aim(state, state.landing.lzs[0]!.centreRad);
  const landingRad = sol.dot!.rad + 40 / state.level.planet.R;
  state.clock.aiSec = 10;
  setFate(state, 1, { kind: 'falling', launch: launchAt(state, sol, landingRad, 10 - 1.75) });
  const streak = podStreaks(state)[0];
  check('streak: halfway down its 3.5 s', streak !== undefined && Math.abs(streak.progress - 0.5) < 1e-9 && streak.trail.length >= 2);
  check('streak: the trail ends at the head', streak !== undefined && streak.trail.at(-1) === streak.head);
  state.clock.aiSec = 10 + 1.75 - 1e-6;
  const end = podStreaks(state)[0]!;
  const endRad = Math.atan2(end.head.y, end.head.x);
  check('streak: bent to end where the pod lands, white-hot below the atmosphere',
    Math.abs(angleDelta(landingRad, endRad)) < 1e-3 && end.hot, `${angleDelta(landingRad, endRad)}`);
  check('plot: the arc is drawn while pods are aboard', plotLandingModel(state, sol)?.arc?.inBand === true);
  check('crumb: ORBIT LOCKED until the first pod is down', headerCrumbs(state, NO_PRED).phase.text === 'ORBIT LOCKED');
  down(state, sol, 1, 'lz', 'LZ-A');
  check('crumb: LANDING · 1/3 DOWN', headerCrumbs(state, NO_PRED).phase.text === 'LANDING · 1/3 DOWN');
  check('marks: ◘ for the pod down', landMarks(state).length === 1 && landMarks(state)[0]!.place === 'lz');
  check('ground track: the mark is on the strip', groundTrackModel(state, sol).strip.marks.length === 1);
  setFate(state, 2, { kind: 'parked', why: 'no-time', restorable: false });
  setFate(state, 3, { kind: 'parked', why: 'eaten', restorable: true });
  const beacons = parkedBeacons(state);
  check('beacons: two parked pods ride the ship\'s orbit', beacons.length === 2
    && beacons.every((beacon) => Math.abs(Math.hypot(beacon.pos.x, beacon.pos.y) - 6000) < 1));
  check('plot: no arc and no dot once no pod is aboard', plotLandingModel(state, sol)?.arc === null && plotLandingModel(state, sol)?.dot === null);
  check('chip: nothing to count once every pod is away', countdownChip(state, NO_PRED, sol) === null);
  check('mini-HUD: ALL PODS AWAY', miniHudLanding(state, sol)?.window?.text === 'ALL PODS AWAY');
  down(state, sol, 2, 'lz', 'LZ-A');
  down(state, sol, 3, 'lz', 'LZ-A');
  check('crumb: ALL DOWN', headerCrumbs(state, NO_PRED).phase.text === 'ALL DOWN');
  check('brackets: LZ-A full', bracketModels(state, sol)[0]?.look === 'full' && bracketModels(state, sol)[0]?.label === 'LZ-A 3/3 ✓');
  check('mini-HUD: ★ ON TARGET 3/3', miniHudLanding(state, sol)?.onTarget.text === '★ ON TARGET 3/3' && miniHudLanding(state, sol)?.onTarget.tone === 'good');
  state.run.phase = 'flight';
  check('flight: no landing layer, SAFE ORBIT · LAUNCH BAND', plotLandingModel(state, sol) === null && ringLabel(state) === BAND_TEXT.ringFlight);
}

// --- HALCYON: two LZs, a full one ---

{
  const state = world(1);
  const [lzA, lzB] = state.landing.lzs;
  if (!lzA || !lzB) throw new Error('HALCYON has two LZs');
  const sol = aim(state, lzA.centreRad);
  down(state, sol, 1, 'lz', 'LZ-A');
  down(state, sol, 2, 'lz', 'LZ-A');
  down(state, sol, 3, 'lz', 'LZ-A');
  const bay = bayWindowModel(state, sol);
  check('full: LZ-A FULL asks first', bay.launch.look === 'asks' && bay.launch.status === 'LZ-A FULL · asks first', bay.launch.status);
  check('full: counters LZ-A 3/3 ✓, LZ-B 0/2', bay.lzs.map((c) => c.text).join(' | ') === 'LZ-A 3/3 ✓ | LZ-B 0/2');
  const chip = countdownChip(state, NO_PRED, solve(state));
  check('full: the chip aims at LZ-B (the LZ with room)', chip?.label === 'LZ-B IN', JSON.stringify(chip));
}

finish();
