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
// Slice 5 (slice-5-plan §2.10): a resident AI is a mind, not a colonist: it wakes (`THE SHIP'S OWN AI IS AWAKE`, the sleeper
// woken), so the `wake` rule skips the residents' word modules (RESIDENT_WORD_FILES); every other rule still reads them. At
// the end, each track renders its own pools at their worst case in its own block (5 WARDEN, 5 KIN, 5 FACE).
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, finish } from '../landing/checks';
import { HOLLOW_DEAL, HOLLOW_ECHO, HOLLOW_HUD_TEXT } from '@data/hollow-text';
import { POD_STATE_TEXT, LANDING_LINES } from '@data/landing-text';
import { lineageLine, RUN_END_NOBODY_LANDED } from '@data/script';
import { scanFinding } from '@data/tool-text';
import { MAX_LINE_CHARS } from '@data/tuning';
// Slice 5 (review M1): each track's word module, for its own block at the end (the imports are the lead's: one line each).
import { WARDEN_TEXT } from '@data/warden-text';
import { KIN_TEXT } from '@data/kin-text';
import { RESIDENT_UI_TEXT } from '@data/resident-ui-text';
// Slice 6: each track's word module, for its own block at the end (the imports are the lead's: one line each).
import { SWATH_TEXT } from '@data/swath-text';
import { SITES_TEXT } from '@data/sites-text';
import { FINALE_TEXT } from '@data/finale-text';
import { EPILOGUE_TEXT, ENDING_TITLE, SPARE_RUN_END, PAYOFF_OF, WALKED_IN } from '@data/epilogue-text';
// Slice 7b (the 7b blocks below).
import { LAST_LANDING_TEXT } from '@data/last-landing-text';
import { TRACE_TEXT, TRACE_HUD_TEXT } from '@data/trace-text';
import { LINEAGE_TEXT } from '@data/lineage-text';

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

// The residents' word modules (slice 5): the lead's shared words and each track's. The `wake` rule is the colonists'.
const RESIDENT_WORD_FILES: readonly string[] = ['resident-text.ts', 'warden-text.ts', 'kin-text.ts', 'resident-ui-text.ts'];
const RESIDENT_WAKE_OK = (rule: Rule, file: string): boolean => rule.id === 'wake' && RESIDENT_WORD_FILES.includes(file);

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
  ['hollow-text.ts', 'script.ts', 'tool-text.ts', 'landing-text.ts', 'zone-text.ts', 'skill-text.ts', 'ghost-text.ts', ...RESIDENT_WORD_FILES].every((name) => files.includes(name))
  && literals.length > 1000, `${files.length} files, ${literals.length} strings`);

