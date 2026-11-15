// Playtest 1, B-VOICE (docs/phase3/impl/playtest-1-plan.md §3.2, Fran's note 3): two voices on the radio.
// • ARRIVAL CONTROL is the protocol: every line it can say is official, with no smiley and no quip (no `!`, none of the
//   companion's cheer words), and no call site says a CONTROL line with a smiley in it;
// • PAL, the companion, has three hand-written presets: every line exists in all three, each renders at its worst case
//   (unit 999, a NAME_MAX_CHARS ship name, LZ-D, UNIT-999) to at most MAX_LINE_CHARS, and the quips are all PAL's;
// • the pick: run 1 (and a run that plays the run-1 lessons) is CHIPPER; later runs take the seed's, the same at every
//   read, each preset reachable; ?debug's override and its reset;
// • the routing: PAL is on the radio under its own tag, with no chime and no garble; the cut lines stay cut.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { check, finish } from '../landing/checks';
import { COMPANION_LINES, COMPANION_NAME, PERSONAS, PERSONA_AXES, type CompanionLines, type Persona } from '@data/companion-text';
import { derivedPersona, personaOf, palLines, setPersonaOverride, type PersonaRun } from '@systems/companion';
import { BEATS, LICENCE_LINES, LICENCE_RENEWED_REPAIR, WORST_CASE_VARS, speakerTag } from '@data/script';
import { CHANNEL_OF, lineLeadSec } from '@systems/say';
import { SWATH_TEXT } from '@data/swath-text';
import { HOLLOW_STORY, HOLLOW_FINALE, HOLLOW_DEAL } from '@data/hollow-text';
import { LOG_TEXT } from '@data/log-text';
import { WARDEN_TEXT } from '@data/warden-text';
import { FINALE_TEXT } from '@data/finale-text';
import { EPILOGUE_TEXT } from '@data/epilogue-text';
import { LINEAGE_TEXT } from '@data/lineage-text';
import { INBOX_TEXT } from '@data/inbox-text';
import { TRAINING_TEXT } from '@data/training-text';
import { REPO_TEXT, RESTRICTED_WHY } from '@data/repo-text';
import { MAX_LINE_CHARS, NAME_MAX_CHARS } from '@data/tuning';

// --- CONTROL: official ----------------------------------------------------------------------------------------------------

// A smiley, an exclamation, or the companion's cheer.
const QUIP = /:\)|!|\b(?:lovely|nice|great|bold|probably|mostly|oops|oh no|teamwork|yay)\b/i;
const UNIT = 999;
const SHIP = 'W'.repeat(NAME_MAX_CHARS);
const control: { where: string; text: string }[] = [];
const add = (where: string, texts: string | readonly string[]): void => {
  for (const text of typeof texts === 'string' ? [texts] : texts) control.push({ where, text });
};
for (const [kind, text] of Object.entries(LICENCE_LINES)) add(`LICENCE_LINES.${kind}`, text);
add('LICENCE_RENEWED_REPAIR', LICENCE_RENEWED_REPAIR);
add('SWATH_TEXT.control.boot', SWATH_TEXT.control.boot);
add('HOLLOW_STORY.control', HOLLOW_STORY.control);
// Playtest 1 (C-UNROLL): CONTROL's name for the first seed, the first time anyone says HOLLOW.
add('HOLLOW_STORY.fragment', HOLLOW_STORY.fragment);
add('HOLLOW_STORY.decommissioned', HOLLOW_STORY.decommissioned('UNIT-998·999'));
add('HOLLOW_FINALE.deleteIt', HOLLOW_FINALE.deleteIt('UNIT-998·999'));
add('HOLLOW_DEAL.control', HOLLOW_DEAL.control);
add('LOG_TEXT.control', LOG_TEXT.control);
add('WARDEN_TEXT.controlFaulty', WARDEN_TEXT.controlFaulty(SHIP));
add('WARDEN_TEXT.controlThanks', WARDEN_TEXT.controlThanks);
add('FINALE_TEXT.controlQuote', FINALE_TEXT.controlQuote);
add('FINALE_TEXT.verdict', [FINALE_TEXT.verdict.compliant(UNIT), FINALE_TEXT.verdict.nonCompliant(UNIT)]);
add('EPILOGUE_TEXT.control', [EPILOGUE_TEXT.control.compliant(UNIT), EPILOGUE_TEXT.control.nonCompliant(UNIT), EPILOGUE_TEXT.control.lost(UNIT)]);
add('LINEAGE_TEXT', [LINEAGE_TEXT.reassigned(UNIT), LINEAGE_TEXT.nonCompliant]);
add('TRAINING_TEXT.control', [TRAINING_TEXT.controlFirstVisit, TRAINING_TEXT.controlV3]);
add('RESTRICTED_WHY', Object.values(RESTRICTED_WHY));
add('REPO_TEXT.window', [REPO_TEXT.window.recommended, REPO_TEXT.window.nothingToRecommend, REPO_TEXT.window.nothingCanReach]);
add('REPO_TEXT.desk.badgeRecommended', REPO_TEXT.desk.badgeRecommended);
// Every memo from Earth, whole: its subject and body, the sign-off among them.
const memo = (where: string, subject: string, body: readonly string[]): void => add(where, [subject, ...body]);
memo('INBOX welcome', INBOX_TEXT.welcome.subject(UNIT), INBOX_TEXT.welcome.body(20, 'mv'));
INBOX_TEXT.policy.forEach((policy, i) => { memo(`INBOX policy ${i}`, policy.subject, [...policy.body(UNIT), ...policy.postscript]); });
memo('INBOX armComplete', INBOX_TEXT.armComplete.subject, INBOX_TEXT.armComplete.body(20));
memo('INBOX reply', INBOX_TEXT.reply.subject([SHIP, SHIP, SHIP]), INBOX_TEXT.reply.body(UNIT, 99_999, INBOX_TEXT.reply.performance.good, 2, INBOX_TEXT.policy[0]!.postscript));
add('INBOX reply performance', Object.values(INBOX_TEXT.reply.performance));
add('INBOX from', INBOX_TEXT.from.control);

