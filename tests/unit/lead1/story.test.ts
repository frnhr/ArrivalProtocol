// @ts-nocheck: TODO(slice1a-TESTS): this suite still reads phase 2's souls / printer (cluster codes, print results) and is
// moved onto the landing per slice-1a-plan §5. F2 turned type-checking off here so tsc over tests stays green meanwhile.
// LEAD-1 item 6: HOLLOW's story after the ship-1 fight counted only the TERMINAL's typing. Two leftovers
// from WP6's verify:
// • after an owed reveal, CONTROL's radio quip (`Oh, you found them! …`) typed right up to `> ...047?`;
// • on the lose path the owed reveal's first line typed while HOLLOW's slow eat echo was still typing.
// The story is now a say.ts createStory sequence (reusable: WP7 scripts HALCYON's wake lines with it): each
// beat waits until BOTH screens have typed everything said before it, plus its own silence.
import { check, finish, followStrip } from '../wp1/harness';
import { createHarness6 } from '../wp6/harness6';
import {
  say, createStory, typingSec, mindTypedByAi, radioTypedByAi, voicesQuietFromAi, channelTypedByAi, queuedLines,
} from '@systems/say';
import { actionRepair } from '@state/actions';
import { HOLLOW_STORY } from '@data/hollow-text';
import { HOLLOW_STORY_SILENCE_SEC, HOLLOW_REVEAL_AFTER_FIGHT_SEC } from '@data/tuning';
import type { LogEntry } from '@state/schema';

const TICK = 0.05;
const h = createHarness6(1, { soulsFound: false });
const state = () => h.store.getState();
const now = () => state().clock.aiSec;
const typedEnd = (entry: LogEntry): number => {
  // The end of this line's typing on its screen, by the screens' own sequential queues.
  let typedBy = -Infinity;
  for (const other of state().log.entries) {
    if (other.channel !== entry.channel) continue;
    typedBy = Math.max(other.t, typedBy) + typingSec(other.speaker, other.text);
    if (other.id === entry.id) return typedBy;
  }
  throw new Error(`no log entry ${entry.id}`);
};
const typedStart = (entry: LogEntry): number => typedEnd(entry) - typingSec(entry.speaker, entry.text);
const find = (speaker: string, text: string): LogEntry | undefined =>
  state().log.entries.find((entry) => entry.speaker === speaker && entry.text === text);

// --- The helper ---------------------------------------------------------------------------------------
{
  h.resetTo('flight');
  h.noFault();
  h.stepFor(12); // the opening's own lines are said and typed
  const quietAt = voicesQuietFromAi(state());
  check('helper: the voices are quiet after the opening (both screens typed, nothing queued)',
    quietAt <= now() && queuedLines().length === 0, `quiet from ${quietAt.toFixed(2)}, now ${now().toFixed(2)}`);

  const started = now();
  let readyNow = false;
  const story = createStory([
    { tell: () => { say('hollow', '> one', { critical: true }); } },
    { silenceSec: 1.5, tell: () => { say('control', 'Two. :)', { critical: true }); } },
    { afterSec: 2.5, tell: () => { say('hollow', '> three', { critical: true }); } },
    { ready: () => readyNow, tell: () => { say('hollow', '> four', { critical: true }); } },
  ], started);
  let interrupted = false;
  for (let i = 0; i < 400 && !story.advance(h.store); i++) {
    h.step();
    // A radio line in the middle of the wait for beat 2 (not part of the story).
    if (!interrupted && now() > started + 0.6) { interrupted = true; say('sys', 'SHIP NOTICE: a radio line in between', { critical: true }); }
    if (find('hollow', '> three') && now() > started + 9) readyNow = true;
  }
  const one = find('hollow', '> one')!;
  const between = find('sys', 'SHIP NOTICE: a radio line in between')!;
  const two = find('control', 'Two. :)')!;
  const three = find('hollow', '> three')!;
  const four = find('hollow', '> four')!;
  check('helper: the first beat is told at once', Math.abs(one.t - started) < TICK + 1e-6, `${(one.t - started).toFixed(2)} s`);
  check('helper: beat 2 waits for the silence after BOTH screens have typed (the radio line in between too)',
    two.t >= Math.max(typedEnd(one), typedEnd(between)) + 1.5 - TICK && two.t <= Math.max(typedEnd(one), typedEnd(between)) + 1.5 + 2 * TICK,
    `one typed by ${typedEnd(one).toFixed(2)}, the radio line by ${typedEnd(between).toFixed(2)}, two at ${two.t.toFixed(2)}`);
  check('helper: afterSec counts from the beat before it was told', three.t >= two.t + 2.5 - TICK && three.t >= typedEnd(two) - TICK,
    `two ${two.t.toFixed(2)} (typed by ${typedEnd(two).toFixed(2)}), three ${three.t.toFixed(2)}`);
  check('helper: ready holds a beat until it holds', four.t >= started + 9, `four at +${(four.t - started).toFixed(2)} s`);

  // A queued line (not critical, said right after another) holds the next beat until it is said and typed.
  h.stepFor(3);
  say('control', 'A first quip. :)');
  say('control', 'A queued quip. :)');
  const queued = queuedLines().length;
  const waitStart = now();
  const held = createStory([{ tell: () => { say('hollow', '> after the queue', { critical: true }); } }], waitStart);
  for (let i = 0; i < 400 && !held.advance(h.store); i++) h.step();
  const quip = find('control', 'A queued quip. :)')!;
  const after = find('hollow', '> after the queue')!;
  check('helper: a line waiting in the say() queue holds the story until it has been said and typed',
    queued === 1 && after.t >= typedEnd(quip) - TICK,
    `queued ${queued}; quip said ${quip.t.toFixed(2)}, typed by ${typedEnd(quip).toFixed(2)}, the beat at ${after.t.toFixed(2)}`);
  check('helper: channelTypedByAi is the screens\' own model (mind and radio)',
    channelTypedByAi(state(), 'mind') === mindTypedByAi(state()) && channelTypedByAi(state(), 'radio') === radioTypedByAi(state()));
}

