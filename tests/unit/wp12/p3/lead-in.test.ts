// WP12 part 3: a lesson's lead-in (GuideRule.leadInSec, keyed by GuideRule.lesson; the lead's ruling 4 of 2026-10-21 06:20 for VESPER's COPY
// lesson, and the WP11 verifier's belt item). For its first LESSON_LEAD_IN_SEC on the strip a lesson outranks the
// mind-urgent lines (HOLLOW's eating and wall lines); after that the normal order holds. Alarms, the flight's NOW
// lines and a mind-urgent line marked outranksLeadIn (a verb's three seconds, the finale) always come first.
// composeObjective with stand-in rules on a real context (VESPER coasting: its flight line is a WAIT), then the real
// rules: the four lesson rules carry the lead-in, every verb and finale rule outranks it.
import { check, finish } from '../../wp1/harness';
import { createHarness7 } from '../../wp7/harness7';
import { buildDirectorCtx, composeObjective, type GuideRule } from '@systems/director';
import { getPrediction } from '@systems/predict';
import { GUIDE_RULES } from '@data/script';
import { LESSON_LEAD_IN_SEC } from '@data/tuning';

const h = createHarness7(1);
h.shipAlone(3, 1);
for (let i = 0; i < 20; i++) h.step();

const live = { urgent: true, lesson: true, verb: false, alarm: false };
const rule = (id: string, priority: GuideRule['priority'], on: () => boolean, extra: Partial<GuideRule> = {}): GuideRule =>
  ({ id, layer: 'mind', priority, activeWhen: on, text: () => id, ...extra });
const rules: GuideRule[] = [
  rule('alarm', 'alarm', () => live.alarm),
  // In GUIDE_RULES the verbs come before HOLLOW's eating lines too.
  rule('verb', 'mind-urgent', () => live.verb, { outranksLeadIn: true }),
  rule('eating', 'mind-urgent', () => live.urgent),
  // WP12 fix round 1: the lead-in is keyed by lesson, so a lesson's wordings share it. Final fix pass: the key is
  // GuideRule.lesson and the length leadInSec (the lesson also keys maxShownSec and the one-shot completion).
  rule('lesson', 'tutorial', () => live.lesson, { lesson: 'lesson', leadInSec: LESSON_LEAD_IN_SEC }),
];
const shownWith = (leadSec: number): string | undefined => {
  const ctx = buildDirectorCtx(h.store.getState(), getPrediction(), {
    events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null, leadShownSec: new Map([['lesson', leadSec]]),
  });
  if (ctx.flight?.urgency === 'now') throw new Error(`the context's flight line is NOW (${ctx.flight.text}): pick a coast`);
  return composeObjective(ctx, rules)?.id;
};

check('a fresh lesson outranks HOLLOW\'s eating line (its lead-in)', shownWith(0) === 'lesson', String(shownWith(0)));
check(`…still ${LESSON_LEAD_IN_SEC - 0.1} s into its time on the strip`, shownWith(LESSON_LEAD_IN_SEC - 0.1) === 'lesson');
check(`…and after ${LESSON_LEAD_IN_SEC} s on the strip the eating line comes first again`, shownWith(LESSON_LEAD_IN_SEC) === 'eating', String(shownWith(LESSON_LEAD_IN_SEC)));
live.verb = true;
check('a verb\'s countdown (outranksLeadIn) stands in front of a lesson\'s lead-in', shownWith(0) === 'verb', String(shownWith(0)));
live.verb = false;
live.alarm = true;
check('an alarm stands in front of a lesson\'s lead-in', shownWith(0) === 'alarm', String(shownWith(0)));
live.alarm = false;
live.urgent = false;
check('with nothing urgent the lesson shows as any tutorial does', shownWith(LESSON_LEAD_IN_SEC + 5) === 'lesson');

// The real rules.
const withLeadIn = GUIDE_RULES.filter((candidate) => candidate.leadInSec !== undefined).map((candidate) => candidate.id).sort();
check('the lead-in lessons: VESPER\'s COPY and LAST LIGHT\'s belt, both wordings, and the arm\'s no-Swap lesson\'s three wordings (slice 3b review)',
  JSON.stringify(withLeadIn) === JSON.stringify(['belt-move', 'belt-move-tab', 'tut-copy-repair', 'tut-copy-repair-tab', 'tut-ghost-noswap', 'tut-ghost-noswap-fly', 'tut-ghost-noswap-tab']), withLeadIn.join(', '));
check('every lead-in is a tutorial', GUIDE_RULES.every((candidate) => candidate.leadInSec === undefined || candidate.priority === 'tutorial'));
const outranking = GUIDE_RULES.filter((candidate) => candidate.outranksLeadIn === true);
check('every verb and finale line outranks a lead-in, and each is mind-urgent',
  outranking.some((candidate) => candidate.id === 'hollow-verb') && outranking.some((candidate) => candidate.id === 'hollow-verb-tab')
  && outranking.some((candidate) => candidate.id === 'finale-choice') && outranking.every((candidate) => candidate.priority === 'mind-urgent'),
  outranking.map((candidate) => candidate.id).join(', '));

check('…and so does the bitten-again MOVE ask (LAST LIGHT: the belt lesson\'s lead-in hid it, and the strip-follower reached the choice with MERGE\'s charge in 39 of 198 runs instead of 155)',
  outranking.some((candidate) => candidate.id === 'hollow-move-again') && outranking.some((candidate) => candidate.id === 'hollow-move-again-tab'));

finish();
