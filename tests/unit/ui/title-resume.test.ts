// Slice 3c Track UI: the title's model (systems/title.ts titleModel; 02-map §3.11, §4; 05-story §3.12; 3c plan §3 steps 2
// and 6), pure on crafted states: run 1's line, run 2's launch line (`UNIT-048 · YEAR 2302 · LAUNCHED 1 YEAR AFTER UNIT-047`)
// with its roll's years and its stamp (the valve's years included, `SAME YEAR` for 0), the RESUME block by save point,
// CAN'T RESUME with the refusal's words (never its detail), RUN SAVE OFFLINE, RECEIVE TRANSMISSION hidden while a save is
// there, `runs save between ships`, and the archive's one-off notes.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { SaveState, ResumeLine } from '@/types/save';
import { createInitialState } from '@state/initial';
import { titleModel, titleLaunch, resumeLineText } from '@systems/title';
import { MAP_TEXT } from '@data/map-text';
import { MAX_LINE_CHARS } from '@data/tuning';
import { run2Map, RUN1_LAST_UNIT } from '../world/run2-fixture';

const NO_SAVE: SaveState = { status: 'ok', resume: null, refusal: null };

function run1(save: SaveState = NO_SAVE): Pick<GameState, 'run' | 'save'> {
  const state = createInitialState({ seed: 1, phase: 'title' });
  return { run: state.run, save };
}

function run2(save: SaveState = NO_SAVE, history: Partial<GameState['run']['map']['history']> = {}): Pick<GameState, 'run' | 'save'> {
  const state = createInitialState({ seed: 1, phase: 'title', map: run2Map(1) });
  state.run.unitNumber = 48;
  state.run.lastUnit = structuredClone(RUN1_LAST_UNIT);
  Object.assign(state.run.map.history, history);
  return { run: state.run, save };
}

const one = titleModel(run1(), null);
check('run 1: `UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT`, no launch roll, RECEIVE offered, `runs save between ships`',
  one.unitLine === 'UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT' && one.launch === null && one.receive && one.save === null
  && one.saveNote === 'runs save between ships' && one.notes.length === 0, one.unitLine);

const two = titleModel(run2(), null);
check('run 2: `UNIT-048 · YEAR 2301 · LAUNCHED 1 YEAR AFTER UNIT-047`, the roll from 2300, the stamp `+1 YEAR`',
  two.unitLine === 'UNIT-048 · YEAR 2301 · LAUNCHED 1 YEAR AFTER UNIT-047' && two.launch?.fromYear === 2300 && two.launch.toYear === 2301
  && two.launch.years === 1 && two.launch.stamp === '+1 YEAR', `${two.unitLine} ${JSON.stringify(two.launch)}`);
const valve = titleLaunch(run2(NO_SAVE, { gap: 3, valveYears: 11 }));
check('…the time valve\'s years are in the line\'s number and its stamp says the arm moved on (02 §3.12 step 6)',
  valve?.years === 14 && valve.fromYear === 2301 - 14 && valve.stamp === '+14 YEARS · THE ARM MOVED ON'
  && MAP_TEXT.title.launched('UNIT-048', 2301, valve.years, valve.last) === 'UNIT-048 · YEAR 2301 · LAUNCHED 14 YEARS AFTER UNIT-047',
  JSON.stringify(valve));
const same = titleModel(run2(NO_SAVE, { gap: 0 }), null);
check('…a gap of 0: `LAUNCHED IN THE SAME YEAR AS UNIT-047`, stamp `SAME YEAR`',
  same.unitLine.endsWith('LAUNCHED IN THE SAME YEAR AS UNIT-047') && same.launch?.stamp === 'SAME YEAR', same.unitLine);
check('…a run whose history names no last unit keeps the plain line', titleLaunch(run2(NO_SAVE, { lastUnitNumber: null })) === null);

