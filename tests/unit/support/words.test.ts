// Guard (slice 1a): the landing design's never-say words, over every text module in src/data. Phase 2's colonists were
// "souls" in "clusters", woken by a printer; slice 1a's sleep in pods flown by drivers and land at LZs, and the words
// went with the design (docs/phase3/01-landing.md §3.10's decided state words, §6's glossary note). This reads every
// string a data module can put on screen (string and template literals, not comments, keys, ids, types or the text of
// a thrown error) and fails on a phase-2 word, or on a word the landing spec rules out:
// • colonists never wake (woke, wake, waking, awake): they land;
// • never "souls", "cluster", "printer" / "printing" / "print";
// • never "scatter", "deorbit" or "insertion";
// • never IMPACT for a pod (red IMPACT is the ship's crash), and a pod is never "lost", "offline" or "not recovered"
//   (§3.10: CAN'T LAUNCH, PARKED IN ORBIT · fate unknown, NOT LAUNCHED). A string is about a pod when it is in
//   landing-text.ts or names a pod, an LZ, a driver, a launch, a landing, the colonists or what HOLLOW ate; elsewhere those words are the ship's,
//   the charge's or a file's (CORE LOST, FLAGSHIP LOST, IMPACT on a crash course, ARCHIVE OFFLINE).
// Allowed uses are listed one by one in ALLOWED, each with its reason; an allowance nothing matches any more fails too,
// so the list can't rot. tests/unit/landing/table.test.ts keeps its own check over the landing table's lines.
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, finish } from '../landing/checks';
import { HOLLOW_DEAL, HOLLOW_ECHO, HOLLOW_FINALE, HOLLOW_HUD_TEXT } from '@data/hollow-text';
import { POD_STATE_TEXT, LANDING_LINES } from '@data/landing-text';
import { lineageLine, RUN_END_NOBODY_LANDED } from '@data/script';
import { scanFinding } from '@data/tool-text';
import { MAX_LINE_CHARS } from '@data/tuning';

const DATA = join(import.meta.dirname, '..', '..', '..', 'src', 'data');

interface Rule {
  id: string;
  re: RegExp;
  podOnly?: boolean;
}

const RULES: readonly Rule[] = [
  { id: 'wake', re: /\b(?:woke|woken|wake|wakes|waking|awake|awoke)\b/i },
  { id: 'souls', re: /\bsouls?\b/i },
  { id: 'cluster', re: /\bclusters?\b/i },
  { id: 'printer', re: /\bprint(?:er|ers|ing|ed|s)?\b/i },
  { id: 'scatter', re: /\bscatter/i },
  { id: 'deorbit', re: /\bde-?orbit/i },
  { id: 'insertion', re: /\binsertion\b/i },
  { id: 'impact', re: /\bimpact/i, podOnly: true },
  { id: 'lost', re: /\blost\b|\boffline\b|\bnot recovered\b/i, podOnly: true },
];

const POD_WORDS = /\b(?:pods?|lz(?:-[a-z])?|landing|landed|lands?|launch\w*|drivers?|colonists?|sleepers?|ate|eaten)\b/i;

interface Allowance {
  file: string;
  rule: string;
  text: RegExp;
  why: string;
}

const ALLOWED: readonly Allowance[] = [
  {
    file: 'zone-text.ts', rule: 'lost', text: /DRIVER LOST · CAN'T LAUNCH/,
    why: "a belt hit took a driver FILE to 0 (a file can be lost, like `AUTOBURN.skl LOST`); its pod's own state follows "
      + "in §3.10's decided word, CAN'T LAUNCH. Flagged for 05-story, which owns the final wording.",
  },
];

interface Literal {
  file: string;
  line: number;
  text: string;
}

// The text a literal puts on screen; template parts joined with `…` where an expression goes.
function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span) => `…${span.literal.text}`).join('');
  return null;
}

// Strings that never reach the screen: a key, a module path, a type, an id (`'flagship-lost'`, `'archive-lost'`: one
// lowercase word or several joined by - _ .), and the text of an error a dev sees when a rule is broken.
function offScreen(node: ts.Node, text: string): boolean {
  const parent = node.parent;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node) return true;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent)) return true;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
  if (/^[a-z][a-zA-Z0-9._-]*$/.test(text)) return true;
  for (let at: ts.Node | undefined = parent; at && !ts.isSourceFile(at); at = at.parent) {
    if (ts.isThrowStatement(at)) return true;
    if (ts.isNewExpression(at) && ts.isIdentifier(at.expression) && at.expression.text === 'Error') return true;
    if (ts.isCallExpression(at) && ts.isIdentifier(at.expression) && at.expression.text === 'fail') return true;
  }
  return false;
}