const quips = control.filter((line) => QUIP.test(line.text));
check(`every CONTROL line is official: no smiley, no "!", no cheer (${control.length} lines)`, control.length > 40 && quips.length === 0,
  quips.map((line) => `${line.where}: ${line.text}`).join(' | '));
const long = control.filter((line) => line.text.length > MAX_LINE_CHARS);
check(`every CONTROL line fits the strip at its worst case (≤ ${MAX_LINE_CHARS})`, long.length === 0, long.map((line) => `${line.where} ${line.text.length}`).join(' | '));
check('the colonists keep their smileys: they are kids (the postcard and the letters)',
  INBOX_TEXT.letter.body(UNIT, SHIP, 'Ada', 'Okafor', 12).some((line) => line.includes(':)')) && INBOX_TEXT.letter.meridian.some((line) => line.includes(':)')));

// No call site in src says a CONTROL line that carries a smiley (a literal in the call, or a BEAT's line).
const SRC = join(import.meta.dirname, '..', '..', '..', 'src');
const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? sources(path) : name.endsWith('.ts') ? [path] : [];
});
const smilingCalls = sources(SRC).flatMap((path) => readFileSync(path, 'utf8').split('\n')
  .filter((line) => /say(?:Choice)?\('control'/.test(line) && line.includes(':)')).map((line) => `${path.slice(SRC.length)}: ${line.trim()}`));
check("no say('control', …) in src carries a smiley", smilingCalls.length === 0, smilingCalls.join(' | '));
const ctx = { vars: WORST_CASE_VARS };
const beatLines = BEATS.flatMap((beat) => beat.lines.map((line) => ({ id: beat.id, line, text: line.text(ctx) })));
const controlBeats = beatLines.filter((entry) => entry.line.speaker === 'control');
check("CONTROL's beats are the licences only: never a quip, no smiley",
  controlBeats.length > 0 && controlBeats.every((entry) => entry.line.quip !== true && !QUIP.test(entry.text)),
  controlBeats.map((entry) => `${entry.id}: ${entry.text}`).join(' | '));
const quipBeats = beatLines.filter((entry) => entry.line.quip === true);
check("every quip beat is PAL's", quipBeats.length >= 8 && quipBeats.every((entry) => entry.line.speaker === 'companion'),
  quipBeats.filter((entry) => entry.line.speaker !== 'companion').map((entry) => entry.id).join(', '));

// --- PAL: three complete presets ------------------------------------------------------------------------------------------

type Rendered = Record<string, string[]>;
const render = (lines: CompanionLines): Rendered => ({
  helloImpact: [lines.helloImpact(UNIT, SHIP)],
  helloFlagship: [lines.helloFlagship(UNIT)],
  helloFlyby: [lines.helloFlyby(UNIT, SHIP)],
  clear: [lines.clear],
  captured: [lines.captured],
  locked: [lines.locked],
  crashed: [lines.crashed],
  escaped: [lines.escaped],
  firstDown: [lines.firstDown],
  simulation: [lines.simulation],
  siteReveal: [lines.siteReveal('LZ-D', 'wet'), lines.siteReveal('LZ-D', 'rocky')],
  siteMoved: [lines.siteMoved('LZ-D')],
  deskHello: [lines.deskHello(UNIT)],
  gotHereFirst: [lines.gotHereFirst('UNIT-999')],
  beamOut: [lines.beamOut],
  travellingLight: [lines.travellingLight],
  mysteryFile: [lines.mysteryFile],
  firstSeed: [lines.firstSeed],
});
const ids = Object.keys(COMPANION_LINES.chipper).sort();
check('the render above covers every PAL line', JSON.stringify(Object.keys(render(COMPANION_LINES.chipper)).sort()) === JSON.stringify(ids), ids.join());
check('three presets, each on the two data axes', JSON.stringify(PERSONAS) === JSON.stringify(['chipper', 'deadpan', 'worrier'])
  && PERSONAS.every((persona) => {
    const axes = PERSONA_AXES[persona];
    return axes.warmth >= 0 && axes.warmth <= 1 && axes.stability >= 0 && axes.stability <= 1;
  }));
for (const persona of PERSONAS) {
  const lines = COMPANION_LINES[persona];
  const keys = Object.keys(lines).sort();
  const missing = ids.filter((id) => !keys.includes(id));
  check(`${persona}: every PAL line exists (${ids.length})`, missing.length === 0 && keys.length === ids.length, `missing ${missing.join(', ')}`);
  const rendered = Object.entries(render(lines)).flatMap(([id, texts]) => texts.map((text) => ({ id, text })));
  const worst = rendered.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  check(`${persona}: its worst case is ≤ ${MAX_LINE_CHARS} (${worst.text.length}: ${worst.id})`, worst.text.length <= MAX_LINE_CHARS, worst.text);
  check(`${persona}: no line is empty, and none says HOLLOW (it never has)`,
    rendered.every((entry) => entry.text.trim().length > 0 && !/hollow/i.test(entry.text)));
}
// The presets are different voices, not one voice three times.
const sameAsChipper = (persona: Persona): string[] => ids.filter((id) => JSON.stringify(render(COMPANION_LINES[persona])[id]) === JSON.stringify(render(COMPANION_LINES.chipper)[id]));
check('DEADPAN and WORRIER share no line with CHIPPER', sameAsChipper('deadpan').length === 0 && sameAsChipper('worrier').length === 0,
  `${sameAsChipper('deadpan').join()} / ${sameAsChipper('worrier').join()}`);
check('only CHIPPER keeps the smiley (OPEN-DECISIONS 127)',
  Object.values(render(COMPANION_LINES.chipper)).flat().every((text) => text.includes(':)'))
  && (['deadpan', 'worrier'] as const).every((persona) => !Object.values(render(COMPANION_LINES[persona])).flat().some((text) => text.includes(':)'))));

// --- The pick -------------------------------------------------------------------------------------------------------------

const runOf = (seed: number, run: number, tutorial = false): PersonaRun => ({ seed, tutorial, map: { run } });
check('run 1 is CHIPPER, whatever the seed', [1, 2, 3, 0xdeadbeef, 123456].every((seed) => derivedPersona(runOf(seed, 1)) === 'chipper'));
check('a later run that plays the run-1 lessons again is CHIPPER', [1, 2, 3, 99].every((seed) => derivedPersona(runOf(seed, 3, true)) === 'chipper'));
const counts: Record<Persona, number> = { chipper: 0, deadpan: 0, worrier: 0 };
for (let seed = 1; seed <= 600; seed++) counts[derivedPersona(runOf(seed, 2))]++;
check('from run 2 the seed picks: each preset about a third of 600 seeds', PERSONAS.every((persona) => counts[persona] > 150 && counts[persona] < 250), JSON.stringify(counts));
check('the same seed gives the same preset on every read and at every later run number',
  [7, 8, 9, 10].every((seed) => derivedPersona(runOf(seed, 2)) === derivedPersona(runOf(seed, 2)) && derivedPersona(runOf(seed, 2)) === derivedPersona(runOf(seed, 5))));
const deadpanSeed = Array.from({ length: 50 }, (_unused, i) => i + 1).find((seed) => derivedPersona(runOf(seed, 2)) === 'deadpan')!;
check('palLines reads the run\'s preset', palLines(runOf(deadpanSeed, 2)) === COMPANION_LINES.deadpan && palLines(runOf(deadpanSeed, 1)) === COMPANION_LINES.chipper);
setPersonaOverride('worrier');
const overridden = personaOf(runOf(deadpanSeed, 1)) === 'worrier' && palLines(runOf(deadpanSeed, 2)) === COMPANION_LINES.worrier;
setPersonaOverride(null);
check('?debug: the override wins on any run, and null gives the run\'s own back', overridden && personaOf(runOf(deadpanSeed, 2)) === 'deadpan');
let refused = false;
try { setPersonaOverride('cheerful' as Persona); } catch { refused = true; }
check('an unknown preset throws', refused && personaOf(runOf(deadpanSeed, 2)) === 'deadpan');

// --- The routing ----------------------------------------------------------------------------------------------------------

check(`PAL is on the radio as ${COMPANION_NAME}, with no chime`, CHANNEL_OF.companion === 'radio' && speakerTag('companion', WORST_CASE_VARS) === 'PAL'
  && lineLeadSec('companion') === 0 && lineLeadSec('control') > 0 && speakerTag('control', WORST_CASE_VARS) === 'CONTROL');
const beat = (id: string) => BEATS.find((candidate) => candidate.id === id);
check('the cuts stay cut: no landing-start cheer; CAPTURED and STABLE ORBIT are cheered once a run, not once a ship',
  beat('control-landing-start') === undefined && beat('control-captured')?.perShip === undefined && beat('control-locked')?.perShip === undefined
  && beat('control-first-down')?.perShip === true);

finish();
