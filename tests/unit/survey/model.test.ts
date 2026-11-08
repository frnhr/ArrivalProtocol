// Slice 6 Track SWATH (docs/phase3/impl/slice-6-plan.md §7.1): SURVEY's pure rules (systems/survey-model.ts), store level,
// under a second. No clock, no harness:
// • sweptCells: CCW and CW, a wrap through 0, a full turn (a long SKIP) maps all, ±20° against ±40°, the cell of an angle;
// • siteStars and swathHalfRad;
// • surveyRunning on a POOR CORMORANT (run 1, seed 7, both gates raised): off, waiting, running, paused, done, by version, the
//   phase, the clock and the landing's end;
// • every assignRefusal (closed, not-found, wreck, same, too-small, taken, landing-over, pods-down, falling, window-open, a held
//   GO LOWER for the LZ: review m5), assignableLzs's order, and that unknown LZs and sites throw;
// • bestSwap: only a known-bad LZ, only a found site known FLAT with ROOM, widest first; surveySwap needs no window open;
// • mappedPct (the lead's) on what the cells say.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { LaunchRecord } from '@/types/landing';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { mappedPct } from '@state/survey-selectors';
import {
  sweptCells, cellOf, siteStars, swathHalfRad, surveyRunning, assignRefusal, assignableLzs, bestSwap, surveySwap, knownBad,
} from '@systems/survey-model';
import { armShipSlices } from '../support/residents';
import { withSurveyBuilt } from '../support/survey';
import { giveSkillFile } from '../support/skills';
import { SURVEY_CELLS } from '@data/tuning';

const DEG = Math.PI / 180;
const throws = (run: () => unknown): boolean => { try { run(); return false; } catch { return true; } };
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-12;

// --- sweptCells ----------------------------------------------------------------------------------------------------------
{
  // A still ship at 1° with ±20°: the cells whose centre is within 20° of it, both sides of 0.
  const still = sweptCells(1 * DEG, 1 * DEG, 1, 20 * DEG);
  check('a still ship maps the cells whose centre is within ±20° of it, across 0 (8 cells)', still.join() === '0,1,2,3,68,69,70,71', still.join(','));
  const ccw = sweptCells(10 * DEG, 50 * DEG, 1, 20 * DEG);
  const cw = sweptCells(50 * DEG, 10 * DEG, -1, 20 * DEG);
  check('CCW from 10° to 50° and CW from 50° to 10° sweep the same cells (−10°..70°)',
    ccw.join() === cw.join() && ccw.join() === '0,1,2,3,4,5,6,7,8,9,10,11,12,13,70,71', ccw.join(','));
  const wrong = sweptCells(50 * DEG, 10 * DEG, 1, 20 * DEG);
  check('…but CCW from 50° to 10° goes the long way round (320° + the swath: every cell)', wrong.length === SURVEY_CELLS);
  const wrap = sweptCells(350 * DEG, 10 * DEG, 1, 0);
  check('a wrap through 0 (350° → 10°, no swath) maps the cells either side of 0 only', wrap.join() === '0,1,70,71', wrap.join(','));
  check('a full turn (a step of a period or more: a long SKIP) maps every cell, whatever the two angles',
    sweptCells(1, 1, 1, 0, true).length === SURVEY_CELLS && sweptCells(1, 1.01, -1, 0, true).length === SURVEY_CELLS);
  const v1 = sweptCells(180 * DEG, 180 * DEG, 1, swathHalfRad(1)).length;
  const v3 = sweptCells(180 * DEG, 180 * DEG, 1, swathHalfRad(3)).length;
  check(`±40° maps twice the cells of ±20° (${v3} against ${v1})`, v1 === 8 && v3 === 16);
  check('cellOf: 0 at 0 rad, 71 just under 2π, negatives wrap', cellOf(0) === 0 && cellOf(2 * Math.PI - 1e-9) === 71 && cellOf(-1 * DEG) === 71 && cellOf(7 * DEG) === 1);
  check('a negative swath throws', throws(() => sweptCells(0, 0, 1, -1)));
}

// --- siteStars, swathHalfRad -----------------------------------------------------------------------------------------------
check('siteStars (R11): 3 FLAT wide or standard, 2 FLAT narrow, 1 ROCKY or WET, 0 a wreck',
  siteStars({ kind: 'candidate', ground: 'flat', width: 'standard' }) === 3 && siteStars({ kind: 'guess', ground: 'flat', width: 'narrow' }) === 2
  && siteStars({ kind: 'candidate', ground: 'wet', width: 'wide' }) === 1 && siteStars({ kind: 'wreck', ground: 'rocky', width: 'standard' }) === 0);
