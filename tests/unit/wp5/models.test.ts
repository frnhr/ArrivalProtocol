// WP5, slice 1a: the words around the pods and the landing's phase rules, headless.
// • every SIM line of data/landing-text.ts (refusals, confirms, echoes, the host line, state words, the guidance rows,
//   asks, lessons, beats, the ground radio line, the driver tool refusals), the hurt-driver lesson (DRIVER_RULES), the
//   beats and every colonist intro fit the strip (≤ 70 characters, worst-case values) and avoid the §3.5 glossary's
//   "never say" words (01-landing §8: LAUNCH BAND is allowed, never "scatter", "deorbit", "insertion", IMPACT for a pod);
// • the echoes say `> launch pod03 ... LZ-A` and `> pod03 ... LANDED`, the host line `> HOST: ARES-VII · 3 PODS · 600 COLONISTS`;
// • the landing is a live phase (P pauses and resumes it), the LANDING REPORT is not; an instant landing puts all 600
//   colonists down in LZ-A; a ship lost on the approach leaves its pods NOT LAUNCHED.
// The guidance table's own checks (rows from crafted contexts) are tests/unit/landing/ (Track SIM).
import { check, finish } from '../wp1/harness';
import { createHarness5 } from './harness5';
import { DRIVER_RULES, BEATS, WORST_CASE_VARS } from '@data/script';
import {
  LAUNCH_REFUSAL_TEXT, LAUNCH_CONFIRM_TEXT, LANDING_ECHO, hostLine, POD_STATE_TEXT, PARK_REASON_TEXT, LANDING_LINES,
  LANDING_SKIP_REFUSAL, LANDING_ASKS, LANDING_LESSONS, LANDING_BEATS, groundRadioLine, DRIVER_TOOL_TEXT, COLONY_NAME_POOL,
  familyColonyName, podCode, driverName,
} from '@data/landing-text';
import { formatCount } from '@data/format';
import { TOOL_REFUSAL } from '@data/tool-text';
import { FAMILY_POOL, FIRST_NAME_POOL, LINE_POOL, FIRST_WORDS_POOL, ARES_RUN1_FAMILIES, colonistIntro } from '@data/souls';
import { setPaused, isLivePhase } from '@systems/clock';
import { colonistCounts } from '@state/selectors';
import { landingResult } from '@systems/landing-rules';
import { MAX_LINE_CHARS, NAME_MAX_CHARS } from '@data/tuning';
import { setLandingMode } from '../support/landing-instant';
import type { TextCtx } from '@systems/director';
import type { Place, Touch } from '@/types/landing';

// --- Lines ---------------------------------------------------------------------------------------------
const NEVER_SAY = [
  /tools mode/i, /memory mode/i, /periapsis/i, /apoapsis/i, /\buplink\b/i, /(?<!\b(?:LAUNCH|IN|OF) )\bband\b/i, /inserted/i,
  /BURN LEFT/, /Δv/, /redundancy/i, /\bRDN\b/, /\bcores\b/i, /\bmoat\b/i, /Fleet Office/i, /OKAFOR BLOCK/,
  /scatter/i, /deorbit/i, /insertion/i, /\bpods?\b.*\bimpact/i, /\bimpact\b.*\bpods?\b/i,
];
const rendered: { where: string; text: string }[] = [];
const add = (where: string, text: string): void => { rendered.push({ where, text }); };
const ctx: TextCtx = { vars: WORST_CASE_VARS };
const longFamily = 'W'.repeat(12);
const longShip = 'S'.repeat(NAME_MAX_CHARS);
for (const [key, text] of Object.entries(LAUNCH_REFUSAL_TEXT)) add(`LAUNCH_REFUSAL_TEXT.${key}`, text);
add('confirm off-site', LAUNCH_CONFIRM_TEXT.offSite('GRASSLAND', 99_999));
add('confirm full', LAUNCH_CONFIRM_TEXT.full('LZ-D', 99_999));
for (const pods of [0, 1, 16]) add(`confirm endLanding(${pods})`, LAUNCH_CONFIRM_TEXT.endLanding(pods));
add('echo launch', LANDING_ECHO.launch(16, 'LZ-D'));
add('echo launch off-site', LANDING_ECHO.launch(16, null));
for (const place of ['lz', 'mislanded', 'off-site', 'no-go'] as Place[]) {
  for (const touch of ['soft', 'hard'] as Touch[]) add(`echo touchdown ${place} ${touch}`, LANDING_ECHO.touchdown(16, place, 'LZ-D', touch));
}
add('echo parked', LANDING_ECHO.parked(16));
add('hostLine', hostLine(longShip, 16, 3200));
for (const [key, text] of Object.entries(POD_STATE_TEXT)) add(`POD_STATE_TEXT.${key}`, text);
for (const [key, text] of Object.entries(PARK_REASON_TEXT)) add(`PARK_REASON_TEXT.${key}`, text);
add('L0', LANDING_LINES.L0);
add('L1', LANDING_LINES.L1);
add('L3', LANDING_LINES.L3('LZ-D', 'LZ-A'));
add('L3 last', LANDING_LINES.L3('LZ-D', null));
add('L4', LANDING_LINES.L4('LZ-D', 16, 16));
add('L5', LANDING_LINES.L5);
add('L6', LANDING_LINES.L6(5999));
add('L7', LANDING_LINES.L7('LZ-D', 5999));
add('L11', LANDING_LINES.L11(16));
add('L12', LANDING_LINES.L12);
add('L12b', LANDING_LINES.L12b(16));
add('L13', LANDING_LINES.L13('LZ-D', 5999, true, true));
for (const [key, text] of Object.entries(LANDING_SKIP_REFUSAL)) add(`LANDING_SKIP_REFUSAL.${key}`, text);
add('ask hurtDriver', LANDING_ASKS.hurtDriver(16));
add('ask mindClear', LANDING_ASKS.mindClear('LZ-D'));
add('lesson dot', LANDING_LESSONS.dot);
add('lesson split', LANDING_LESSONS.split([{ lz: 'LZ-A', pods: 4 }, { lz: 'LZ-B', pods: 4 }, { lz: 'LZ-C', pods: 4 }, { lz: 'LZ-D', pods: 4 }]));
for (const [key, text] of Object.entries(LANDING_BEATS)) add(`LANDING_BEATS.${key}`, text);
for (const words of FIRST_WORDS_POOL) add('groundRadioLine', groundRadioLine(16, longFamily, words));
for (const [key, text] of Object.entries(DRIVER_TOOL_TEXT)) add(`DRIVER_TOOL_TEXT.${key}`, text);
for (const name of [...COLONY_NAME_POOL, familyColonyName(longFamily)]) add('colony name', name);
for (const rule of DRIVER_RULES) add(`rule ${rule.id}`, rule.text(ctx));
for (const beat of BEATS) beat.lines.forEach((line, i) => add(`beat ${beat.id}[${i}]`, line.text(ctx)));
for (const key of ['driverScan', 'driverDelete', 'driverCopy'] as const) add(`TOOL_REFUSAL.${key}`, TOOL_REFUSAL[key]);
for (const family of [...FAMILY_POOL, ...ARES_RUN1_FAMILIES]) {
  for (const first of FIRST_NAME_POOL) {
    for (const line of LINE_POOL) add('intro', colonistIntro({ name: `${family}, ${first}`, age: 88, line, firstWords: '' }));
  }
}
for (const words of FIRST_WORDS_POOL) add('first words', words);
const tooLong = rendered.filter(({ text }) => text.length > MAX_LINE_CHARS);
check(`every pod and landing line fits the strip (${rendered.length} rendered, worst cases)`, tooLong.length === 0,
  tooLong.slice(0, 3).map(({ where, text }) => `${where}: ${text.length} "${text}"`).join(' | '));
