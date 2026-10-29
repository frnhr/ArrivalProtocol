// Final fix pass: the final review's words and small strip rules, headless.
// • An eaten ship file: `SWAP IT` only for a ship file with a clean backup and SWAP in hand (Thrust Ctrl and Thrust.alt),
//   lighting SWAP and then the file; any other ship file `DELETE IT` (DELETE, then the file); with neither tool in
//   hand, `REPAIR can't heal it` and no TAB (final review: `SWAP OR DELETE IT` for every ship file).
// • (MIND CLEAR during the STASIS reveal: gone with the reveal, slice 1a.)
// • The CORE LOST card: on ships 1–4 the run goes on (`ARRIVAL CONTROL is pulling you out.`), on the flagship
//   OVERWRITTEN (`Nobody is left to think.`); BurnResult picks by lossPlan's kind, checked here on both.
// • RUN END: `41 points short of CARETAKER`; MERGE's carry line names the shimmer, in one line.
// • VESPER's COPY lesson names the enemy by the name the kid knows, within 70 characters with a merged name.
// • INSPECT: Repair names the colonists; AUTOBURN.skl flies the capture into the ring or until a trim is left.
// Usage: node_modules/.bin/tsx --tsconfig tsconfig.json tests/unit/final-fix/strip-words.test.ts
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import { infectNow } from '@systems/hollow';
import { installTool } from '@systems/licences';
import { buildDirectorCtx, composeObjective } from '@systems/director';
import { getPrediction } from '@systems/predict';
import { setMode } from '@systems/mode';
import { lossPlan } from '@systems/run';
import { GUIDE_RULES, WORST_CASE_VARS } from '@data/script';
import { RUN_END_TEXT } from '@data/landing-text';
import { CORE_LOST_TEXT, HOLLOW_FINALE, hollowUnitName } from '@data/hollow-text';
import { TOOL_FILES, TOOL_HINT_TARGET, fileHintTarget } from '@data/fs-tools';
import { UPGRADE_FILE_TEXT } from '@data/upgrades';
import { MAX_LINE_CHARS } from '@data/tuning';
import type { GameState, ObjectiveLine } from '@state/schema';
import type { Segment } from '@/types/segment';

const h = createHarness11(9);
const state = (): Readonly<GameState> => h.store.getState();
const rule = (id: string) => {
  const found = GUIDE_RULES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`strip-words: no rule '${id}'`);
  return found;
};
const composed = (): ObjectiveLine | null => composeObjective(
  buildDirectorCtx(state(), getPrediction(), { events: new Set(), phaseEntered: null, mindQuietSec: 99, flash: null }), GUIDE_RULES);
const ctxNow = () => buildDirectorCtx(state(), getPrediction(), { events: new Set(), phaseEntered: null, mindQuietSec: 99, flash: null });

// --- An eaten ship file -------------------------------------------------------------------------------------------
function eatShipFile(role: string, licences: readonly ('swap' | 'delete')[]): void {
  h.lastLight(9, { hollowAsleep: true });
  for (const kind of ['repair', 'move', ...licences] as const) if (!state().run.licences.includes(kind)) installTool(h.store, kind);
  h.store.update((d) => {
    d.run.licences = d.run.licences.filter((kind) => kind === 'repair' || kind === 'move' || licences.includes(kind as 'swap' | 'delete'));
    // Without the licence its files are gone too (a SWAP or DELETE in hand needs its file).
    d.memory = d.memory.map((seg): Segment => (seg.type === 'fs-tool' && (seg.fsTool === 'swap' || seg.fsTool === 'delete')
      && !licences.includes(seg.fsTool) ? { id: `free-${seg.id}`, name: 'free', type: 'free', size: seg.size } as Segment : seg));
    d.hollow.phase = 'awake';
    d.hollow.biteInSec = 9999;
    d.hollow.seedInSec = 9999;
    d.hollow.verbInSec = 9999;
    d.ui.memoryRev++;
  });
  const file = state().memory.find((seg) => seg.type === 'ship' && seg.role === role);
  if (!file) throw new Error(`strip-words: no ship file with role ${role}`);
  h.store.update((d) => {
    const seg = d.memory.find((candidate) => candidate.id === file.id)!;
    infectNow(h.store, seg);
  });
}

eatShipFile('thrust-ctrl', ['swap', 'delete']);
setMode(h.store, 'memory');
check('Thrust Ctrl eaten, Thrust.alt clean, SWAP in hand: `SOMETHING IS EATING THRUST CONTROLLER — SWAP IT`',
  ctxNow().vars.eatingShipFix === 'SWAP' && rule('hollow-eating-ship').text(ctxNow()) === `SOMETHING IS EATING ${ctxNow().vars.eating} — SWAP IT`,
  rule('hollow-eating-ship').text(ctxNow()));
const swapLight = rule('hollow-eating-ship').highlight;
check('…lighting SWAP until it is in hand', typeof swapLight === 'function' && swapLight(ctxNow()) === TOOL_HINT_TARGET.swap);
h.store.update((d) => { d.ui.activeTool = { kind: 'swap', toolSegId: d.memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'swap')!.id }; });
check('…then the file', typeof swapLight === 'function' && swapLight(ctxNow()) === fileHintTarget('thrust-ctrl'), String(typeof swapLight === 'function' && swapLight(ctxNow())));
h.store.update((d) => { d.ui.activeTool = null; });
setMode(h.store, 'tools');
check('…in amber `… — [TAB], SWAP IT`', rule('hollow-eating-ship-tab').activeWhen(ctxNow())
  && rule('hollow-eating-ship-tab').text(ctxNow()) === `SOMETHING IS EATING ${ctxNow().vars.eating} — [TAB], SWAP IT`);