// --- Ship 1, the lose path with the reveal owed: the reveal waits for HOLLOW's slow eat echo ---------------
// The never-scan kid flies; the moment C12 is bitten (sealed: the breach opens C12 alone) the test drops
// it to 3% so it is eaten in flight: the fight is decided with the archive still sealed.
{
  h.resetTo('flight');
  h.noFault();
  let dropped = false;
  let eatenAtAi = NaN;
  let revealAtAi = NaN;
  let echoTypedBy = NaN;
  followStrip(h, 0.4, 400, () => {
    const c12 = h.maybeSoul('C12');
    if (!dropped && c12?.infected) { dropped = true; h.store.mutate(() => { c12.integrity = 3; }); }
    const echo = state().log.entries.find((entry) => entry.speaker === 'hollow' && entry.text.startsWith('> eat c12'));
    if (echo && Number.isNaN(eatenAtAi)) { eatenAtAi = echo.t; echoTypedBy = typedEnd(echo); }
    if (!Number.isNaN(eatenAtAi) && Number.isNaN(revealAtAi) && state().souls.reveal.stage !== 'sealed') revealAtAi = now();
  });
  h.stepUntil(() => state().hollow.story === 'told' || state().run.phase === 'report', 120);
  const noticed = find('hollow', HOLLOW_STORY.noticed(47));
  check('lose path: C12 was eaten in flight, the archive still sealed, and the owed reveal (breach) played',
    dropped && !Number.isNaN(eatenAtAi) && state().souls.reveal.cause === 'breach', `cause ${state().souls.reveal.cause}`);
  check('lose path: the owed reveal starts only once the slow eat echo has typed out (and ≥ 1.5 s after the fight)',
    revealAtAi >= echoTypedBy - TICK && revealAtAi >= eatenAtAi + HOLLOW_REVEAL_AFTER_FIGHT_SEC - TICK,
    `eaten ${eatenAtAi.toFixed(2)}, echo typed by ${echoTypedBy.toFixed(2)}, reveal at ${revealAtAi.toFixed(2)} `
    + `(before LEAD-1: ${(eatenAtAi + HOLLOW_REVEAL_AFTER_FIGHT_SEC).toFixed(2)}, under the echo)`);
  check('lose path: `> ...047?` after the reveal, the radio\'s quip and every echo have typed, plus the silence',
    noticed !== undefined && noticed.t >= voiceQuietBefore(noticed) + HOLLOW_STORY_SILENCE_SEC - TICK,
    noticed ? `047 at ${noticed.t.toFixed(2)}, quiet from ${voiceQuietBefore(noticed).toFixed(2)}` : 'never said');
}

// The moment both screens had finished typing every line said before `entry`.
function voiceQuietBefore(entry: LogEntry): number {
  let quiet = -Infinity;
  for (const other of state().log.entries) {
    if (other.id >= entry.id) break;
    quiet = Math.max(quiet, typedEnd(other));
  }
  return quiet;
}

// --- Ship 1, the cure path with the reveal owed: the radio's quip, then a real pause, then `> ...047?` ------
// The kid repairs C12 the moment it is bitten (the WP6 follower's second kid): the fight is decided in
// flight, the owed reveal plays, and CONTROL says `Oh, you found them! …` on the radio at its end.
{
  h.resetTo('flight');
  h.noFault();
  let repaired = false;
  followStrip(h, 0.4, 400, () => {
    const c12 = h.maybeSoul('C12');
    if (!repaired && c12?.infected) repaired = actionRepair(h.store, c12) === null;
  });
  h.stepUntil(() => state().hollow.story === 'told' || state().run.phase === 'report', 160);
  const quip = find('control', 'Oh, you found them! Please handle with care. :)');
  const noticed = find('hollow', HOLLOW_STORY.noticed(47));
  const control = find('control', HOLLOW_STORY.control);
  check('cure path: C12 saved in flight, the owed reveal played, CONTROL found them on the radio',
    repaired && state().souls.reveal.cause === 'breach' && quip !== undefined, `cause ${state().souls.reveal.cause}`);
  check('cure path: `> ...047?` comes a full silence after the radio\'s quip has typed (it used to type right up to it)',
    quip !== undefined && noticed !== undefined && typedStart(noticed) >= typedEnd(quip) + HOLLOW_STORY_SILENCE_SEC - TICK,
    quip && noticed ? `quip ${quip.t.toFixed(2)}–${typedEnd(quip).toFixed(2)}, 047 from ${typedStart(noticed).toFixed(2)}` : 'missing');
  // No two story lines type at the same time, across the two screens: the quip, HOLLOW's line and
  // CONTROL's (a print's echo is the printer's, and the printer does not wait for the story).
  const storyLine = (entry: LogEntry): boolean => entry === quip || entry === noticed || entry === control;
  const window = state().log.entries.filter(storyLine);
  let overlap = '';
  for (const first of window) {
    for (const second of window) {
      if (first.id >= second.id || first.channel === second.channel) continue;
      if (typedStart(second) < typedEnd(first) - 1e-6 && typedStart(first) < typedEnd(second) - 1e-6) overlap ||= `'${first.text}' / '${second.text}'`;
    }
  }
  check('cure path: the quip, `> ...047?` and CONTROL never type at the same time',
    overlap === '' && control !== undefined, overlap || `${window.length} lines, CONTROL at ${control?.t.toFixed(2)}`);
}

finish();