const glossary = rendered.filter(({ text }) => NEVER_SAY.some((pattern) => pattern.test(text)));
check('no pod or landing line uses a "never say" word', glossary.length === 0, glossary.slice(0, 3).map(({ where, text }) => `${where}: ${text}`).join(' | '));
check('the echoes: > launch pod03 ... LZ-A, > pod03 ... LANDED (· HARD), > pod03 ... PARKED IN ORBIT',
  LANDING_ECHO.launch(3, 'LZ-A') === '> launch pod03 ... LZ-A' && LANDING_ECHO.touchdown(3, 'lz', 'LZ-A', 'soft') === '> pod03 ... LANDED'
  && LANDING_ECHO.touchdown(3, 'lz', 'LZ-A', 'hard') === '> pod03 ... LANDED · HARD' && LANDING_ECHO.parked(3) === '> pod03 ... PARKED IN ORBIT');
check('the host line: > HOST: ARES-VII · 3 PODS · 600 COLONISTS', hostLine('ARES-VII', 3, 600) === '> HOST: ARES-VII · 3 PODS · 600 COLONISTS');
check('pod words: POD 03, POD 03 · OKAFOR', podCode(3) === 'POD 03' && driverName(3, 'Okafor') === 'POD 03 · OKAFOR');
check('formatCount', formatCount(2400) === '2,400');

// --- The landing's phase rules ----------------------------------------------------------------------------
const h = createHarness5(1);
{
  h.resetTo('flight');
  h.noFault();
  const s = () => h.store.getState();
  setLandingModeManual();
  h.startLanding(1);
  h.step();
  check('the lock starts the landing: phase landing, the clock live (P pauses and resumes it)', s().run.phase === 'landing'
    && isLivePhase(s()) && setPaused(h.store, true) && setPaused(h.store, false) && !s().clock.paused, s().run.phase);
  check('…every pod aboard, 600 colonists', colonistCounts(s()).aboard === 600 && colonistCounts(s()).down === 0);
  setLandingModeInstant();
  h.stepUntil(() => s().run.phase === 'report', 30);
  const counts = colonistCounts(s());
  check('an instant landing (forceLandAll) puts all 600 down in LZ-A, and the LANDING REPORT follows', s().run.phase === 'report'
    && counts.landedInLz === 600 && counts.aboard === 0 && s().landing.colony === 'RIVERSIDE', `${s().run.phase} ${JSON.stringify(counts)} ${s().landing.colony}`);
  check('the LANDING REPORT is not live: a pause there cannot be resumed', !isLivePhase(s()) && setPaused(h.store, true) && !setPaused(h.store, false));
}
{
  h.resetTo('flight');
  h.noFault();
  h.stepUntil(() => h.status() !== 'approaching', 400);
  h.step();
  // The ship result folds the pods still aboard by the outcome (run.ts records it; this harness has no run mounted).
  const tally = landingResult(h.store.getState(), 'crashed');
  check('a ship lost on the approach: its 600 colonists were NOT LAUNCHED, none parked', h.status() === 'crashed' && tally.notLaunched === 600
    && tally.parked.length === 0 && tally.landedInLz === 0, `${h.status()} notLaunched ${tally.notLaunched}`);
}

finish();

function setLandingModeManual(): void { setLandingMode('manual'); }
function setLandingModeInstant(): void { setLandingMode('instant'); }