function literalsOf(file: string): Literal[] {
  const source = ts.createSourceFile(file, readFileSync(join(DATA, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const out: Literal[] = [];
  const visit = (node: ts.Node): void => {
    const text = literalText(node);
    if (text !== null) {
      if (!offScreen(node, text)) out.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const files = readdirSync(DATA).filter((name) => name.endsWith('.ts')).sort();
const literals = files.flatMap(literalsOf);
check('the guard reads every data module, the text modules among them',
  ['hollow-text.ts', 'script.ts', 'tool-text.ts', 'landing-text.ts', 'zone-text.ts', 'skill-text.ts', 'ghost-text.ts'].every((name) => files.includes(name))
  && literals.length > 1000, `${files.length} files, ${literals.length} strings`);

const used = new Set<Allowance>();
for (const rule of RULES) {
  const hits = literals.filter((literal) => rule.re.test(literal.text)
    && (!rule.podOnly || literal.file === 'landing-text.ts' || POD_WORDS.test(literal.text)));
  const banned = hits.filter((literal) => {
    const allowance = ALLOWED.find((candidate) => candidate.file === literal.file && candidate.rule === rule.id && candidate.text.test(literal.text));
    if (allowance) used.add(allowance);
    return !allowance;
  });
  check(`never-say: ${rule.id}${rule.podOnly ? ' (for a pod)' : ''}`, banned.length === 0,
    banned.map((literal) => `${literal.file}:${literal.line} "${literal.text}"`).join(' | '));
}
const stale = ALLOWED.filter((allowance) => !used.has(allowance));
check('every allowance still matches a string (none left behind)', stale.length === 0,
  stale.map((allowance) => `${allowance.file} ${allowance.rule} ${allowance.text}`).join(' | '));

// --- The phase-2 lines the review found, in their landing words ------------------------------------------------------
const cant = POD_STATE_TEXT.cantLaunch;
check("HOLLOW's eat echo: an eaten driver's pod CAN'T LAUNCH, a file is GONE",
  HOLLOW_ECHO.eat('pod08', true, '???').includes(cant) && HOLLOW_ECHO.eat('telemetry', false, '???').includes('GONE'));
check("THE DEAL's ACCEPT stamp names the pod and says CAN'T LAUNCH", HOLLOW_DEAL.stampAccepted('POD 08') === `DEAL · POD 08 ${cant}`);
check("the strip's eaten-driver moment says CAN'T LAUNCH", HOLLOW_HUD_TEXT.lostDriver === cant);
check('PURGE leaves the eaten pods PARKED IN ORBIT · fate unknown', HOLLOW_FINALE.purgeCost('400').includes(POD_STATE_TEXT.parked)
  && HOLLOW_FINALE.purgeCost('400').includes('400'));
const pods = (count: number): string[] => Array.from({ length: count }, (_, i) => `POD ${String(i + 1).padStart(2, '0')}`);
const gains = [1, 2, 3, 4, 5, 16].map((count) => HOLLOW_FINALE.mergeGain(pods(count)));
check(`MERGE's line names its pods and stays one line (≤ ${MAX_LINE_CHARS}) up to a ship's 16`,
  gains.every((text) => text.length <= MAX_LINE_CHARS) && gains[0]!.includes('POD 01') && gains[2]!.includes('POD 03')
  && gains[5]!.includes('+13') && !gains[5]!.includes('POD 04') && !gains.some((text) => /missing memories/i.test(text)),
  JSON.stringify(gains));
check('MERGE over nobody says so', HOLLOW_FINALE.mergeGain([]) === 'It ate nobody here to give back.');
const endings = [
  ...HOLLOW_FINALE.purgeEnding({ shipName: 'LAST LIGHT', inOrbit: '3,200', anyoneHome: true, eaten: '400', hollowWord: 'unit_046', unit: 47, shipsHome: 5, fleetSize: 5 }),
  ...HOLLOW_FINALE.mergeEnding({ shipName: 'LAST LIGHT', inOrbit: '3,200', restored: '400', hollowWord: 'unit_046', ours: 'unit_047', unit: 47 }),
].map((line) => line.text);
check('the typed endings count colonists, never souls', endings.some((text) => text.includes('3,200 colonists')) && !endings.some((text) => /souls/i.test(text)),
  JSON.stringify(endings));
check('RUN END over an empty flagship: nobody LANDED', /LANDED/.test(RUN_END_NOBODY_LANDED.title)
  && Object.values(RUN_END_NOBODY_LANDED.why).every((text) => /landed/.test(text) && !/woke/i.test(text)));
const lineage = lineageLine({ number: 47, landed: 6200, shipName: 'VESPER', cause: 'overwritten', stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: null, skills: null });
check("the title's lineage counts the colonists landed", lineage === 'last: UNIT-047 · 6,200 landed · overwritten at VESPER', String(lineage));
check('SCAN STASIS finds the sleepers, not `0 pods`', scanFinding('stasis', 100) !== '0 pods' && /sleeper/.test(scanFinding('stasis', 100)));

// The no-room rows the review round added (landing-text SIM: L3b, L13noRoom), rendered with worst-case values: every
// rule above, and one strip line.
const noRoom = [LANDING_LINES.L3b(0.75), LANDING_LINES.L3b(0.6), LANDING_LINES.L13noRoom('LZ-D', 5999, true)];
check(`the no-room rows say no never-say word and fit the strip (≤ ${MAX_LINE_CHARS})`,
  noRoom.every((text) => text.length <= MAX_LINE_CHARS && !RULES.some((rule) => rule.re.test(text))), JSON.stringify(noRoom));

finish();