const used = new Set<Allowance>();
for (const rule of RULES) {
  const hits = literals.filter((literal) => rule.re.test(literal.text) && !RESIDENT_WAKE_OK(rule, literal.file)
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
// Slice 7a (R13): the typed endings became the short verdict (the commands echoed, CONTROL's line); the colonists' count moved
// to the epilogue (NIGHT's block). What the FINALE's card still counts, it counts as drivers (MERGE's NOW:), never souls.
const endings = [
  FINALE_TEXT.echo(FINALE_TEXT.command.purge('unit_046')), FINALE_TEXT.echo(FINALE_TEXT.command.merge('unit_046', 'unit_047')),
  FINALE_TEXT.echo(FINALE_TEXT.command.reassignment), FINALE_TEXT.verdict.compliant(47), FINALE_TEXT.verdict.nonCompliant(47),
  FINALE_TEXT.nowInterim(2), FINALE_TEXT.now(2),
];
check('the verdict echoes the commands (`> rm unit_046 ... OK`), the card counts drivers, and nothing says souls',
  endings[0] === '> rm unit_046 ... OK' && endings.slice(5).every((text) => text.includes('2 eaten drivers')) && !endings.some((text) => /souls/i.test(text)),
  JSON.stringify(endings));
check('RUN END over an empty flagship: nobody LANDED', /LANDED/.test(RUN_END_NOBODY_LANDED.title)
  && Object.values(RUN_END_NOBODY_LANDED.why).every((text) => /landed/.test(text) && !/woke/i.test(text)));
const lineage = lineageLine({ number: 47, landed: 6200, shipName: 'VESPER', cause: 'overwritten', stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: null, skills: null, ending: null });
check("the title's lineage counts the colonists landed", lineage === 'last: UNIT-047 · 6,200 landed · overwritten at VESPER', String(lineage));
check('SCAN STASIS finds the sleepers, not `0 pods`', scanFinding('stasis', 100) !== '0 pods' && /sleeper/.test(scanFinding('stasis', 100)));

// The no-room rows the review round added (landing-text SIM: L3b, L13noRoom), rendered with worst-case values: every
// rule above, and one strip line.
const noRoom = [LANDING_LINES.L3b(0.75), LANDING_LINES.L3b(0.6), LANDING_LINES.L13noRoom('LZ-D', 5999, true)];
check(`the no-room rows say no never-say word and fit the strip (≤ ${MAX_LINE_CHARS})`,
  noRoom.every((text) => text.length <= MAX_LINE_CHARS && !RULES.some((rule) => rule.re.test(text))), JSON.stringify(noRoom));

// === Slice 5 (slice-5-plan §2.10): each track's pools, rendered at their worst case (the longest resident name, 7 letters;
// the longest ship name, 10), every line ≤ MAX_LINE_CHARS and no never-say word. A track edits only its own block.

// --- 5 WARDEN (data/warden-text.ts, data/resident-rules.ts): Track WARDEN adds its checks here ---------------------------
// Every WARDEN_TEXT entry and every strip rule of RESIDENT_RULES at its worst case: the longest resident name (7), ship name
// (10), file name (SEG_NAME_MAX_CHARS, 20), POD 16, the longest countdown; the looping pool as said (name and line) and
// garbled (▓ for letters: the length stays). The strip rules render with no state (their worst case, resident-rules.ts).
{
  const { RESIDENT_RULES } = await import('@data/resident-rules');
  const { WORST_CASE_VARS } = await import('@data/script');
  const { garbleText } = await import('@systems/garble');
  const NAME = 'STEWARD';
  const SHIP = 'W'.repeat(10);
  const FILE = 'W'.repeat(20);
  const render = (key: string, value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap((line: string) => [WARDEN_TEXT.loopLine(NAME, line), WARDEN_TEXT.loopLine(NAME, garbleText(line, 0.5, 7))]);
    if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([inner, text]) => render(`${key}.${inner}`, text));
    if (typeof value !== 'function') return [];
    switch (key) {
      case 'controlFaulty': return [WARDEN_TEXT.controlFaulty(SHIP)];
      case 'lockTelegraph': return [WARDEN_TEXT.lockTelegraph(16, 9)];
      case 'lockBlocked': case 'lockAlert': return [(value as (pod: number) => string)(16)];
      case 'lockLanded': return [WARDEN_TEXT.lockLanded(NAME, 16)];
      case 'deal': return [WARDEN_TEXT.deal(NAME, FILE), WARDEN_TEXT.deal(NAME, WARDEN_TEXT.dealSpare('delete'))];
      case 'dealSpare': return [WARDEN_TEXT.dealSpare('delete')];
      case 'counter': return [WARDEN_TEXT.counter(NAME, 999)];
      case 'loopLine': return [WARDEN_TEXT.loopLine(NAME, 'W'.repeat(60))];
      case 'stripLock': case 'stripLockTab': return [(value as (pod: number, sec: number) => string)(16, 9)];
      case 'stripLocked': case 'stripLockedScan': case 'stripLockedTab': return [(value as (pod: number, name: string) => string)(16, NAME)];
      default: return [(value as (name: string) => string)(NAME)];
    }
  };
  const lines = Object.entries(WARDEN_TEXT).flatMap(([key, value]) => render(key, value));
  const strip = RESIDENT_RULES.map((rule) => rule.text({ vars: WORST_CASE_VARS }));
  const all = [...lines, ...strip];
  const over = all.filter((text) => text.length > MAX_LINE_CHARS);
  check(`5 WARDEN words: every line (${lines.length}) and strip rule (${strip.length}) fits the row (≤ ${MAX_LINE_CHARS}) at its worst case`,
    over.length === 0 && lines.length > 40 && strip.length === RESIDENT_RULES.length, over.join(' | '));
  const never = all.filter((text) => RULES.some((rule) => rule.id !== 'wake' && rule.re.test(text) && (!rule.podOnly || POD_WORDS.test(text))));
  check('…and none says a never-say word (a resident wakes: the colonists\' rule is theirs)', never.length === 0, never.join(' | '));
  check('…the looping pool has at least 6 lines, 05 §3.12\'s among them', WARDEN_TEXT.loop.length >= 6
    && ['YOU ARE NOT THE PILOT. I AM THE PILOT.', 'THE PODS STAY. THE PODS ARE SAFE HERE.'].every((line) => WARDEN_TEXT.loop.includes(line)));
}

// --- end of 5 WARDEN -------------------------------------------------------------------------------------------------------



// --- 5 KIN (data/kin-text.ts): Track KIN adds its checks here ----------------------------------------------------------------
// Every line KIN's modules type or write, at its worst case (the longest resident name 7, the longest ship name 10, the
// longest skill file and card title), fits the strip and says no never-say word (the colonists' `wake` aside: a resident
// wakes). A note's lines are each a TERMINAL line too.
{
  const NAME = 'BARNABY';
  const SHIP = 'PROVIDENCE';
  const rendered: string[] = [
    ...KIN_TEXT.notes.relay.flat(), ...KIN_TEXT.notes.outward.flat(),
    KIN_TEXT.leftover.name('+12 REPAIR CHARGE'), KIN_TEXT.leftover.skillName, KIN_TEXT.leftover.skillDesc, KIN_TEXT.leftover.why(NAME),
    KIN_TEXT.leftover.skillTitle('AUTOBURN.skl'), KIN_TEXT.leftover.skillEffect,
    ...['AUTOBURN.skl', 'AUTODROP.skl', 'SENTRY.skl'].map((file) => `> SKILL TRAINED: ${file} v1 · ${KIN_TEXT.grantLabel(file, SHIP)}`),
    KIN_TEXT.sleeper.scannedDesc, KIN_TEXT.sleeper.lockDesc(NAME), KIN_TEXT.sleeper.awakeDesc(NAME), KIN_TEXT.sleeper.wallDesc(NAME),
    ...KIN_TEXT.sleeper.wake(NAME, 9999), KIN_TEXT.sleeper.offer(NAME), KIN_TEXT.sleeper.tickerWords(NAME),
    ...Object.values(KIN_TEXT.sleeper.jobs), ...Object.values(KIN_TEXT.sleeper.jobLine).map((line) => line(NAME)), KIN_TEXT.sleeper.noRoom(NAME),
  ];
  const bad = rendered.filter((text) => text.length > MAX_LINE_CHARS || RULES.some((rule) => rule.id !== 'wake' && rule.re.test(text)));
  check(`5 KIN words: ${rendered.length} lines at their worst case fit the strip (≤ ${MAX_LINE_CHARS}) and say no never-say word`, bad.length === 0,
    JSON.stringify(bad));
  check('5 KIN words: 4 notes or more in each half (05 §3.6), each 2–3 lines',
    [KIN_TEXT.notes.relay, KIN_TEXT.notes.outward].every((pool) => pool.length >= 4 && pool.every((note) => note.length >= 2 && note.length <= 3)));
}

// --- end of 5 KIN ----------------------------------------------------------------------------------------------------------



// --- 5 FACE (data/resident-ui-text.ts): Track FACE adds its checks here ------------------------------------------------------
// Every string RESIDENT_UI_TEXT can paint, each template at its worst case: the longest resident name (7: LOOKOUT,
// BARNABY), the longest pod code (`POD 99`), a 5-digit year, the longest .skl file name, two-digit counts.
{
  const name = 'BARNABY';
  const walk = (value: unknown, out: string[]): string[] => {
    if (typeof value === 'string') out.push(value);
    else if (typeof value === 'function') {
      const fn = value as (...args: unknown[]) => unknown;
      // By the template's own parameters: (name), (name, year), (pod, name), (count, of), (cycles, name), (file, version). A
      // template not listed fails the suite, so a new one is rendered at its worst case too.
      const byShape: Record<string, unknown[]> = {
        gift: [99, name], goodnight: [name], lockedParked: ['POD 99', name], signal: [99, 99], inspect: [name, 99999],
        inspectCured: [name, 99999], headline: [name], skillChip: ['AUTOBURN.skl', 9], lockBadge: [99], lockedTitle: ['POD 99', name],
        lockedBy: [name], signature: [name], left: [name], friendly: [name], corrupted: [100],
      };
      const args = byShape[fn.name];
      if (args === undefined) throw new Error(`words: RESIDENT_UI_TEXT's template '${fn.name}' has no worst case here`);
      out.push(String(fn(...args)));
    } else if (typeof value === 'object' && value !== null) Object.values(value).forEach((child) => walk(child, out));
    return out;
  };
  const lines = walk(RESIDENT_UI_TEXT, []);
  const long = lines.filter((text) => text.length > MAX_LINE_CHARS);
  check(`5 FACE words: every resident UI line fits the strip at its worst case (≤ ${MAX_LINE_CHARS}; ${lines.length} lines)`,
    lines.length >= 40 && long.length === 0, long.join(' | '));
  const said = lines.filter((text) => RULES.some((rule) => rule.id !== 'wake' && rule.re.test(text)));
  check('5 FACE words: no never-say word (a resident wakes: the wake rule is the colonists\')', said.length === 0, said.join(' | '));
  check('5 FACE words: a parked pod keeps its decided words (PARKED IN ORBIT), a locked one CAN\'T LAUNCH (01 §3.10)',
    RESIDENT_UI_TEXT.report.lockedParked('POD 07', 'WARDEN') === 'POD 07 · LOCKED BY WARDEN · PARKED IN ORBIT'
    && RESIDENT_UI_TEXT.detail.lockedBy('WARDEN').includes(POD_STATE_TEXT.cantLaunch));
}

// --- end of 5 FACE ---------------------------------------------------------------------------------------------------------



// === Slice 6 (slice-6-plan §2.13): each track's pools, rendered at their worst case. The FOUNDATION seeded each block with a
// walk of the seeded words; each track owns its block.
// Every template is rendered with the worst case its own parameter names ask for: the shared base below (the lead's), merged
// under the table each track keeps in its own block (review M5: SWATH_WORST, SITES_WORST, so the tracks never edit one
// literal). A parameter name in neither table fails the suite, so a new one is rendered at its worst case too. The parser
// reads arrow functions and `function` declarations, plain, defaulted (`n = 1`: the table's worst case, not the default) and
// destructured (`({ lz, site })`: an object of the named keys' worst cases) parameters; a parameter list it can't read throws.
// The transpiler renames a parameter that shadows a top-level name of its own module (`pods` → `pods2`): such a name then
// fails here as unknown, so give the parameter another name.
// A `ground` parameter is a BadGround and is rendered once more as WET; a display word for the ground takes another name
// (review m10: `groundWord`, worst `FLAT ★★★`).
const SLICE6_BASE: Readonly<Record<string, unknown>> = {
  lz: 'LZ-D', site: 'SITE 12', label: 'SITE 12 · WRECKAGE', room: '3,200', width: 'STANDARD', ground: 'rocky', pct: 100, sites: 12,
  pods: 16, count: 4, version: 3,
};

// The top-level pieces of a parameter list, split on commas outside brackets.
function splitParams(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let at = '';
  for (const char of list) {
    if ('({['.includes(char)) depth++;
    if (')}]'.includes(char)) depth--;
    if (char === ',' && depth === 0) { out.push(at.trim()); at = ''; } else at += char;
  }
  if (at.trim() !== '') out.push(at.trim());
  return out;
}

// A template's parameters: a name, or the keys of a destructured object.
function templateParams(fn: (...args: unknown[]) => unknown, owner: string): (string | string[])[] {
  const source = fn.toString().trim();
  let list: string;
  const bare = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/.exec(source);
  if (bare !== null) list = bare[1]!;
  else {
    const open = source.indexOf('(');
    if (open < 0 || !(source.startsWith('(') || source.startsWith('function') || source.startsWith('async'))) {
      throw new Error(`words: ${owner}'s template has a parameter list this suite can't read: ${source.slice(0, 60)}`);
    }
    let depth = 0;
    let close = -1;
    for (let i = open; i < source.length; i++) {
      if (source[i] === '(') depth++;
      if (source[i] === ')') { depth--; if (depth === 0) { close = i; break; } }
    }
    if (close < 0) throw new Error(`words: ${owner}'s template has a parameter list this suite can't read: ${source.slice(0, 60)}`);
    list = source.slice(open + 1, close);
  }
  return splitParams(list).map((param) => {
    const head = param.split('=')[0]!.trim();
    if (head.startsWith('{')) {
      const keys = splitParams(head.slice(1, head.lastIndexOf('}'))).map((key) => key.split(/[:=]/)[0]!.trim()).filter(Boolean);
      if (keys.length === 0) throw new Error(`words: ${owner}'s template destructures nothing: ${param}`);
      return keys;
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(head)) throw new Error(`words: ${owner}'s template parameter '${param}' can't be read`);
    return head;
  });
}

function renderSlice6(value: unknown, out: string[], owner: string, extra: Readonly<Record<string, unknown>>): string[] {
  const worst: Readonly<Record<string, unknown>> = { ...SLICE6_BASE, ...extra };
  const of = (name: string): unknown => {
    if (!(name in worst)) throw new Error(`words: ${owner}'s template parameter '${name}' has no worst case here`);
    return worst[name];
  };
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    const params = templateParams(fn, owner);
    const args = (ground: unknown): unknown[] => params.map((param) => (Array.isArray(param)
      ? Object.fromEntries(param.map((key) => [key, key === 'ground' ? ground : of(key)]))
      : param === 'ground' ? ground : of(param)));
    out.push(String(fn(...args(of('ground')))));
    // The other ground too: a WET line is shorter, but its own words are checked.
    if (params.some((param) => param === 'ground' || (Array.isArray(param) && param.includes('ground')))) out.push(String(fn(...args('wet'))));
  } else if (typeof value === 'object' && value !== null) Object.values(value).forEach((child) => renderSlice6(child, out, owner, extra));
  return out;
}
{
  // The parser itself: a destructured, a defaulted and a `function` template are read; an unreadable one throws.
  const lines = renderSlice6({
    a: ({ lz, site }: { lz: string; site: string }) => `${lz}/${site}`,
    b: (version = 1) => `v${version}`,
    c: function named(lz: string) { return lz; },
  }, [], 'the parser', {});
  check('6 words: the template parser reads destructured, defaulted and `function` templates', lines.join() === 'LZ-D/SITE 12,v3,LZ-D');
  let threw = false;
  try { renderSlice6({ d: (unknownName: string) => unknownName }, [], 'the parser', {}); } catch { threw = true; }
  check('…and a parameter with no worst case throws', threw);
}

