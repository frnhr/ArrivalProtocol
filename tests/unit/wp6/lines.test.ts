// WP6: every new HOLLOW line fits one strip row (≤ MAX_LINE_CHARS) with worst-case names, and avoids
// the §3.5 glossary's "never say" words: the alerts (the SKIP button and the mode toggle show them),
// the breach and story lines, the CORE LOST card, the tool refusals, PRINT FAST's refusal, and the
// director's HOLLOW rules (rendered with WORST_CASE_VARS, as tests/unit/wp2/say.test.ts does).
import { check, finish } from '../wp1/harness';
import { HOLLOW_ALERT_TEXT, HOLLOW_STORY, CORE_LOST_TEXT, UNNAMED_HOLLOW, HOLLOW_TYPE_LABEL } from '@data/hollow-text';
import { HOLLOW_RULES, PRINTING_RULES, GUIDE_RULES, WORST_CASE_VARS } from '@data/script';
import { TOOL_REFUSAL } from '@data/tool-text';
import { PRINT_FAST_INFECTED } from '@systems/printer';
import type { TextCtx } from '@systems/director';
import { MAX_LINE_CHARS, SEG_NAME_MAX_CHARS, FAMILY_MAX_CHARS } from '@data/tuning';

const longName = 'W'.repeat(SEG_NAME_MAX_CHARS);
const longFamily = 'W'.repeat(FAMILY_MAX_CHARS);
const ctx: TextCtx = { vars: WORST_CASE_VARS };
const lines: { where: string; text: string }[] = [
  { where: 'alert infected', text: HOLLOW_ALERT_TEXT.infected(longName) },
  { where: 'alert infected many', text: HOLLOW_ALERT_TEXT.infectedMany(99) },
  { where: 'alert eaten', text: HOLLOW_ALERT_TEXT.eaten('C16') },
  { where: 'alert core', text: HOLLOW_ALERT_TEXT.core },
  { where: 'breach', text: HOLLOW_STORY.breach('C16', longFamily) },
  { where: 'noticed', text: HOLLOW_STORY.noticed(999) },
  { where: 'control', text: HOLLOW_STORY.control },
  { where: 'core lost title', text: CORE_LOST_TEXT.title },
  // Final fix pass: the card has two subtitles, one for ships 1–4 (the run goes on) and one for OVERWRITTEN.
  { where: 'core lost sub (recoverable)', text: CORE_LOST_TEXT.subRecoverable },
  { where: 'core lost sub (overwritten)', text: CORE_LOST_TEXT.subOverwritten },
  { where: 'refusal infected', text: TOOL_REFUSAL.infected },
  { where: 'refusal eaten', text: TOOL_REFUSAL.eaten },
  { where: 'print fast refusal', text: PRINT_FAST_INFECTED },
  ...HOLLOW_RULES.map((rule) => ({ where: `rule ${rule.id}`, text: rule.text(ctx) })),
  ...PRINTING_RULES.map((rule) => ({ where: `rule ${rule.id}`, text: rule.text(ctx) })),
];
for (const { where, text } of lines) check(`fits: ${where}`, text.length <= MAX_LINE_CHARS, `${text.length}: ${text}`);

const NEVER_SAY = [
  /tools mode/i, /memory mode/i, /periapsis/i, /apoapsis/i, /\buplink\b/i, /\bband\b/i, /inserted/i,
  /BURN LEFT/, /Δv/, /redundancy/i, /\bRDN\b/, /\bcores\b/i, /\bmoat\b/i, /Fleet Office/i, /OKAFOR BLOCK/,
  // The design's name for the thing: a kid only ever reads ??? (and later its unit name).
  /\bHOLLOW\b/,
];
const said = lines.filter(({ text }) => NEVER_SAY.some((pattern) => pattern.test(text)));
check('no HOLLOW line uses a "never say" word (nor the design\'s name HOLLOW)', said.length === 0, said.map((line) => line.text).join(' | '));
// Final fix pass (final review): VESPER's COPY lesson said `HOLLOW IS HUNTING YOUR TOOLS` and slipped past this test,
// which read only HOLLOW_RULES and PRINTING_RULES. Every strip rule's text, rendered with the worst-case names, is read
// now: the enemy is `???` or its unit name on screen, never HOLLOW.
const stripSaysHollow = GUIDE_RULES.map((rule) => ({ id: rule.id, text: rule.text(ctx) })).filter(({ text }) => /\bHOLLOW\b/i.test(text));
check('no strip rule (GUIDE_RULES) says HOLLOW', stripSaysHollow.length === 0, stripSaysHollow.map((rule) => `${rule.id}: ${rule.text}`).join(' | '));
check('the unnamed name and the type label are what a kid reads', UNNAMED_HOLLOW === '???' && HOLLOW_TYPE_LABEL === 'Unauthorized process');
check('ship 1\'s line is the design\'s: `> ...047?`', HOLLOW_STORY.noticed(47) === '> ...047?');
check('the breach line is the design\'s: `SEALED BLOCK BREACHED · C12 · OKAFOR`', HOLLOW_STORY.breach('C12', 'Okafor') === '> SEALED BLOCK BREACHED · C12 · OKAFOR');

finish();
