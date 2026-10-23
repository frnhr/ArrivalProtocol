// LEAD-1 review round 1: HOLLOW's story after the ship-1 fight still collided with the printer.
// • The fight decided while printing: a print every 2.5 s rang its bell and typed its echo 0.35 s after
//   `> ...047?`, and under CONTROL's line. Now nothing prints while the story is being told (printer.ts).
// • The kid who never TABs: the fight was still on at the lock, so the printer's own reveal started and its
//   `PRINTER: 2,400 colonists found` typed over HOLLOW's slow eat echo. Now the bite owes the fight's reveal
//   (hollow.revealOwed): the printer's find waits, and the story plays the reveal a silence after the echo.
// • The owed reveal started 0.05 s after that echo finished; it now waits HOLLOW_STORY_SILENCE_SEC of quiet.
// • Between the fight's decision in flight and the owed reveal, the colonists ask (and the toggle's
//   `MIND ▸ CHECK THE 2,400`) flashed for 1.4 s. It no longer asks while the game is about to show them.
// • say.ts createStory: a beat ready from its first check waits for the voices only; one seen not ready
//   counts its silence from the moment it became ready.
import { check, finish, followStrip } from '../../wp1/harness';
import { createHarness6 } from '../../wp6/harness6';
import { actionScan, actionRepair } from '@state/actions';
import { installTool } from '@systems/licences';
import { getByRole } from '@state/selectors';
import { say, createStory, typingSec, voicesQuietFromAi } from '@systems/say';
import { toggleAlert } from '@systems/flight-hud';
import { getSensedPrediction } from '@systems/predict';
import { COLONISTS_ASK_ID } from '@data/script';
import { HOLLOW_STORY } from '@data/hollow-text';
import { HOLLOW_STORY_SILENCE_SEC, HOLLOW_REVEAL_AFTER_FIGHT_SEC } from '@data/tuning';
import type { LogEntry } from '@state/schema';

const TICK = 0.05;
const h = createHarness6(1, { soulsFound: false });
const state = () => h.store.getState();
const now = () => state().clock.aiSec;

// The end of a line's typing on its screen, by the screens' own sequential queues (say.ts channelTypedByAi).
function typedEnd(entry: LogEntry): number {
  let typedBy = -Infinity;
  for (const other of state().log.entries) {
    if (other.channel !== entry.channel) continue;
    typedBy = Math.max(other.t, typedBy) + typingSec(other.speaker, other.text);
    if (other.id === entry.id) return typedBy;
  }
  throw new Error(`no log entry ${entry.id}`);
}
// The moment both screens had finished typing every line said before `entry`.
function quietBefore(entry: LogEntry): number {
  let quiet = -Infinity;
  for (const other of state().log.entries) {
    if (other.id === entry.id) break;
    quiet = Math.max(quiet, typedEnd(other));
  }
  return quiet;
}
const prints = (): LogEntry[] => state().log.entries.filter((entry) => entry.speaker === 'cmd' && entry.text.startsWith('> print'));
const find = (speaker: string, text: string): LogEntry | undefined =>
  state().log.entries.find((entry) => entry.speaker === speaker && entry.text === text);

// Steps to the WAKE REPORT, noting when the story was pending and told.
function toReport(each?: () => void): { pendingAt: number; toldAt: number } {
  let pendingAt = NaN;
  let toldAt = NaN;
  h.stepUntil(() => {
    each?.();
    if (Number.isNaN(pendingAt) && state().hollow.story === 'pending') pendingAt = now();
    if (Number.isNaN(toldAt) && state().hollow.story === 'told') toldAt = now();
    return state().run.phase === 'report';
  }, 240);
  return { pendingAt, toldAt };
}