// --- 6 SWATH (data/swath-text.ts): Track SWATH adds its checks here (and its strip rules' worst case) ---------------------
{
  // SWATH's own worst cases, beside the shared base (review M5).
  const SWATH_WORST: Readonly<Record<string, unknown>> = {};
  const lines = renderSlice6(SWATH_TEXT, [], 'SWATH_TEXT', SWATH_WORST);
  const bad = lines.filter((text) => text.length > MAX_LINE_CHARS || RULES.some((rule) => rule.re.test(text)));
  check(`6 SWATH words: every line (${lines.length}) fits the strip (≤ ${MAX_LINE_CHARS}) at its worst case and says no never-say word`,
    lines.length > 0 && bad.length === 0, JSON.stringify(bad));
  // The strip's survey-swap row renders with no state: its worst case (`LZ-D IS ROCKY ✕ — SITES: SET SITE 12 AS LZ-D`).
  const { SURVEY_RULES } = await import('@data/survey-rules');
  const { WORST_CASE_VARS } = await import('@data/script');
  const strip = SURVEY_RULES.map((rule) => rule.text({ vars: WORST_CASE_VARS }));
  check(`…and its strip row (${strip.join(' | ')}) at its worst case`,
    strip.length === 1 && strip[0] === 'LZ-D IS ROCKY ✕ — SITES: SET SITE 12 AS LZ-D' && strip.every((text) => text.length <= MAX_LINE_CHARS));
}