// --- The RESUME block ---------------------------------------------------------------------------------------------------------
const resume = (point: ResumeLine['point'], depth: number, ship: string, year: number): SaveState =>
  ({ status: 'ok', resume: { unit: 47, depth, ship, year, point }, refusal: null });
const boot = titleModel(run1(resume('beam', 4, 'VESPER', 2625)), null);
check('a save at BEAM: `RESUME · UNIT-047 · SHIP 4 · bound for VESPER · 2625` (02 §3.11\'s line), RECEIVE hidden, no note',
  boot.save?.kind === 'resume' && boot.save.line === 'RESUME · UNIT-047 · SHIP 4 · bound for VESPER · 2625' && !boot.receive && boot.saveNote === null,
  JSON.stringify(boot.save));
check('…NEW RUN asks first: `ABANDON UNIT-047\'S RUN? · ITS SHIPS COUNT AS DONE`',
  boot.save?.kind === 'resume' && boot.save.confirm === 'ABANDON UNIT-047\'S RUN? · ITS SHIPS COUNT AS DONE');
check('…the other points: RUN START names ship 1, SHIP DONE the desk (the walk\'s line), ENDING CHOSEN the final report',
  resumeLineText(resume('run-start', 1, 'ARES-VII', 2300).resume!) === 'RESUME · UNIT-047 · SHIP 1 · bound for ARES-VII · 2300'
  && resumeLineText({ unit: 48, depth: 3, ship: 'STEADFAST', year: 2470, point: 'ship-done' }) === 'RESUME · UNIT-048 · SHIP 3 DONE · AT THE DESK · 2470'
  && resumeLineText(resume('ending-chosen', 6, 'LAST LIGHT', 3020).resume!) === 'RESUME · UNIT-047 · LAST LIGHT · LANDING REPORT · 3020');
const cant = titleModel(run1({ status: 'cant-resume', resume: null, refusal: { kind: 'stale', detail: 'unit 47 ≠ archive unit 48 (secret)' } }), null);
check('CAN\'T RESUME: `RUN SAVE CAN\'T RESUME · THAT RUN ALREADY ENDED` from the refusal\'s kind; its detail never on screen',
  cant.save?.kind === 'cant-resume' && cant.save.line === 'RUN SAVE CAN\'T RESUME · THAT RUN ALREADY ENDED' && !cant.save.line.includes('secret')
  && !cant.receive && cant.saveNote === null, JSON.stringify(cant.save));
let threw = false;
try { titleModel(run1({ status: 'cant-resume', resume: null, refusal: null }), null); } catch { threw = true; }
check('…a CAN\'T RESUME with no refusal is a bug and throws', threw);
const offline = titleModel(run1({ status: 'offline', resume: null, refusal: null }), null);
check('RUN SAVE OFFLINE: said, and RECEIVE still offered (play goes on unsaved); no `runs save between ships`',
  offline.save?.kind === 'offline' && offline.save.line === 'RUN SAVE OFFLINE' && offline.receive && offline.saveNote === null);
const headless = titleModel(run1({ status: 'none', resume: null, refusal: null }), null);
check('a headless world (no save behind it): no block, no note', headless.save === null && headless.saveNote === null && headless.receive);

// --- The one-off notes -------------------------------------------------------------------------------------------------------
check('the archive\'s one-off notes, each once (older archive, arm redrawn)',
  titleModel(run1(), { olderArchive: true, armReset: true }).notes.join(' | ') === `${MAP_TEXT.save.olderArchive} | ${MAP_TEXT.save.armReset}`
  && titleModel(run1(), { olderArchive: false, armReset: false }).notes.length === 0);

const long = [two.unitLine, boot.save?.line ?? '', cant.save?.line ?? '', valve?.stamp ?? ''].filter((line) => line.length > MAX_LINE_CHARS);
check(`every title line here fits ${MAX_LINE_CHARS} characters`, long.length === 0, long.join(' | '));
finish();