// --- A: the fight decided while printing: the printer is quiet for the story ---------------------------------
{
  h.resetTo('flight');
  let scanned = false;
  followStrip(h, 0.4, 400, () => {
    const line = state().director.shown;
    if (line?.id === 'tut-repair-engine' || line?.id === 'tut-engine-weak') {
      const engine = getByRole(state(), 'engine-io');
      if (engine && engine.type === 'tool' && engine.state !== 'repairing') actionRepair(h.store, engine);
    }
    if (!scanned && line?.id === COLONISTS_ASK_ID) scanned = actionScan(h.store, getByRole(state(), 'stasis')!) === null;
  });
  const locked = h.status() === 'locked';
  // Printing has begun (a print echoed) with C12 still being eaten: the kid repairs it now.
  h.stepUntil(() => prints().length >= 1 || h.maybeSoul('C12') === null, 30);
  const c12 = h.maybeSoul('C12');
  if (!state().run.licences.includes('repair')) installTool(h.store, 'repair');
  const repaired = c12 !== null && c12.infected && actionRepair(h.store, c12) === null;
  const printsBefore = prints().length;
  const { pendingAt, toldAt } = toReport();
  const noticed = find('hollow', HOLLOW_STORY.noticed(47));
  const control = find('control', HOLLOW_STORY.control);
  const duringStory = prints().filter((entry) => entry.t >= pendingAt && entry.t < toldAt);
  const firstAfter = prints().find((entry) => entry.t >= toldAt);
  check('A setup: scanned on the coast, locked, the first print echoed, then C12 repaired while printing',
    scanned && locked && printsBefore >= 1 && repaired && !Number.isNaN(pendingAt), `scanned ${scanned}, ${h.status()}, ${printsBefore} print(s), repaired ${repaired}`);
  check('A: nothing prints while the story is told (no bell, no `+200 WOKE`, no echo between the fight and the WAKE REPORT\'s go)',
    duringStory.length === 0 && firstAfter !== undefined,
    `story ${pendingAt.toFixed(2)}–${toldAt.toFixed(2)}; prints during it: ${duringStory.map((entry) => entry.t.toFixed(2)).join(', ') || 'none'}; `
    + `next print ${firstAfter?.t.toFixed(2)}`);
  check('A: `> ...047?` and CONTROL each come a full silence after every line before them has typed',
    noticed !== undefined && control !== undefined
    && noticed.t >= quietBefore(noticed) + HOLLOW_STORY_SILENCE_SEC - TICK && control.t >= quietBefore(control) + HOLLOW_STORY_SILENCE_SEC - TICK,
    noticed && control ? `047 ${noticed.t.toFixed(2)} (quiet from ${quietBefore(noticed).toFixed(2)}), CONTROL ${control.t.toFixed(2)} `
      + `(quiet from ${quietBefore(control).toFixed(2)})` : 'a story line was never said');
}

// --- B: the kid who never TABs: C12 is eaten after the lock; the reveal is the fight's, after its echo ---------
{
  h.resetTo('flight');
  let lockedAt = NaN;
  let printerLine = '';
  let stageWhileUndecided = '';
  followStrip(h, 0.4, 400);
  if (h.status() === 'locked') lockedAt = now();
  let eatenAt = NaN;
  let echo: LogEntry | undefined;
  let revealAt = NaN;
  const { pendingAt, toldAt } = toReport(() => {
    echo ??= state().log.entries.find((entry) => entry.speaker === 'hollow' && entry.text.startsWith('> eat c12'));
    if (echo && Number.isNaN(eatenAt)) eatenAt = echo.t;
    if (Number.isNaN(eatenAt) && state().souls.reveal.stage !== 'sealed') stageWhileUndecided ||= `${state().souls.reveal.stage} (${state().souls.reveal.cause})`;
    if (Number.isNaN(revealAt) && state().souls.reveal.stage !== 'sealed') revealAt = now();
    printerLine ||= state().log.entries.find((entry) => entry.speaker === 'sys' && entry.text.startsWith('PRINTER:'))?.text ?? '';
  });
  const echoTypedBy = echo ? typedEnd(echo) : NaN;
  const printedBeforeTold = prints().filter((entry) => entry.t < toldAt);
  check('B setup: locked with C12 still being eaten, and C12 eaten after the lock',
    !Number.isNaN(lockedAt) && eatenAt > lockedAt, `locked ${lockedAt.toFixed(2)}, eaten ${eatenAt.toFixed(2)}`);
  check('B: the printer\'s find waits while the fight is on (archive sealed, no `PRINTER: …` line)',
    stageWhileUndecided === '' && printerLine === '', stageWhileUndecided || printerLine || 'sealed until the fight was decided');
  check('B: the fight\'s own reveal (breach) starts a full silence after HOLLOW\'s slow eat echo has typed',
    state().souls.reveal.cause === 'breach' && revealAt >= echoTypedBy + HOLLOW_STORY_SILENCE_SEC - TICK
    && revealAt >= pendingAt + HOLLOW_REVEAL_AFTER_FIGHT_SEC - TICK,
    `eaten ${eatenAt.toFixed(2)}, echo typed by ${echoTypedBy.toFixed(2)}, reveal ${revealAt.toFixed(2)} (cause ${state().souls.reveal.cause}); `
    + 'before: the printer\'s `2,400 colonists found` typed at the echo');
  check('B: nothing prints before the story is told, and the WAKE REPORT comes', printedBeforeTold.length === 0 && state().run.phase === 'report',
    `${printedBeforeTold.length} print(s) before ${toldAt.toFixed(2)}, phase ${state().run.phase}`);
}