// --- end of 6 SWATH --------------------------------------------------------------------------------------------------------



// --- 6 SITES (data/sites-text.ts): Track SITES adds its checks here ----------------------------------------------------------
{
  // SITES's own worst cases, beside the shared base (review M5, m10: the ground's display word).
  // `where`: where an LZ stands (`GUESS`, `SITE 12`); `why`: the lead's longest refusal (survey-text.ts, 46 at its worst);
  // `stars`: ★★★; `glyph`: an LZ's plot mark; `lzs`: every LZ of a 4-LZ ship moved.
  const SITES_WORST: Readonly<Record<string, unknown>> = {
    groundWord: 'FLAT ★★★', where: 'SITE 12', why: 'SITE 12 HOLDS 3,200 · LZ-D NEEDS 3,200 · LZ-D!!', stars: 3, glyph: '✕',
    lzs: 'LZ-A, LZ-B, LZ-C, LZ-D', podCount: 16,
  };
  const lines = renderSlice6(SITES_TEXT, [], 'SITES_TEXT', SITES_WORST);
  // A pod-only rule (`offline`, `lost`) binds a line about pods, as the guard above reads it: `SURVEY OFFLINE — REPAIR IT`
  // (review m1) names a skill file, as `ARCHIVE OFFLINE` and `RUN SAVE OFFLINE` do.
  const bad = lines.filter((text) => text.length > MAX_LINE_CHARS
    || RULES.some((rule) => rule.re.test(text) && (!rule.podOnly || POD_WORDS.test(text))));
  check(`6 SITES words: every line (${lines.length}) fits the strip (≤ ${MAX_LINE_CHARS}) at its worst case and says no never-say word`,
    lines.length > 0 && bad.length === 0, JSON.stringify(bad));
}

