// Slice 1a and 1b, Track UI: the landing's screen models (src/systems/landing-hud.ts, the landing parts of flight-hud.ts and
// hollow-hud.ts). Pure: a world from the foundation's constructors (createInitialState, beginLanding), the ship put on a
// circular orbit by hand, the drop solved by landing-solve directly (no store, no mounts, nothing flown).
//
// The words: 05-story rewrites the landing's placeholder text (data/landing-text.ts), so this suite pins exactly only
// what is decided: §3.10's state words (CAN'T LAUNCH, PARKED IN ORBIT, NOT LAUNCHED), the key hint on the launch button
// ([L]), the numbers and their formats (`0/3`, `3/4`, `±78 km`, `0:12`, `mm:ss`, the bay's ▮▯ glyphs, ★ and ✓), the
// names the data gives (LZ-A, POD 01, OKAFOR, KEPLER-186F), the decided flight words (ORBIT LOCKED) and the refusals by
// their key. Every other line is checked by its structure (`says`): it holds the LZ, the counts and the numbers it is
// about, fits its cap, and uses none of the never-say words.
//
// Slice 1b (plan §3 Track UI): ORBIT's and DROP's answers that were stubs when the views were written are set directly
// here (landing.goLow, landing.decay.last, an injected burn offer and decay forecast, a solution solved uncertain,
// Bay Ctrl's capabilities handed in), so the views are pinned whatever those stubs return.
import { check, finish } from './checks';
import type { GameState } from '@state/schema';
import type { DragKick, DropSolution, LaunchRecord, PodFate } from '@/types/landing';
import { computePrediction, samplePath, type BurnPoint, type Prediction } from '@systems/predict';
import { createInitialState } from '@state/initial';
import { beginLanding } from '@state/actions';
import { freshUnitRacks } from '@systems/carry';
import { getShip } from '@data/ships';
import { computeDropSolution, angleDelta } from '@systems/landing-solve';
import { windowOpenNow, lzAt } from '@systems/landing-rules';
import {
  lzCounters, bracketModels, dropDotModel, windowToneFraction, groundTrackModel, bayWindowModel, podTags, footerPods,
  miniHudLanding, podStreaks, landMarks, parkedBeacons, plotLandingModel, ringLabel, driverLanding, terrainGlyph,
  goLowMarks, dragStamp, terrainStretches, terrainAt, TERRAIN_PATTERN,
} from '@systems/landing-hud';
import { countdownChip, headerCrumbs, toggleAlert, decayChip, burnButton, fuelModel, plotMarkers } from '@systems/flight-hud';
import { capabilitiesNow, BAND_COPY } from '@systems/capabilities';
import { dragLineKm } from '@systems/landing-orbit';
import { miniStripRows } from '@systems/hollow-hud';
import { isDriver } from '@state/selectors';
import {
  BAND_TEXT, DRIVER_DETAIL_TEXT, LAUNCH_REFUSAL_TEXT, MINI_LANDING_TEXT, LANDING_HUD_TEXT, POD_STATE_TEXT, TOUCHDOWN_FLOAT_TEXT,
} from '@data/landing-text';
import { BAY_SLOTS, DRAG_LINE_FRAC, DRAG_STAMP_MIN_KM, GROUND_TRACK_SPAN_KM, MAX_LINE_CHARS } from '@data/tuning';

// A chip's cap (brackets, counters, the countdown chip, the mini-HUD, the bay's tags): these sit on the NAV PLOT's rim,
// the GROUND TRACK and the narrow mini-HUD, where today's longest (`[ LZ-A · 0/3 ]`) is 14. 24 leaves 05 room.
const CHIP_CHARS = 24;
// The landing spec's never-say words (01-landing §3.10, §6): no phase-2 words, no IMPACT, a pod is never lost.
const NEVER_SAY = /\b(?:woke|wake|souls?|clusters?|print\w*|scatter|deorbit|insertion|impact|lost|offline|not recovered)\b/i;
const CANT = POD_STATE_TEXT.cantLaunch;

// A placeholder line by its structure: it holds every part (a string or a pattern), fits `cap`, says no never-say word.
function says(name: string, text: string | null | undefined, parts: readonly (string | RegExp)[], cap = MAX_LINE_CHARS): void {
  const t = text ?? '';
  const missing = parts.filter((part) => (typeof part === 'string' ? !t.includes(part) : !part.test(t)));
  check(name, text != null && missing.length === 0 && t.length <= cap && !NEVER_SAY.test(t),
    `${JSON.stringify(t)} (${t.length}/${cap})${missing.length > 0 ? ` missing ${missing.map(String).join(', ')}` : ''}`);
}

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

