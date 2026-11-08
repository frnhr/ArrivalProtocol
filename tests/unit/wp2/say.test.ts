// WP2 acceptance 5: every line and template in script.ts, rendered with worst-case placeholders
// (unit 999, 12-character names, the longest ECC line), fits the strip (≤ MAX_LINE_CHARS), and a
// 71-character line throws. Also checks the §3.5 glossary's "never say" words and the stamp rules.
import { check, finish } from '../wp1/harness';
import { createHarness2 } from './harness2';
// WP8: say.ts hollowName(ourUnit, named) became hollowLabel(run) (HOLLOW's units come from the archive's lineage).
import { say, sayChoice, assertLineFits, unitName, hollowLabel } from '@systems/say';
import {
  LINES, REFUSAL_LINES, BEATS, GUIDE_RULES, STAMP_TEXT, WORST_CASE_VARS, eccLine, speakerTag,
  type DamagedFile, type LineVars,
} from '@data/script';
import type { TextCtx } from '@systems/director';
import type { Speaker } from '@state/schema';
import { MAX_LINE_CHARS, NAME_MAX_CHARS } from '@data/tuning';
import { createRunMap } from '@systems/map-run';
import { createInitialState } from '@state/initial';

const ctx: TextCtx = { vars: WORST_CASE_VARS };
const rendered: { where: string; text: string }[] = [];
const add = (where: string, text: string): void => { rendered.push({ where, text }); };

// Standalone lines (every LINES entry; the ones that take vars get the worst case).
for (const [name, template] of Object.entries(LINES)) {
  add(`LINES.${name}`, (template as (vars: LineVars) => string)(WORST_CASE_VARS));
}
for (const [reason, refusal] of Object.entries(REFUSAL_LINES)) add(`REFUSAL_LINES[${reason}]`, refusal.text);
for (const beat of BEATS) beat.lines.forEach((line, i) => add(`BEATS.${beat.id}[${i}]`, line.text(ctx)));
for (const rule of GUIDE_RULES) add(`GUIDE_RULES.${rule.id}`, rule.text(ctx));
for (const [name, text] of Object.entries(STAMP_TEXT)) add(`STAMP_TEXT.${name}`, text);

// The ECC boot line: as many damaged files as fit, then +n. Worst case: every AI file damaged,
// each with a maximum-length name and a two-digit integrity.
const longName = 'W'.repeat(NAME_MAX_CHARS);
const manyFiles: DamagedFile[] = Array.from({ length: 12 }, (_unused, i) => ({ name: `${longName.slice(0, NAME_MAX_CHARS - 1)}${i % 10}`, integrity: 38.6 }));
for (let count = 0; count <= manyFiles.length; count++) add(`eccLine(${count} files)`, eccLine(manyFiles.slice(0, count)));
add('eccLine(one huge name)', eccLine([{ name: 'X'.repeat(80), integrity: 5 }]));

// The ticker and COMMS prefix a speaker tag; the tag itself is short.
const speakers: Speaker[] = ['control', 'sys', 'hollow', 'cmd', 'mind-sys'];
for (const speaker of speakers) add(`speakerTag(${speaker})`, speakerTag(speaker, WORST_CASE_VARS));

for (const { where, text } of rendered) {
  check(`fits: ${where}`, text.length <= MAX_LINE_CHARS, `${text.length} chars: ${text}`);
}

// The worst-case placeholders really are the worst case.
check('worst case: unit 999 renders as UNIT-999', unitName(WORST_CASE_VARS.unit) === 'UNIT-999');
check('worst case: the ship name is NAME_MAX_CHARS long', WORST_CASE_VARS.ship.length === NAME_MAX_CHARS);
const run1Names = createRunMap({ wave: 1 }, 1).arm.map((ship) => ship.name);
check('worst case: every real ship name fits NAME_MAX_CHARS (run 1\'s arm)', run1Names.every((name) => name.length <= NAME_MAX_CHARS), run1Names.join(', '));
check('worst case: HOLLOW named is longer than ???', WORST_CASE_VARS.hollow.length >= hollowLabel({ ...createInitialState({ seed: 1 }).run, hollowUnits: [998], hollowNamed: false }).length);

// §3.5: stamps are terse capitals without "!".
for (const [name, text] of Object.entries(STAMP_TEXT)) {
  check(`stamp ${name}: capitals, no "!"`, text === text.toUpperCase() && !text.includes('!'), text);
}

// §3.5 glossary: words a kid must never read. Slice 1a (01-landing §8): the glossary gains LAUNCH BAND (`IN BAND`,
// `OUT OF THE LAUNCH BAND`), so a bare "band" is still refused but those are not; and never "scatter", "deorbit",
// "insertion", or IMPACT for a pod.
const NEVER_SAY = [
  /tools mode/i, /memory mode/i, /periapsis/i, /apoapsis/i, /\buplink\b/i, /(?<!\b(?:LAUNCH|IN|OF) )\bband\b/i, /inserted/i,
  /BURN LEFT/, /Δv/, /redundancy/i, /\bRDN\b/, /\bcores\b/i, /\bmoat\b/i, /Fleet Office/i, /OKAFOR BLOCK/,
  /scatter/i, /deorbit/i, /insertion/i, /\bpods?\b.*\bimpact/i, /\bimpact\b.*\bpods?\b/i,
];
for (const { where, text } of rendered) {
  const hit = NEVER_SAY.find((pattern) => pattern.test(text));
  if (hit) check(`glossary: ${where}`, false, `"${text}" says ${hit}`);
}
check('glossary: no line uses a "never say" word', rendered.every(({ text }) => !NEVER_SAY.some((pattern) => pattern.test(text))));

// A 71-character line throws (dev builds and tests); 70 is fine.
const seventy = 'x'.repeat(MAX_LINE_CHARS);
const seventyOne = 'x'.repeat(MAX_LINE_CHARS + 1);
const throws = (run: () => unknown): boolean => { try { run(); return false; } catch { return true; } };
check('assert: 70 characters pass', !throws(() => assertLineFits(seventy)));
check('assert: 71 characters throw', throws(() => assertLineFits(seventyOne)));
const harness = createHarness2(1);
harness.resetTo('flight');
harness.step();
check('say: a 71-character line throws', throws(() => say('control', seventyOne)));
check('say: a 70-character line is spoken', say('control', seventy, { critical: true }) === 'spoken');
check('sayChoice: a 71-character line throws', throws(() => sayChoice('hollow', seventyOne, ['YES'], 5, () => {})));

finish();
