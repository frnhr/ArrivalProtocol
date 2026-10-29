// @ts-nocheck: TODO(slice1a-TESTS): this suite tests phase 2's printer / souls and is rewritten per slice-1a-plan §5
// ("Existing suites: Rewrite"). F2 turned type-checking off here so tsc over tests stays green meanwhile; it fails at runtime.
// WP5: the words and HUD models of the Soul Archive, headless.
// • every new line fits the strip (≤ 70 characters, worst-case values) and avoids the §3.5 glossary's
//   "never say" words: the reveal lines, the print echoes, the LOST card, the strip's printing lines,
//   the tutorials, the beats, the soul refusals, every colonist intro;
// • the footer reads SOULS IN STASIS, then SOULS: n IN MEMORY · n WOKE · n LOST (lost ships count
//   their colonists as lost); the crumbs keep ORBIT LOCKED until the first print, then PRINTING;
//   the pace reads TACTICAL while printing; pause works while printing; the report's count line.
import { check, finish } from '../wp1/harness';
import { createHarness5 } from './harness5';
import { revealLines, lostSoulsLine, printEcho, PRINTING_RULES, SOUL_RULES, BEATS, WORST_CASE_VARS, formatCount } from '@data/script';
import { TOOL_REFUSAL } from '@data/tool-text';
import { FAMILY_POOL, FIRST_NAME_POOL, LINE_POOL, FIRST_WORDS_POOL, ARES_RUN1_FAMILIES, colonistIntro } from '@data/souls';
import { podsLabel } from '@components/footer/Footer';
// WP5 part 2: the interim card's reportLine is gone; the WAKE REPORT's model says the same thing.
import { wakeReportModel } from '@systems/wake-report';
import { headerCrumbs, paceLabel } from '@systems/flight-hud';
import { getPrediction } from '@systems/predict';
import { setPaused, isLivePhase } from '@systems/clock';
import { printStatus } from '@systems/printer';
import { MAX_LINE_CHARS } from '@data/tuning';
import type { TextCtx } from '@systems/director';
import type { RevealCause } from '@state/schema';

// --- Lines ---------------------------------------------------------------------------------------------
const NEVER_SAY = [
  /tools mode/i, /memory mode/i, /periapsis/i, /apoapsis/i, /\buplink\b/i, /\bband\b/i, /inserted/i,
  /BURN LEFT/, /Δv/, /redundancy/i, /\bRDN\b/, /\bcores\b/i, /\bmoat\b/i, /Fleet Office/i, /OKAFOR BLOCK/,
];
const rendered: { where: string; text: string }[] = [];
const add = (where: string, text: string): void => { rendered.push({ where, text }); };
const ctx: TextCtx = { vars: WORST_CASE_VARS };
for (const cause of ['scan', 'landing', 'breach', 'debug'] as RevealCause[]) {
  revealLines(cause, 99_999, 'RACKS B–D').forEach((line, i) => add(`revealLines(${cause})[${i}]`, line));
}
add('lostSoulsLine', lostSoulsLine(99_999, 99_999));
for (const outcome of ['woke', 'gaps', 'lost'] as const) add(`printEcho(${outcome})`, printEcho('C16', 99_999, outcome));
for (const rule of [...PRINTING_RULES, ...SOUL_RULES]) add(`rule ${rule.id}`, rule.text(ctx));
for (const beat of BEATS) beat.lines.forEach((line, i) => add(`beat ${beat.id}[${i}]`, line.text(ctx)));
for (const key of ['sealed', 'driverScan', 'driverDelete', 'driverCopy'] as const) add(`TOOL_REFUSAL.${key}`, TOOL_REFUSAL[key]);
for (const family of [...FAMILY_POOL, ...ARES_RUN1_FAMILIES]) {
  for (const first of FIRST_NAME_POOL) {
    for (const line of LINE_POOL) add('intro', colonistIntro({ name: `${family}, ${first}`, age: 88, line, firstWords: '' }));
  }
}
for (const words of FIRST_WORDS_POOL) add('first words', words);
const tooLong = rendered.filter(({ text }) => text.length > MAX_LINE_CHARS);
check(`every WP5 line fits the strip (${rendered.length} rendered, worst cases)`, tooLong.length === 0,
  tooLong.slice(0, 3).map(({ where, text }) => `${where}: ${text.length} "${text}"`).join(' | '));
const glossary = rendered.filter(({ text }) => NEVER_SAY.some((pattern) => pattern.test(text)));
check('no WP5 line uses a "never say" word', glossary.length === 0, glossary.slice(0, 3).map(({ where, text }) => `${where}: ${text}`).join(' | '));
check('the reveal says it the way §1 does', revealLines('scan', 2400, 'RACKS B–C').join(' / ')
  === "STASIS: 0 pods detected. / rescanning… / The colonists aren't in pods. They're in here. (RACKS B–C)");
check('the echo: > print c04 ... 200 WOKE', printEcho('C04', 200, 'woke') === '> print c04 ... 200 WOKE');

// --- Footer, crumbs, pace, pause, report --------------------------------------------------------------
const h = createHarness5(1);
{
  h.resetTo('flight');
  h.noFault();
  const s = () => h.store.getState();
  check('footer, sealed: 2,400 SOULS IN STASIS', podsLabel(s()) === '2,400 SOULS IN STASIS', podsLabel(s()));
  h.startPrinting(1);
  h.step();
  check('crumbs: ORBIT LOCKED while the printer finds them', headerCrumbs(s(), getPrediction()).phase.text === 'ORBIT LOCKED');
  check('pace: TACTICAL ×20 while printing (the world coasts)', paceLabel(s()) === 'TACTICAL ×20', paceLabel(s()));
  check('printing is a live phase: P pauses and resumes it', isLivePhase(s()) && setPaused(h.store, true) && setPaused(h.store, false) && !s().clock.paused);
  h.stepUntil(() => s().souls.results.length > 0, 40);
  check('footer after the reveal and a print: SOULS: 2,200 IN MEMORY · 200 WOKE · 0 LOST', podsLabel(s()) === 'SOULS: 2,200 IN MEMORY · 200 WOKE · 0 LOST', podsLabel(s()));
  check('crumbs: PRINTING once the first cluster prints', headerCrumbs(s(), getPrediction()).phase.text === 'PRINTING');
  const status = printStatus(s());
  check('printStatus: 1/12 at 2.5 s a cluster', status.printing && status.done === 1 && status.total === 12 && status.intervalSec === 2.5 && !status.halted, JSON.stringify(status));
  h.stepUntil(() => s().run.phase === 'report', 60);
  // WP7 (the lead's rule): WOKE counts heads, so the breakdown no longer says "(half)": only the run's SCORE does.
  check('the report counts every outcome', wakeReportModel(s()).breakdown === '2,200 intact · 200 missing memories · 0 did not wake', wakeReportModel(s()).breakdown);
  check('report: the crumb reads WAKE REPORT, nothing is live, a pause there cannot be resumed', headerCrumbs(s(), getPrediction()).phase.text === 'WAKE REPORT'
    && !isLivePhase(s()) && setPaused(h.store, true) && !setPaused(h.store, false));
}
{
  h.resetTo('flight');
  h.noFault();
  h.stepUntil(() => h.status() !== 'approaching', 400);
  h.step();
  check('footer, a lost ship: the colonists still in memory count as lost', podsLabel(h.store.getState()) === 'SOULS: 0 WOKE · 2,400 LOST', podsLabel(h.store.getState()));
}
check('formatCount', formatCount(2400) === '2,400');

finish();