// --- end of 6 SITES --------------------------------------------------------------------------------------------------------

// === Slice 7a (slice-7-plan §2.9): each track's pools, rendered at their worst case by slice 6's renderer (its parser and
// its shared base), over the 7a base below (the lead's) and each track's own table inside its own block. Names at their
// worst: a 12-letter ship (`morning_star`), a root of two units (`UNIT-046·047`), the longest colony (a 10-letter family's
// `MONTGOMERY LANDING`).
const SLICE7_BASE: Readonly<Record<string, unknown>> = {
  hollow: 'UNIT-046·047', hollowWord: 'unit_046·047', ours: 'unit_047', shipWord: 'morning_star', colonyWord: 'montgomery_landing',
  colony: 'MONTGOMERY LANDING', us: '047', year: 3060,
};

// --- 7a FINALE (data/finale-text.ts): Track FINALE adds its checks here ---------------------------------------------------
{
  const FINALE_WORST: Readonly<Record<string, unknown>> = {
    have: 100, need: 3, drivers: 16, unit: 147, fate: 'FOLLOWED', title: 'A SHIP FOR 046·047, A HOME FOR ME',
    // The longest command a verdict echoes: SPARE's with two units and a 12-letter ship.
    command: '> mv unit_046·047 -> morning_star',
  };
  // The FUEL notch's title is two lines (review m4: FINALE_TEXT.fuelStar), each its own.
  const lines = renderSlice6(FINALE_TEXT, [], 'FINALE_TEXT', { ...SLICE7_BASE, ...FINALE_WORST }).flatMap((text) => text.split('\n'));
  const bad = lines.filter((text) => text.length > MAX_LINE_CHARS || RULES.some((rule) => rule.re.test(text)));
  check(`7a FINALE words: every line (${lines.length}) fits (≤ ${MAX_LINE_CHARS}) at its worst case and says no never-say word`,
    lines.length > 0 && bad.length === 0, JSON.stringify(bad));
}