// `sensor`: Sensor Interp's factor on the drop; above 2 it is failing or worse, so the solution is uncertain (§3.8: the
// grey dot), as DROP's capabilities will pass it.
function solve(state: GameState, sensor = 1): DropSolution {
  return computeDropSolution({
    state: state.orbit, tSec: state.clock.tSec, mu: state.level.planet.mu, R: state.level.planet.R, ring: state.level.ring,
    lzs: state.landing.lzs, factors: { sensor, plotter: 1, driver: 1 }, solution: true, uncertain: sensor > 2, validUntilTSec: null,
    solvable: true,
  });
}

// The ship on a circle of radius r, placed so the dot's centre sits at `dotRad`; the window state written as landing.ts
// writes it each AI tick.
function aim(state: GameState, dotRad: number, r = 6000, retro = false, sensor = 1): DropSolution {
  circle(state, 0, r, retro);
  const lead = angleDelta(0, solve(state).dot!.rad);
  circle(state, dotRad - lead, r, retro);
  const sol = solve(state, sensor);
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

// --- The decided words (§3.10: one word per state; 05 may not reword these) ---

check("the state words: CAN'T LAUNCH, PARKED IN ORBIT · fate unknown, NOT LAUNCHED", POD_STATE_TEXT.cantLaunch === "CAN'T LAUNCH"
  && POD_STATE_TEXT.parked === 'PARKED IN ORBIT · fate unknown' && POD_STATE_TEXT.notLaunched === 'NOT LAUNCHED');

// --- ARES-VII, LZ-A at 160° (WIDE), the dot dead centre ---

{
  const state = world();
  const lzA = state.landing.lzs[0]!;
  const sol = aim(state, lzA.centreRad);
  check('window: the dot in LZ-A at 6,000 km is a sure window', state.landing.window?.lz === 'LZ-A' && state.landing.window.sure,
    JSON.stringify(state.landing.window));
  const counters = lzCounters(state);
  check('counters: one, LZ-A, 0 of 3', counters.length === 1 && counters[0]!.lz === 'LZ-A' && counters[0]!.down === 0 && counters[0]!.count === 3);
  says('counters: the text holds LZ-A 0/3', counters[0]?.text, ['LZ-A', '0/3'], CHIP_CHARS);
  const brackets = bracketModels(state, sol);
  check('brackets: LZ-A sure (green) while the whole dot fits', brackets[0]?.look === 'sure');
  says('brackets: the label holds LZ-A 0/3', brackets[0]?.label, ['LZ-A', '0/3'], CHIP_CHARS);
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
  check('ground track: the bracket is sure', bracket?.look === 'sure');
  says('ground track: the bracket holds LZ-A 0/3', bracket?.label, ['LZ-A', '0/3'], CHIP_CHARS);
  check('ground track: the dot fits whole', track.strip.dot?.fits === 'whole');
  says('ground track: the dot reads its width, ±78 km', track.strip.dot?.text, [/±78 km/], CHIP_CHARS);
  check('ground track: plains under the dot, ≈ the ocean\'s glyph', terrainAt(track.strip.terrain, 0.5)?.glyph === TERRAIN_PATTERN.PLAINS.site
    && terrainGlyph('PLAINS') === '·' && terrainGlyph('OCEAN') === '≈');
  check('ground track: the planet line holds the strip around the dot', track.planet.dot !== null
    && track.planet.view.from < track.planet.dot && track.planet.view.to > track.planet.dot);
  state.landing.colony = 'RIVERSIDE';
  says('ground track: header names the colony once it has one', groundTrackModel(state, sol).header, [/^KEPLER-186F\b/, 'RIVERSIDE']);

  const bay = bayWindowModel(state, sol);
  check('bay: the launch button goes', bay.launch.look === 'go', bay.launch.status);
  says('bay: the launch button carries its key, [L]', bay.launch.label, [/\[\s*L\b/]);
  // Four slots loaded, three pods: the bay shows what could go (§2: `BAY ▮▮▮▯ 3/4` at ORBIT LOCK).
  check('bay: all four slots loaded', bay.bay.loaded === BAY_SLOTS && bay.bay.shown === 3, JSON.stringify(bay.bay));
  says('bay: ▮▮▮▯ 3/4 with three pods, no reload', bay.bay.text, ['▮▮▮▯ 3/4', /^(?!.*\d:\d\d)/]);
  says('bay: NEXT names POD 01 · OKAFOR, SOFT, ±78 km', bay.nextText, ['POD 01', 'OKAFOR', /\bSOFT\b/, '±78 km']);
  says('bay: END LANDING asks about the 3 pods, PARKED IN ORBIT', bay.endLanding.confirm, ['3 PODS', 'PARKED IN ORBIT']);

  const chip = countdownChip(state, NO_PRED, sol);
  check('chip: a window chip counting mm:ss to the close', chip?.kind === 'window' && /^\d\d:\d\d$/.test(chip.time), JSON.stringify(chip));
  const openWord = chip?.label.replace('LZ-A', '').trim() ?? '';
  says('chip: names LZ-A (open)', chip?.label, ['LZ-A'], CHIP_CHARS);
  state.ui.mode = 'memory';
  const alert = toggleAlert(state, NO_PRED);
  check('toggle: from blue during a window, an alert back to the SHIP', alert !== null && alert.screen === 'tools', JSON.stringify(alert));
  says('toggle: says LZ-A is open, as the chip does', alert === null ? null : `${alert.head} ${alert.body}`, ['LZ-A', openWord], CHIP_CHARS);
  const bayHidden = bayWindowModel(state, sol);
  check('bay: from blue the button still reads what [L] does in amber', bayHidden.launch.look === 'go');
  state.ui.mode = 'tools';
  check('ring: LAUNCH BAND while landing', ringLabel(state) === BAND_TEXT.ringLanding);
  const mini = miniHudLanding(state, sol);
  check('mini-HUD: the window is open', mini?.window?.open === true);
  says('mini-HUD: the window names LZ-A', mini?.window?.text, ['LZ-A', openWord], CHIP_CHARS);
  says('mini-HUD: the bay shows ▮▮▮▯', mini?.bay, ['▮▮▮▯'], CHIP_CHARS);
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
  check('away: LZ-A is off the strip, waiting at the right edge', track.strip.brackets.length === 0 && track.strip.ahead.length >= 1,
    JSON.stringify(track.strip.ahead));
  says('away: the waiting LZ-A shows its m:ss countdown', track.strip.ahead[0]?.text, [/^LZ-A\b/, /\b\d+:\d\d$/], CHIP_CHARS);
  const chip = countdownChip(state, NO_PRED, sol);
  check('away: the chip counts mm:ss to the window, not yet 00:00', chip !== null && /^\d\d:\d\d$/.test(chip.time) && chip.time !== '00:00',
    JSON.stringify(chip));
  says('away: the chip names LZ-A, and is not the open chip', chip?.label, ['LZ-A', /^(?!.*\bOPEN\b)/], CHIP_CHARS);
  check('away: the bay asks first (off-site)', bayWindowModel(state, sol).launch.look === 'asks');
  check('away: the mini-HUD window is not open', miniHudLanding(state, sol)?.window?.open === false);
  says('away: the mini-HUD names LZ-A with an m:ss countdown', miniHudLanding(state, sol)?.window?.text, [/^LZ-A\b/, /\b\d+:\d\d$/], CHIP_CHARS);
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
  check('out of band: the bay refuses with the refusal\'s words', bayWindowModel(state, high).launch.look === 'blocked'
    && bayWindowModel(state, high).launch.status === LAUNCH_REFUSAL_TEXT['OUT OF THE LAUNCH BAND'], bayWindowModel(state, high).launch.status);
}

// --- Reload, BAY / NEXT, LOAD NEXT, the hurt driver ---

{
  const state = world();
  const sol = aim(state, state.landing.lzs[0]!.centreRad);
  state.landing.bay = { loaded: 3, reloadTac: 8, cadenceLeftTac: 1.2 };
  const bay = bayWindowModel(state, sol);
  // 8 tactical s into the reload: BAY_RELOAD_TAC (20) minus 8 leaves 0:12.
  says('reload: ▮▮▮▯ 3/4 and the reload\'s 0:12', bay.bay.text, ['▮▮▮▯ 3/4', /\b0:12\b/]);
  check('cadence: the button waits with the RELOADING refusal\'s words', bay.launch.look === 'blocked'
    && bay.launch.status === LAUNCH_REFUSAL_TEXT.RELOADING, bay.launch.status);
  const tags = podTags(state);
  const { tagNext, tagBay } = DRIVER_DETAIL_TEXT;
  check('tags: three in the bay, POD 01 next', tags.get(1) === tagNext && tags.get(2) === tagBay && tags.get(3) === tagBay
    && (tagNext as string) !== tagBay && [tagNext, tagBay].every((tag) => tag.length <= CHIP_CHARS), JSON.stringify([...tags]));
  state.landing.loadNext = 3;
  check('LOAD NEXT: POD 03 is next', podTags(state).get(3) === tagNext && bayWindowModel(state, sol).next?.pod === 3);
  state.landing.loadNext = null;
  const brandt = state.memory.find((seg) => isDriver(seg) && seg.pod === 2);
  if (!brandt || !isDriver(brandt)) throw new Error('no POD 02');
  check('detail: POD 02 at 44% is in the bay', driverLanding(state, brandt, sol).tag === tagBay);
  says('detail: POD 02 at 44% will land HARD', driverLanding(state, brandt, sol).text, [/\bHARD\b/, /^(?!.*\bSOFT\b)/]);
  const okafor = state.memory.find((seg) => isDriver(seg) && seg.pod === 1);
  if (!okafor || !isDriver(okafor)) throw new Error('no POD 01');
  check('detail: POD 01 is next', driverLanding(state, okafor, sol).tag === tagNext);
  says('detail: POD 01 will land SOFT, its drop ±78 km', driverLanding(state, okafor, sol).text, [/\bSOFT\b/, '±78 km']);
  brandt.integrity = 10;
  says("detail: dead, CAN'T LAUNCH (§3.10's word), and what to do", driverLanding(state, brandt, sol).text, [CANT, /REPAIR/]);
  const foot = footerPods(state);
  check('footer: 3 aboard, 0 landed, 1 can\'t launch', foot.aboard === 3 && foot.landed === 0 && foot.cantLaunch === 1, JSON.stringify(foot));
  says("footer: the counts in order, 1 CAN'T LAUNCH", foot.text, [/\b3\b.*\b0\b.*\b1 CAN'T LAUNCH\b/]);
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
  says('crumb: 1/3 down once the first pod is down', headerCrumbs(state, NO_PRED).phase.text, ['1/3', /^(?!ORBIT LOCKED)/], CHIP_CHARS);
  check('marks: ◘ for the pod down', landMarks(state).length === 1 && landMarks(state)[0]!.place === 'lz');
  check('ground track: the mark is on the strip', groundTrackModel(state, sol).strip.marks.length === 1);
  setFate(state, 2, { kind: 'parked', why: 'no-time', restorable: false });
  setFate(state, 3, { kind: 'parked', why: 'eaten', restorable: true });
  const beacons = parkedBeacons(state);
  check('beacons: two parked pods ride the ship\'s orbit', beacons.length === 2
    && beacons.every((beacon) => Math.abs(Math.hypot(beacon.pos.x, beacon.pos.y) - 6000) < 1));
  check('plot: no arc and no dot once no pod is aboard', plotLandingModel(state, sol)?.arc === null && plotLandingModel(state, sol)?.dot === null);
  check('chip: nothing to count once every pod is away', countdownChip(state, NO_PRED, sol) === null);
  check('mini-HUD: every pod away', miniHudLanding(state, sol)?.window?.text === MINI_LANDING_TEXT.allAway && miniHudLanding(state, sol)?.window?.open === false);
  down(state, sol, 2, 'lz', 'LZ-A');
  down(state, sol, 3, 'lz', 'LZ-A');
  check('crumb: all down', headerCrumbs(state, NO_PRED).phase.text === LANDING_HUD_TEXT.crumbAllDown);
  check('brackets: LZ-A full', bracketModels(state, sol)[0]?.look === 'full');
  says('brackets: the full label holds LZ-A 3/3 ✓', bracketModels(state, sol)[0]?.label, ['LZ-A', '3/3', '✓'], CHIP_CHARS);
  check('mini-HUD: on target, good', miniHudLanding(state, sol)?.onTarget.tone === 'good');
  says('mini-HUD: ★ and 3/3 on target', miniHudLanding(state, sol)?.onTarget.text, [/^★/, '3/3'], CHIP_CHARS);
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
  check('full: [L] asks first', bay.launch.look === 'asks', bay.launch.status);
  says('full: the bay says LZ-A is FULL', bay.launch.status, ['LZ-A', /\bFULL\b/]);
  check('full: counters LZ-A full 3 of 3, LZ-B 0 of 2', bay.lzs.length === 2 && bay.lzs[0]!.lz === 'LZ-A' && bay.lzs[0]!.full
    && bay.lzs[0]!.down === 3 && bay.lzs[1]!.lz === 'LZ-B' && !bay.lzs[1]!.full && bay.lzs[1]!.down === 0 && bay.lzs[1]!.count === 2);
  says('full: LZ-A\'s counter 3/3 ✓', bay.lzs[0]?.text, ['LZ-A', '3/3', '✓'], CHIP_CHARS);
  says('full: LZ-B\'s counter 0/2, no ✓', bay.lzs[1]?.text, ['LZ-B', '0/2', /^[^✓]*$/], CHIP_CHARS);
  const chip = countdownChip(state, NO_PRED, solve(state));
  check('full: the chip counts to a window', chip !== null && /^\d\d:\d\d$/.test(chip.time), JSON.stringify(chip));
  says('full: the chip aims at LZ-B (the LZ with room)', chip?.label, ['LZ-B', /^(?!.*LZ-A)/], CHIP_CHARS);
}

// --- Slice 1b ---------------------------------------------------------------------------------------------------------

// A burn the landing offers (landing-orbit landingBurnOffer's shape), injected: `inSec` game s to its START BURN.
function offerOf(reason: BurnPoint['reason'], inSec: number, extra: Partial<BurnPoint> = {}): BurnPoint {
  return {
    reason, preset: reason === 'lift' ? 'prograde' : 'retrograde', event: reason === 'go-low' ? 'point' : reason === 'lift' ? 'apo' : 'peri',
    eventInSec: inSec + 10, inSec, dvKmS: 0.05, estBurnSec: 20, approaching: true, firstOfTwo: false, ...extra,
  };
}

// The DRAG line (§3.7): only on ships with drag, at the sweet zone's lower edge.
{
  const ares = world();
  check('DRAG: none on ARES-VII (layer 1 never decays)', plotLandingModel(ares, aim(ares, ares.landing.lzs[0]!.centreRad))?.dragLineKm === null);
  const halcyon = world(1);
  const ring = halcyon.level.ring;
  const line = plotLandingModel(halcyon, aim(halcyon, halcyon.landing.lzs[0]!.centreRad))?.dragLineKm ?? null;
  check('DRAG: HALCYON\'s circle at ring.min + ¼ of the band', line !== null && line === dragLineKm(ring)
    && Math.abs(line - (ring.min + DRAG_LINE_FRAC * (ring.max - ring.min))) < 1e-9 && DRAG_LINE_FRAC === 0.25, `${line} on ${ring.min}–${ring.max}`);
  halcyon.run.phase = 'flight';
  check('DRAG: no landing layer in the flight', plotLandingModel(halcyon, null) === null);
}

// The grey DROP UNCERTAIN dot (§3.8): grey dot and arc, `≈` on every drop width.
{
  const state = world(3);
  const lzA = state.landing.lzs[0]!;
  const sure = aim(state, lzA.centreRad);
  check('uncertain: a sure solution is not', dropDotModel(state, sure)?.uncertain === false && plotLandingModel(state, sure)?.dotLabel === null);
  const sol = aim(state, lzA.centreRad, 6000, false, 2.5);
  const dot = dropDotModel(state, sol);
  const wide = `≈±${Math.round(sol.dot!.halfWidthKm)} km`;
  check('uncertain: the dot is grey (uncertain), ×2.5 the sure one', sol.uncertain && dot?.uncertain === true
    && Math.abs(sol.dot!.halfWidthKm / sure.dot!.halfWidthKm - 2.5) < 1e-6 && Math.round(sol.dot!.halfWidthKm) === 196, wide);
  const plot = plotLandingModel(state, sol);
  check('uncertain: the pod arc greys with it', plot?.arc?.uncertain === true);
  check('uncertain: the plot labels the dot ≈±196 km', plot?.dotLabel === wide, String(plot?.dotLabel));
  says('uncertain: the GROUND TRACK reads ≈±196 km', groundTrackModel(state, sol).strip.dot?.text, [wide], CHIP_CHARS);
  check('uncertain: the GROUND TRACK\'s dot is grey', groundTrackModel(state, sol).strip.dot?.uncertain === true);
  says('uncertain: the POD BAY\'s NEXT reads the solved dot, ≈±196 km', bayWindowModel(state, sol).nextText, [wide]);
  says('a sure drop: no ≈ on NEXT', bayWindowModel(state, sure).nextText, [/±78 km/, /^[^≈]*$/]);
  const lead = state.memory.find((seg) => isDriver(seg) && seg.integrity >= 80);
  if (!lead || !isDriver(lead)) throw new Error('VESPER has a healthy driver');
  says('uncertain: the detail panel\'s drop is ≈', driverLanding(state, lead, sol, { sensor: 2.5, plotter: 1, driver: 1 }).text, [wide]);
}

// No-go arcs (§3.6): VESPER's lava, hatched on the plot, on both GROUND TRACK lines with its word, in the class line.
{
  const state = world(3);
  const [lava] = state.landing.noGo;
  if (!lava) throw new Error('VESPER has no-go arcs');
  const sol = aim(state, lava.centreRad);
  const plot = plotLandingModel(state, sol);
  check('no-go: two LAVA arcs on the plot', plot?.noGo.length === 2 && plot.noGo.every((arc) => arc.word === 'LAVA'));
  const track = groundTrackModel(state, sol);
  check('no-go: both on the planet line', track.planet.noGo.length === 2);
  const span = track.strip.noGo[0];
  check('no-go: the lava under the dot on the strip, centred, 5° wide', span !== undefined && span.word === 'LAVA'
    && Math.abs((span.from + span.to) / 2 - 0.5) < 0.01
    && Math.abs((span.to - span.from) * GROUND_TRACK_SPAN_KM - 5 * DEG * state.level.planet.R) < 1, JSON.stringify(span));
  check('no-go: the terrain row draws no glyph over the lava (it is hatched)', terrainAt(track.strip.terrain, 0.5)?.kind === 'no-go'
    && terrainAt(track.strip.terrain, 0.5)?.glyph === '');
  check('float: +0 LAVA, in the arc\'s word', TOUCHDOWN_FLOAT_TEXT.noGo('LAVA') === '+0 LAVA');
  const cls = bayWindowModel(state, sol).cls;
  says('class line: VOLCANIC and what off-site scores', cls.text, [/^VOLCANIC\b/, 'off-site']);
  says('class line: NO-GO names LAVA once', cls.noGo, ['NO-GO', 'LAVA', /^(?!.*LAVA.*LAVA)/]);
  const ares = world();
  check('class line: no NO-GO on ARES-VII', bayWindowModel(ares, aim(ares, ares.landing.lzs[0]!.centreRad)).cls.noGo === null);
}

// Terrain stretches (§4's glyph rows): the pattern per terrain word, the brackets flat, no-go first.
{
  const vesper = world(3).landing;
  const arcs = terrainStretches(vesper);
  const ground = arcs.filter((arc) => arc.kind === 'ground');
  check('terrain: no-go first, then the brackets, then the ground', arcs[0]?.kind === 'no-go' && arcs[1]?.kind === 'no-go'
    && arcs[2]?.kind === 'site' && arcs.slice(2 + vesper.lzs.length).every((arc) => arc.kind === 'ground'));
  check('terrain: VOLCANIC ground is ^ with stretches of ·', ground.some((arc) => arc.glyph === '^') && ground.some((arc) => arc.glyph === '·')
    && ground.every((arc) => arc.glyph === '^' || arc.glyph === '·')
    && ground.filter((arc) => arc.glyph === '^').length > ground.length / 2);
  check('terrain: the ground covers the planet once', Math.abs(ground.reduce((sum, arc) => sum + arc.toRad - arc.fromRad, 0) - 2 * Math.PI) < 1e-9);
  check('terrain: the same planet reads the same', JSON.stringify(terrainStretches(vesper)) === JSON.stringify(arcs));
  const kestrel = world(2);
  const lzA = kestrel.landing.lzs[0]!;
  const strip = groundTrackModel(kestrel, aim(kestrel, lzA.centreRad)).strip.terrain;
  check('terrain: OCEAN reads · under the bracket, ≈ off it', terrainAt(strip, 0.5)?.glyph === '·' && terrainAt(strip, 0.5)?.kind === 'site'
    && terrainAt(strip, 0.02)?.glyph === '≈' && terrainAt(strip, 0.98)?.glyph === '≈');
}

// An LZ out of the band (§3.7: a PARTIAL orbit, decay): named at the right edge, never counted down, its bracket hatched.
{
  const state = world(1);
  const [lzA, lzB] = state.landing.lzs;
  if (!lzA || !lzB) throw new Error('HALCYON has two LZs');
  const sol = aim(state, lzA.centreRad - 40 * DEG);
  const crafted: DropSolution = {
    ...sol, windows: sol.windows.map((w) => (w.lz === 'LZ-B' ? { ...w, inBand: false, inBandOpenInSec: null, inBandCloseInSec: null } : w)),
  };
  check('out of band: LZ-B\'s bracket is hatched', bracketModels(state, crafted).find((b) => b.lz === 'LZ-B')?.outOfBand === true);
  const strip = groundTrackModel(state, crafted).strip;
  const oob = strip.outOfBandAhead.find((entry) => entry.lz === 'LZ-B');
  says('out of band: LZ-B ▸ OUT OF BAND at the right edge, no countdown', oob?.text, [/^LZ-B\b/, 'OUT OF BAND', /^[^:]*$/], CHIP_CHARS);
  check('out of band: never in the counted list', !strip.ahead.some((entry) => entry.lz === 'LZ-B') && strip.ahead.some((entry) => entry.lz === 'LZ-A'));
  check('in band: nothing listed out of band', groundTrackModel(state, sol).strip.outOfBandAhead.length === 0);
}

// Bay Ctrl (§3.4): the pip in BAND_COPY.bay's words, and NO BAY CTRL with LAUNCH disabled (never "offline" by the pods).
{
  const state = world();
  const sol = aim(state, state.landing.lzs[0]!.centreRad);
  const caps = capabilitiesNow(state);
  const bayFile = state.memory.find((seg) => seg.role === 'bay');
  if (!bayFile || bayFile.type !== 'ship') throw new Error('Bay Ctrl is a ship file');
  const hurtCaps = { ...caps, bay: { band: 'degraded' as const, cadenceTac: 2.7, offline: false } };
  bayFile.scanned = false;
  const unscanned = bayWindowModel(state, sol, hurtCaps);
  check('bay ctrl: not scanned yet, its damage stays hidden (?)', unscanned.ctrl.band === 'unknown' && unscanned.ctrl.text === 'BAY CTRL',
    JSON.stringify(unscanned.ctrl));
  bayFile.scanned = true;
  const ok = bayWindowModel(state, sol, caps);
  check('bay ctrl: ok, the pip just names the file', ok.ctrl.band === 'ok' && !ok.ctrl.offline && ok.launch.look === 'go');
  const hurt = bayWindowModel(state, sol, hurtCaps);
  check('bay ctrl: degraded, in BAND_COPY.bay\'s words', hurt.ctrl.band === 'degraded' && hurt.ctrl.text === BAND_COPY.bay.degraded
    && hurt.launch.look === 'go');
  const gone = bayWindowModel(state, sol, { ...caps, bay: { band: 'missing', cadenceTac: null, offline: true } });
  check('NO BAY CTRL: LAUNCH disabled with the refusal\'s words', gone.launch.look === 'blocked'
    && gone.launch.status === LAUNCH_REFUSAL_TEXT['BAY OFFLINE'], gone.launch.status);
  bayFile.scanned = false;
  check('NO BAY CTRL: loud even unscanned', bayWindowModel(state, sol, { ...caps, bay: { band: 'missing', cadenceTac: null, offline: true } })
    .ctrl.band === 'missing');
  check('NO BAY CTRL: the pip says NO BAY CTRL', gone.ctrl.offline && gone.ctrl.band === 'missing' && gone.ctrl.text === 'NO BAY CTRL');
  says('NO BAY CTRL: the button\'s words hold NO BAY CTRL, never "offline"', gone.launch.status, ['NO BAY CTRL']);
  state.clock.paused = true;
  check('NO BAY CTRL: PAUSED still outranks it', bayWindowModel(state, sol, { ...caps, bay: { band: 'missing', cadenceTac: null, offline: true } })
    .launch.status === LAUNCH_REFUSAL_TEXT.PAUSED);
}

// The engine in LANDING (§1.4): BURN while the landing goes on, LANDING OVER once it ends.
{
  const state = world(1);
  aim(state, state.landing.lzs[0]!.centreRad);
  const live = burnButton(state);
  check('burn: the BURN button is live in the landing', live.look === 'ready' && !live.disabled, live.text);
  state.landing.ended = 'end-landing';
  const over = burnButton(state);
  check('burn: LANDING OVER once the landing ends', over.disabled && over.text === 'LANDING OVER', over.text);
}

// The offer (plan §1.4, foundation review): the chip, the START BURN tick and FUEL's NEEDED read the offer, not the plan.
{
  const state = world(1);
  const lzA = state.landing.lzs[0]!;
  const sol = aim(state, lzA.centreRad - 60 * DEG);
  const pred = computePrediction(state);
  const warp = state.level.tacticalWarp;
  const windowChip = countdownChip(state, pred, sol);
  check('offer: with none, the chip counts to the window', windowChip?.kind === 'window', JSON.stringify(windowChip));
  const soon = offerOf('rp-low', 12 * warp);
  const chip = countdownChip(state, pred, sol, soon);
  check('offer: a burn before the window takes the chip, mm:ss to its START BURN', chip?.kind === 'burn' && chip.time === '00:12', JSON.stringify(chip));
  says('offer: the chip names the burn (BRAKE IN), not the LZ', chip?.label, [/\bIN$/, /^(?!.*LZ-)/], CHIP_CHARS);
  const late = offerOf('rp-low', 1e6);
  check('offer: a burn after the window leaves the chip to the window', countdownChip(state, pred, sol, late)?.kind === 'window');
  const quarter = (2 * Math.PI * Math.sqrt(6000 ** 3 / state.level.planet.mu)) / 4;
  const goLow = offerOf('go-low', quarter - 20, { eventInSec: quarter, aimLz: 'LZ-A' });
  const tick = plotMarkers(state, pred, capabilitiesNow(state).plot, goLow).startBurn;
  const sample = samplePath(pred, goLow.inSec);
  check('offer: the START BURN tick sits at the offer\'s START BURN', tick !== null && sample !== null
    && Math.hypot(tick.pos.x - sample.pos.x, tick.pos.y - sample.pos.y) < 1e-6);
  check('offer: the raw plan alone draws no START BURN in the landing',
    plotMarkers(state, { ...pred, burnPoint: goLow }, capabilitiesNow(state).plot, null).startBurn === null);
  const priced = { ...pred, burnPoint: goLow, neededPct: 12, fuelShort: false } as Prediction;
  check('offer: FUEL prices the offered burn', fuelModel(state, priced, goLow).neededPct === 12 && fuelModel(state, priced, null).neededPct === null);
}

// GO LOWER's marks (§3.7): the ◇ half an orbit before the launch point, counted while it is the offer; the target tick.
{
  const state = world(1);
  const lzA = state.landing.lzs[0]!;
  aim(state, lzA.centreRad - 120 * DEG, 6500);
  const launchRad = lzA.centreRad - 70 * DEG;
  state.landing.goLow = { lz: 'LZ-A', launchRad, burnRad: launchRad - Math.PI, targetRadiusKm: 5600, floorKm: 5100, held: false };
  const pred = computePrediction(state);
  const quiet = goLowMarks(state, pred, null);
  check('◇: at the burn point on the orbit (6,500 km)', quiet !== null
    && Math.abs(Math.hypot(quiet.point.pos.x, quiet.point.pos.y) - 6500) < 1
    && Math.abs(angleDelta(launchRad - Math.PI, Math.atan2(quiet.point.pos.y, quiet.point.pos.x))) < 1e-9);
  check('◇: the target tick at the launch point, for LZ-A', quiet !== null && quiet.target.label.includes('LZ-A')
    && Math.abs(angleDelta(launchRad, Math.atan2(quiet.target.pos.y, quiet.target.pos.x))) < 1e-9);
  check('◇: no countdown while it is not the offer', quiet?.point.countdown === null && quiet.point.lines[0] === '◇');
  says('◇: the word under it names GO LOWER', quiet?.point.lines[1], ['GO LOWER'], CHIP_CHARS);
  const warp = state.level.tacticalWarp;
  const offered = goLowMarks(state, pred, offerOf('go-low', 30 * warp, { eventInSec: 42 * warp, aimLz: 'LZ-A' }));
  check('◇: counted to the point while offered, ◇ 00:42', offered?.point.lines[0] === '◇ 00:42', JSON.stringify(offered?.point.lines));
  check('◇: another LZ\'s offer does not count it', goLowMarks(state, pred, offerOf('go-low', 30, { aimLz: 'LZ-B' }))?.point.countdown === null);
  check('◇: on the plot model', plotLandingModel(state, null, pred, null)?.goLow?.lz === 'LZ-A');
  state.landing.ended = 'end-landing';
  check('◇: gone once the landing ends', goLowMarks(state, pred, null) === null);
}

// The decay chip (§3.7's forecast) and the drag stamp: from injected forecasts and a crafted landing.decay.last.
{
  const state = world(1);
  aim(state, state.landing.lzs[0]!.centreRad);
  const two = decayChip(state, { orbitsToLeave: 1.6, nextDvKmS: 0.02 }, null);
  says('decay: DECAY · out of band in 2 orbits (1.6 rounds up)', two?.text, ['DECAY', 'OUT OF BAND', /\b2 ORBITS\b/]);
  check('decay: urgent at DECAY_WARN_ORBITS', two?.urgent === true && two.orbits === 1.6);
  const five = decayChip(state, { orbitsToLeave: 5, nextDvKmS: 0.01 }, null);
  check('decay: calm further out', five !== null && !five.urgent && five.text.includes('5 ORBITS'));
  says('decay: the lift burn\'s key while it is offered', decayChip(state, { orbitsToLeave: 2, nextDvKmS: 0.02 }, offerOf('lift', 40))?.text,
    ['DECAY', '[W]']);
  check('decay: no key for another burn', !(decayChip(state, { orbitsToLeave: 2, nextDvKmS: 0.02 }, offerOf('rp-low', 40))?.text.includes('[')));
  check('decay: nothing with ▼ above the line', decayChip(state, { orbitsToLeave: null, nextDvKmS: 0 }, null) === null
    && decayChip(state, null, null) === null);
  const ares = world();
  check('decay: nothing on ARES-VII (no drag)', decayChip(ares, { orbitsToLeave: 2, nextDvKmS: 0.02 }, null) === null);
  const kick: DragKick = { atTSec: 100, rpKm: 5400, dvKmS: 0.022, rad: 1.2, apsis: '▲', dropKm: 110 };
  state.landing.decay = { lastKickTSec: 100, kicks: 1, last: kick };
  const stamp = dragStamp(state.landing.decay.last);
  says('stamp: DRAG · ▲ −110 km', stamp?.text, ['DRAG', '▲', '−110 km'], CHIP_CHARS);
  check('stamp: at the kick\'s ▼', stamp !== null && Math.abs(Math.hypot(stamp.pos.x, stamp.pos.y) - 5400) < 1e-9
    && Math.abs(Math.atan2(stamp.pos.y, stamp.pos.x) - 1.2) < 1e-9);
  check('stamp: none under DRAG_STAMP_MIN_KM', dragStamp({ ...kick, dropKm: DRAG_STAMP_MIN_KM - 0.5 }) === null && dragStamp(null) === null);
}

finish();