eatShipFile('cargo', ['swap', 'delete']);
setMode(h.store, 'memory');
check('Cargo Ctrl eaten (no backup), DELETE in hand: `… — DELETE IT`, lighting DELETE',
  ctxNow().vars.eatingShipFix === 'DELETE' && rule('hollow-eating-ship').text(ctxNow()) === `SOMETHING IS EATING ${ctxNow().vars.eating} — DELETE IT`
  && (rule('hollow-eating-ship').highlight as (ctx: ReturnType<typeof ctxNow>) => string | null)(ctxNow()) === TOOL_HINT_TARGET.delete,
  rule('hollow-eating-ship').text(ctxNow()));

eatShipFile('thrust-ctrl', ['delete']);
setMode(h.store, 'memory');
check('Thrust Ctrl eaten with no SWAP in hand: `… — DELETE IT`', ctxNow().vars.eatingShipFix === 'DELETE', ctxNow().vars.eatingShipFix);

eatShipFile('cargo', []);
setMode(h.store, 'tools');
check('a ship file eaten with neither SWAP nor DELETE in hand: `… — REPAIR can\'t heal it`, no TAB, on either screen',
  ctxNow().vars.eatingShipFix === '' && !rule('hollow-eating-ship-tab').activeWhen(ctxNow())
  && rule('hollow-eating-ship').text(ctxNow()) === `SOMETHING IS EATING ${ctxNow().vars.eating} — REPAIR can't heal it`
  && (composed()?.keys.includes('TAB') ?? false) === false, `${composed()?.id}: ${composed()?.text}`);
const worst = { vars: WORST_CASE_VARS };
check(`the eaten-ship lines fit ${MAX_LINE_CHARS} characters with the worst-case names`,
  ['hollow-eating-ship', 'hollow-eating-ship-tab'].every((id) => rule(id).text(worst).length <= MAX_LINE_CHARS)
  && rule('hollow-eating-ship').text({ vars: { ...WORST_CASE_VARS, eatingShipFix: '' } }).length <= MAX_LINE_CHARS);

// --- CORE LOST, RUN END, the COPY lesson, INSPECT -------------------------------------------------------------------
{
  // Ship 4 (VESPER, index 3) and the flagship, with the Core eaten: the card's subtitle follows the loss plan.
  h.vesper(9, { hollowAsleep: true });
  h.store.update((d) => { d.run.coreLost = true; });
  const recoverable = lossPlan(state());
  h.lastLight(9, { hollowAsleep: true });
  h.store.update((d) => { d.run.coreLost = true; });
  const flagship = lossPlan(state());
  check('CORE LOST on ships 1–4 goes on (EMERGENCY TRANSMIT), on the flagship it ends the run (OVERWRITTEN)',
    recoverable.kind === 'transmit' && flagship.kind === 'end' && flagship.cause === 'overwritten', `${recoverable.kind} / ${flagship.kind}`);
  check('…so its card says `ARRIVAL CONTROL is pulling you out.` on ships 1–4 and `Nobody is left to think.` only when overwritten',
    CORE_LOST_TEXT.subRecoverable.endsWith('ARRIVAL CONTROL is pulling you out.') && CORE_LOST_TEXT.subOverwritten.endsWith('Nobody is left to think.'));
}
check('RUN END\'s near miss says points: `41 points short of CARETAKER`', RUN_END_TEXT.rankGap(41, 'CARETAKER') === '41 points short of CARETAKER');
check('MERGE\'s carry line names the shimmer, in one line', HOLLOW_FINALE.mergeCarries(3) === 'NEXT RUN: your Core has 3 threads, and a faint glitch shimmer stays.'
  && HOLLOW_FINALE.mergeCarries(9).length <= MAX_LINE_CHARS);
const merged = { vars: { ...WORST_CASE_VARS, hollow: hollowUnitName([998, 999]) } };
check('VESPER\'s COPY lesson names the enemy as the kid knows it, never HOLLOW, ≤ 70 with a merged name',
  rule('tut-copy-repair').text(merged) === 'UNIT-998·999 IS HUNTING YOUR TOOLS — COPY your Repair'
  && rule('tut-copy-repair-tab').text(merged) === 'UNIT-998·999 IS HUNTING YOUR TOOLS — [TAB], COPY your Repair'
  && rule('tut-copy-repair-tab').text(merged).length <= MAX_LINE_CHARS);
check('INSPECT on Repair names the colonists and what ship files need instead',
  TOOL_FILES.repair[0]!.desc.includes('your AI files and the colonists') && TOOL_FILES.repair[0]!.desc.includes("Ship files can't be healed: SWAP or DELETE them."));
check('INSPECT on AUTOBURN.skl: it flies the capture into the ring or until a trim is left',
  UPGRADE_FILE_TEXT.autoburn.desc.includes('it flies the capture for you, into the ring or until a trim is left')
  && !UPGRADE_FILE_TEXT.autoburn.desc.includes('until the loop closes'));

finish();