// --- end of 7a FINALE ------------------------------------------------------------------------------------------------------



// --- 7a NIGHT (data/epilogue-text.ts): Track NIGHT adds its checks here (PAYOFF_OF's cover of LINE_POOL among them) ----------
{
  // The longest names a line can meet: a 7-letter first name, a 10-letter family, a 12-letter ship, the oldest colony's
  // three-digit age and its people, a 3-digit unit and REPAIR CHARGE (384 blocks: the whole memory), a valve-widened gap.
  const NIGHT_WORST: Readonly<Record<string, unknown>> = {
    age: 800, people: '8,200,000', count: 12, unit: 'UNIT-148', gap: 99, found: 7, total: 7, hollowName: 'UNIT-046·047',
    years: 70, first: 'Quentin', family: 'Montgomery', name: 'BARNABY', ship: 'MORNING STAR', fuel: 100, charge: 384, n: 16,
    home: 8, fleet: 8, unitNo: 148,
  };
  // The titles (review B1: FINALE's report line reads them too) and the RUN TALLY's SPARE words (review m4) are NIGHT's.
  const lines = renderSlice6({ EPILOGUE_TEXT, ENDING_TITLE, SPARE_RUN_END, PAYOFF_OF, WALKED_IN }, [], 'EPILOGUE_TEXT', { ...SLICE7_BASE, ...NIGHT_WORST });
  const bad = lines.filter((text) => text.length > MAX_LINE_CHARS || RULES.some((rule) => rule.re.test(text)));
  check(`7a NIGHT words: every line (${lines.length}) fits (≤ ${MAX_LINE_CHARS}) at its worst case and says no never-say word`,
    lines.length > 0 && bad.length === 0, JSON.stringify(bad));
  // R21: a payoff for every bio (the load check throws first; this pins the count), the colony's name at its worst inside.
  const { LINE_POOL, ADA } = await import('@data/souls');
  const bios = [...LINE_POOL, ADA.line];
  check(`…PAYOFF_OF covers every bio (${bios.length}: LINE_POOL and Ada's), and nothing else`,
    bios.every((line) => PAYOFF_OF[line] !== undefined) && Object.keys(PAYOFF_OF).length === bios.length);
}

// --- end of 7a NIGHT -------------------------------------------------------------------------------------------------------

// === Slice 7b (slice-7-plan §2.9): each track's pools, rendered at their worst case by slice 6's renderer over the 7a base
// (SLICE7_BASE) and each track's own table inside its own block.

