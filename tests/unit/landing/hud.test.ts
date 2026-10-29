// Slice 1a, Track UI: the landing's screen models (src/systems/landing-hud.ts, the landing parts of flight-hud.ts and
// hollow-hud.ts). Pure: a world from the foundation's constructors (createInitialState, beginLanding), the ship put on a
// circular orbit by hand, the drop solved by landing-solve directly (no store, no mounts, nothing flown).
//
// The words: 05-story rewrites the landing's placeholder text (data/landing-text.ts), so this suite pins exactly only
// what is decided: §3.10's state words (CAN'T LAUNCH, PARKED IN ORBIT, NOT LAUNCHED), the key hint on the launch button
// ([L]), the numbers and their formats (`0/3`, `3/4`, `±78 km`, `0:12`, `mm:ss`, the bay's ▮▯ glyphs, ★ and ✓), the
// names the data gives (LZ-A, POD 01, OKAFOR, KEPLER-186F), the decided flight words (ORBIT LOCKED) and the refusals by
// their key. Every other line is checked by its structure (`says`): it holds the LZ, the counts and the numbers it is
// about, fits its cap, and uses none of the never-say words.
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
import { BAND_TEXT, DRIVER_DETAIL_TEXT, LAUNCH_REFUSAL_TEXT, MINI_LANDING_TEXT, LANDING_HUD_TEXT, POD_STATE_TEXT } from '@data/landing-text';
import { BAY_SLOTS, GROUND_TRACK_SPAN_KM, MAX_LINE_CHARS } from '@data/tuning';

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
  check('ground track: plains glyph', track.strip.terrain[0]?.glyph === terrainGlyph('PLAINS') && terrainGlyph('OCEAN') === '≈');
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

finish();