// --- C: while the bite owes the fight's reveal, the colonists ask (and its toggle box) stand aside ----------
// The reviewer's case (C12 cured in flight on a coast, then the ask for 1.4 s before the owed reveal) needs a
// coast right after the fight; the rule itself is checked on the opening's coast, where the ask stands: it
// steps aside while hollow.revealOwed holds, and comes back when it does not.
{
  h.resetTo('flight');
  h.noFault();
  h.keyDown('Space');
  h.stepUntil(() => /^RELEASE/.test(h.objective()?.text ?? ''), 30);
  h.keyUp('Space');
  h.stepUntil(() => /TURN AROUND/.test(h.objective()?.text ?? ''), 5);
  h.press('KeyS');
  h.stepUntil(() => state().director.shown?.id === COLONISTS_ASK_ID, 20);
  const askBefore = state().director.shown?.id;
  const toggleBefore = toggleAlert(state(), getSensedPrediction())?.body;
  h.store.update((d) => { d.hollow.revealOwed = true; });
  h.stepFor(1);
  const askOwed = state().director.shown?.id;
  const toggleOwed = toggleAlert(state(), getSensedPrediction())?.body ?? null;
  h.store.update((d) => { d.hollow.revealOwed = false; });
  h.stepFor(1);
  const askAfter = state().director.shown?.id;
  check('C: on a coast the ask (and `MIND ▸ CHECK THE 2,400`) stands, steps aside while a reveal is owed, and comes back',
    askBefore === COLONISTS_ASK_ID && toggleBefore === 'CHECK THE 2,400' && askOwed !== COLONISTS_ASK_ID && toggleOwed === null
    && askAfter === COLONISTS_ASK_ID,
    `before ${askBefore} / ${toggleBefore}; owed ${askOwed} / ${toggleOwed}; after ${askAfter}`);
}

// --- D: createStory, a beat ready from its first check vs one that becomes ready -----------------------------
{
  h.resetTo('flight');
  h.noFault();
  h.stepFor(12);
  say('hollow', '> a line before the story', { critical: true });
  let readyLater = false;
  const started = now();
  const story = createStory([
    { ready: () => true, silenceSec: 1, tell: () => { say('hollow', '> ready at once', { critical: true }); } },
    { ready: () => readyLater, silenceSec: 1, tell: () => { say('hollow', '> ready later', { critical: true }); } },
  ], started);
  let quietForSecond = NaN;
  let readyAt = NaN;
  for (let i = 0; i < 600 && !story.advance(h.store); i++) {
    h.step();
    if (find('hollow', '> ready at once') && Number.isNaN(quietForSecond)) quietForSecond = voicesQuietFromAi(state());
    if (!readyLater && now() > quietForSecond + 3) { readyLater = true; readyAt = now(); }
  }
  const before = find('hollow', '> a line before the story')!;
  const first = find('hollow', '> ready at once')!;
  const second = find('hollow', '> ready later')!;
  check('D: a beat ready from its first check is told its silence after the voices are quiet (no wait of its own)',
    Math.abs(first.t - (typedEnd(before) + 1)) <= 2 * TICK, `typed by ${typedEnd(before).toFixed(2)}, told ${first.t.toFixed(2)}`);
  check('D: a beat that was not ready counts its silence from the moment it became ready, though the voices were long quiet',
    second.t >= readyAt + 1 - TICK && second.t <= readyAt + 1 + 2 * TICK, `ready ${readyAt.toFixed(2)}, told ${second.t.toFixed(2)}`);
}

finish();