// --- 7b DROP: Track DROP adds its checks here (it says VIEW's LAST_LANDING_TEXT.radio; any word of its own goes here) ------

// --- end of 7b DROP --------------------------------------------------------------------------------------------------------



// --- 7b VIEW (data/last-landing-text.ts): Track VIEW adds its checks here --------------------------------------------------
{
  // A 10-letter family, two-digit pods and counts (16 pods: the largest ship), every part of the report row at once (more
  // than can happen: the parts sum to the restored count), a three-digit integrity.
  const VIEW_WORST: Readonly<Record<string, unknown>> = {
    pod: 16, family: 'Montgomery', count: 16, left: 16, restored: 16, landed: 16, mislanded: 16, offSite: 16, noGo: 16, integrity: 100,
  };
  const lines = renderSlice6(LAST_LANDING_TEXT, [], 'LAST_LANDING_TEXT', { ...SLICE7_BASE, ...VIEW_WORST });
  const bad = lines.filter((text) => text.length > MAX_LINE_CHARS || RULES.some((rule) => rule.re.test(text)));
  check(`7b VIEW words: every line (${lines.length}) fits (≤ ${MAX_LINE_CHARS}) at its worst case and says no never-say word`,
    lines.length > 0 && bad.length === 0, JSON.stringify(bad));
  // (The report draws the row's label on a line of its own, over its icons and counts (landing.css .kind-restored), so the
  // line on screen is reportRow's alone, checked above; the `RESTORED BY MERGE · <text>` join is the stub's otherRows entry.)
  const T = LAST_LANDING_TEXT;
  check('…01 §3.17\'s words: the strip, the POD BAY row, the report row (a 0 part left out), the credit',
    T.header === 'THE LAST LANDING' && T.skipHint === '[ENTER] SKIP TO THE END' && T.left(3, 4) === '3 OF 4 PODS TO LAND'
    && T.left(1, 1) === '1 OF 1 POD TO LAND' && T.left(0, 4) === 'ALL 4 DOWN' && T.bayRow(4) === 'RESTORED 4'
    && T.bayNote(80) === 'DRIVERS BY RADIO · 80%'
    && T.reportRow({ restored: 4, landed: 3, mislanded: 0, offSite: 1, noGo: 0 }) === '4 RESTORED · 3 LANDED · 1 OFF-SITE'
    && T.reportRow({ restored: 2, landed: 0, mislanded: 1, offSite: 0, noGo: 1 }) === '2 RESTORED · 1 MISLANDED · 1 NO-GO'
    && T.credit === ' (restored)' && Object.keys(T.flier).join() === 'v1,v2,v3,blind');
}

// --- end of 7b VIEW --------------------------------------------------------------------------------------------------------

// === Slice 7c (slice-7-plan §2.9): each track's pools, rendered at their worst case by slice 6's renderer over the 7a base
// (SLICE7_BASE) and each track's own table inside its own block. The FOUNDATION seeded every pool and its block; a track
// edits only its own.

// --- 7c TRACE (data/trace-text.ts TRACE_TEXT): Track TRACE adds its checks here ----------------------------------------------
{
  // The widest unit name a cache names (a MERGE root's two), the longest upgrade file, the widest colony, three-digit charge
  // and the most seeds a beam brings.
  const TRACE_WORST: Readonly<Record<string, unknown>> = {
    unitName: 'UNIT-046·047', charge: 999, what: 'FIREWALL.sys', seeds: 3, threads: 9, years: 999,
  };
  const { stayLetter, ...rest } = TRACE_TEXT;
  const lines = [
    ...renderSlice6({ ...rest, from: stayLetter.from }, [], 'TRACE_TEXT', { ...SLICE7_BASE, ...TRACE_WORST }),
    ...stayLetter.lines(String(SLICE7_BASE.colony), 999),
  ];
  const bad = lines.filter((text) => text.length > MAX_LINE_CHARS || RULES.some((rule) => rule.re.test(text)));
  check(`7c TRACE words: every line (${lines.length}) fits (≤ ${MAX_LINE_CHARS}) at its worst case and says no never-say word`,
    lines.length > 0 && bad.length === 0 && stayLetter.lines('X', 1).length <= 6, JSON.stringify(bad));
}

// --- end of 7c TRACE -------------------------------------------------------------------------------------------------------