check('swathHalfRad: 0, then ±20° at v1 and v2, ±40° at v3', swathHalfRad(0) === 0 && near(swathHalfRad(1), 20 * DEG) && near(swathHalfRad(2), 20 * DEG) && near(swathHalfRad(3), 40 * DEG));

// --- A POOR CORMORANT, hand-built ----------------------------------------------------------------------------------------
const SEED = 7;
const CORMORANT = 15;
function cormorant(version: 0 | 1 | 2 | 3): ReturnType<typeof createStore<GameState>> {
  return withSurveyBuilt(() => {
    const { run, slices } = armShipSlices(SEED, CORMORANT);
    const state = { ...createInitialState({ seed: SEED }), run: { ...run, arrival: null, phase: 'flight' }, ...slices } as GameState;
    state.burn.status = 'approaching';
    state.clock.paused = false;
    const store = createStore<GameState>(state);
    if (version > 0) giveSkillFile(store, 'survey', version as 1 | 2 | 3);
    return store;
  });
}

withSurveyBuilt(() => {
  // CORMORANT (plan's foundation deviations): LZ-A on guess-A (5 pods, STANDARD FLAT), LZ-B on guess-B (4 pods, WIDE ROCKY);
  // SITE 1 NARROW FLAT ROOM 5, SITE 2 STANDARD FLAT ROOM 5, SITE 3 NARROW WET ROOM 4, SITE 4 a wreck, SITE 5 WIDE FLAT ROOM 6.
  const store = cormorant(1);
  const s = (): Readonly<GameState> => store.getState();
  const sites = s().landing.survey.sites;
  const id = (number: number): string => sites.find((site) => site.kind !== 'guess' && site.number === number)!.id;
  check('CORMORANT as the roll builds it: LZ-B ROCKY on its guess, SITE 4 a wreck, SITE 5 WIDE FLAT ROOM 6',
    s().landing.lzs.map((lz) => `${lz.label}:${lz.site}:${lz.ground}:${lz.pods}`).join() === 'LZ-A:guess-A:flat:5,LZ-B:guess-B:rocky:4'
    && sites.find((site) => site.id === id(4))!.kind === 'wreck' && sites.find((site) => site.id === id(5))!.width === 'wide');

  // surveyRunning
  check('surveyRunning: waiting at v1 in flight with no thread claimed, running once claimed', surveyRunning(s()) === 'waiting'
    && (store.update((d) => { d.landing.survey.claimed = true; }), surveyRunning(s()) === 'running'));
  store.update((d) => { d.landing.survey.paused = true; });
  check('…paused by the kid\'s PAUSE', surveyRunning(s()) === 'paused');
  store.update((d) => { d.landing.survey.paused = false; d.clock.paused = true; });
  check('…off while the clock is paused', surveyRunning(s()) === 'off');
  store.update((d) => { d.clock.paused = false; d.run.phase = 'desk'; });
  check('…off outside a flight or a landing', surveyRunning(s()) === 'off');
  store.update((d) => { d.run.phase = 'landing'; d.burn.status = 'locked'; d.landing.ended = 'end-landing'; });
  check('…off once the landing has ended', surveyRunning(s()) === 'off');
  store.update((d) => { d.landing.ended = null; d.landing.survey.mapped = d.landing.survey.mapped.map(() => true); });
  check('…done when every cell is mapped (mappedPct 100)', surveyRunning(s()) === 'done' && mappedPct(s().landing.survey) === 100);
  store.update((d) => { d.landing.survey.mapped = d.landing.survey.mapped.map((_, i) => i < 18); d.run.phase = 'flight'; d.burn.status = 'approaching'; });
  check('…mappedPct 25 on 18 cells of 72', mappedPct(s().landing.survey) === 25);
  check('…off with no SURVEY aboard, and at v3 running with no thread', surveyRunning(cormorant(0).getState()) === 'off'
    && surveyRunning(cormorant(3).getState()) === 'running');

  // assignRefusal
  const refuse = (lz: string, site: string): string => String(assignRefusal(s(), lz, site));
  check('closed with no SURVEY aboard', assignRefusal(cormorant(0).getState(), 'LZ-B', id(5)) === 'closed');
  check('not-found before the site is mapped; a guess is never not-found', refuse('LZ-B', id(5)) === 'not-found' && refuse('LZ-A', 'guess-B') !== 'not-found');
  store.update((d) => { for (const site of d.landing.survey.sites) site.found = true; });
  check('wreck, same, too-small (SITE 3 holds 4 pods, LZ-A needs 5), taken (LZ-B onto LZ-A\'s guess)',
    [refuse('LZ-B', id(4)), refuse('LZ-B', 'guess-B'), refuse('LZ-A', id(3)), refuse('LZ-B', 'guess-A')].join() === 'wreck,same,too-small,taken',
    [refuse('LZ-B', id(4)), refuse('LZ-B', 'guess-B'), refuse('LZ-A', id(3)), refuse('LZ-B', 'guess-A')].join());
  check('a found site with room is free: LZ-B onto SITE 5', assignRefusal(s(), 'LZ-B', id(5)) === null);
  store.update((d) => { d.landing.goLow = { lz: 'LZ-B', launchRad: 0, burnRad: Math.PI, targetRadiusKm: 1, floorKm: 1, held: true }; });
  check('window-open while GO LOWER holds an aim for the LZ (review m5), not for another LZ', refuse('LZ-B', id(5)) === 'window-open' && refuse('LZ-A', id(5)) === 'null');
  store.update((d) => { d.landing.goLow = null; d.landing.window = { lz: 'LZ-B', sure: false }; });
  check('window-open while its window is open', refuse('LZ-B', id(5)) === 'window-open');
  store.update((d) => { d.landing.window = null; });
  const launch = (lz: string | null, landingRad: number): LaunchRecord => ({
    atTSec: 0, atAi: 0, source: 'player', launchRadius: 1, dotRad: landingRad, halfWidthKm: 1, aimLz: lz, landingRad, predictedTouch: 'soft',
    driverIntegrity: 100, arc: [], descentSec: 3.5, firstOfRun: false,
  });
  const lzB = s().landing.lzs.find((lz) => lz.label === 'LZ-B')!;
  store.update((d) => { d.run.phase = 'landing'; d.burn.status = 'locked'; d.landing.pods[0]!.fate = { kind: 'falling', launch: launch('LZ-B', lzB.centreRad) }; });
  check('falling while a pod falls to it', refuse('LZ-B', id(5)) === 'falling');
  store.update((d) => {
    d.landing.pods[0]!.fate = { kind: 'down', launch: launch('LZ-B', lzB.centreRad), touchdown: { place: 'lz', lz: 'LZ-B', points: 1, missKm: null, touch: 'hard', atAi: 0 } };
  });
  check('pods-down once a pod is down in it (01: an LZ can\'t move once a pod has landed in it)', refuse('LZ-B', id(5)) === 'pods-down');
  store.update((d) => { d.landing.ended = 'end-landing'; });
  check('landing-over once the landing has ended', refuse('LZ-B', id(5)) === 'landing-over');
  store.update((d) => { d.landing.ended = null; d.landing.pods[0]!.fate = { kind: 'aboard' }; d.run.phase = 'flight'; d.burn.status = 'approaching'; });
  check('assignableLzs: every LZ in label order with its refusal', JSON.stringify(assignableLzs(s(), id(5))) === '[{"lz":"LZ-A","refusal":null},{"lz":"LZ-B","refusal":null}]'
    && JSON.stringify(assignableLzs(s(), id(3))) === '[{"lz":"LZ-A","refusal":"too-small"},{"lz":"LZ-B","refusal":null}]');
  check('an unknown LZ or site throws', throws(() => assignRefusal(s(), 'LZ-Q', id(5))) && throws(() => assignRefusal(s(), 'LZ-B', 'site-99')));

  // bestSwap
  check('bestSwap: none while LZ-B\'s ground is not known', bestSwap(s(), 'LZ-B') === null && !knownBad(s(), 'LZ-B'));
  store.update((d) => { for (const site of d.landing.survey.sites) site.groundKnown = true; });
  check('…known ROCKY: the widest found FLAT site with ROOM, SITE 5 (WIDE, ROOM 6), never a FLAT guess another LZ holds',
    knownBad(s(), 'LZ-B') && bestSwap(s(), 'LZ-B') === id(5) && bestSwap(s(), 'LZ-A') === null);
  store.update((d) => { d.landing.survey.sites.find((site) => site.id === id(5))!.found = false; });
  check('…then SITE 2 (STANDARD, ROOM 5) when SITE 5 is not found', bestSwap(s(), 'LZ-B') === id(2));
  check('surveySwap names the LZ and the site, and nothing while a window is open',
    surveySwap(s())?.lz === 'LZ-B' && surveySwap(s())?.site.id === id(2)
    && (store.update((d) => { d.landing.window = { lz: 'LZ-A', sure: true }; }), surveySwap(s()) === null));
});

finish();