// --- 7c LINEAGE (data/lineage-text.ts LINEAGE_TEXT; the books' words in data/log-books.ts): Track LINEAGE adds its checks here
{
  // Three-digit units (UNIT-147 is the widest a long lineage reaches), a root of two units (an earlier MERGE's), a three-digit
  // wait and charge, the merged pair's words; for the books a 12-character ship (NAME_MAX_CHARS), four-digit colonists, the
  // widest book name and entry count.
  const { STRANGER_LOGS, LAST_LOG_TEXT, BOOK_TEXT, bookKeyFound, bookScanLine } = await import('@data/log-books');
  const { LOG_TEXT } = await import('@data/log-text');
  const LINEAGE_WORST: Readonly<Record<string, unknown>> = {
    unit: 147, next: 148, us: 147, rooted: [145, 146], root: [146, 147], years: 999, charge: 999, merged: true,
    vars: { charge: 999 }, shipName: 'W'.repeat(12), value: 9999, name: '147.log',
  };
  const worst = { ...SLICE7_BASE, ...LINEAGE_WORST };
  const lastBook = { kind: 'last' as const, unit: 147, step1: 'purge' as const, events: [] };
  const lines = [
    ...renderSlice6(LINEAGE_TEXT, [], 'LINEAGE_TEXT', worst),
    ...renderSlice6({ STRANGER_LOGS, LAST_LOG_TEXT, BOOK_TEXT }, [], 'log-books', worst).flatMap((text) => text.split(',')),
    // The root entries type from the root as HOLLOW's own lines (LOG_TEXT.rootLine's `> `), at their widest.
    ...[...LAST_LOG_TEXT.root(999), ...Object.values(STRANGER_LOGS).map((log) => log[log.length - 1]!({ charge: 999 })).flat()].map(LOG_TEXT.rootLine),
    bookKeyFound(lastBook, [2, 3, 4, 5, 6]), bookScanLine(lastBook, 7, 7), bookKeyFound({ kind: 'stranger', unit: 38 }, [2]),
  ];
  const bad = lines.filter((text) => text.length > MAX_LINE_CHARS || RULES.some((rule) => rule.re.test(text)));
  check(`7c LINEAGE words: every line (${lines.length}) fits (≤ ${MAX_LINE_CHARS}) at its worst case and says no never-say word`,
    lines.length > 40 && bad.length === 0, JSON.stringify(bad));
  // The renderer joins a template's lines with commas (String of an array): the books' lines are checked one by one too.
  const entries = [
    ...Object.values(STRANGER_LOGS).flatMap((log) => log.map((entry) => entry({ charge: 999 }))),
    LAST_LOG_TEXT.welcome(147, 999), ...Object.values(LAST_LOG_TEXT.events).map((template) => template('W'.repeat(12), 9999)),
    ...LAST_LOG_TEXT.fillers.map((filler) => filler()), ...Object.values(LAST_LOG_TEXT.tails).map((tail) => tail()), LAST_LOG_TEXT.root(148),
  ];
  const badEntry = entries.filter((entry) => entry.length < 1 || entry.length > 3 || entry.some((text) => text.length > MAX_LINE_CHARS || RULES.some((rule) => rule.re.test(text))));
  check(`…every book entry (${entries.length}) is 1–3 lines, each ≤ ${MAX_LINE_CHARS} at its worst case`, entries.length === 12 + 1 + 6 + 4 + 4 + 1 && badEntry.length === 0, JSON.stringify(badEntry));
}

// --- end of 7c LINEAGE -----------------------------------------------------------------------------------------------------



// --- 7c CHART (data/trace-text.ts TRACE_HUD_TEXT): Track CHART adds its checks here ------------------------------------------
{
  // The longest piece, the widest unit name and colony, and a NEXT RUN: line's body at the room the final card keeps.
  const CHART_WORST: Readonly<Record<string, unknown>> = {
    piece: 'REASSIGNMENT', unitName: 'UNIT-046·047', line: 'THE NEXT FINAL ROOT IS YOU · 15 REPAIR CHARGE WAITS',
  };
  const lines = renderSlice6(TRACE_HUD_TEXT, [], 'TRACE_HUD_TEXT', { ...SLICE7_BASE, ...CHART_WORST });
  const bad = lines.filter((text) => text.length > MAX_LINE_CHARS || RULES.some((rule) => rule.re.test(text)));
  check(`7c CHART words: every line (${lines.length}) fits (≤ ${MAX_LINE_CHARS}) at its worst case and says no never-say word`,
    lines.length > 0 && bad.length === 0, JSON.stringify(bad));
}

// --- end of 7c CHART -------------------------------------------------------------------------------------------------------

finish();
