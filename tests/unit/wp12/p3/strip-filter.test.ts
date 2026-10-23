// WP12 part 3: the director's strip filter (guidance.ts createObjectiveFilter with the director's two rules).
// • The lead's ruling 3 (2026-10-21 06:20): once a RELEASE row shows, a line asking to keep holding SPACE replaces it
//   only after the hysteresis, though both are urgent (an over-held trim flickered `KEEP HOLDING — shrink the loop
//   into the ring` / `RELEASE [SPACE]! — next: brake at ▼ in 0:04` at 20 Hz).
// • The WP9 verify minor: a line replacing a dodge countdown (`· 0:01 to dodge`) shows at once (it stood up to 0.3 s
//   under the TOO LATE TO DODGE stamp).
import { check, finish } from '../../wp1/harness';
import { createObjectiveFilter, releaseHolds, dodgeCountdownEnds } from '@systems/guidance';
import type { Urgency } from '@state/schema';
import { OBJECTIVE_HYSTERESIS_SEC } from '@data/tuning';

interface Line { id: string; urgency: Urgency; keys: readonly string[] }
const DT = 0.05;
const filter = createObjectiveFilter<Line>({ holdsAgainst: releaseHolds, passesAt: dodgeCountdownEnds });
const keep: Line = { id: 'F11-keep', urgency: 'now', keys: ['SPACE'] };
const next: Line = { id: 'F5-next', urgency: 'now', keys: ['SPACE'] };
const ready: Line = { id: 'F11-ready', urgency: 'soon', keys: [] };

// The flicker, as the trace had it: keep, next, keep, next, keep, next… every tick.
filter.reset();
filter.next(keep, DT);
const shownIds: string[] = [];
for (let i = 0; i < 8; i++) shownIds.push(filter.next(i % 2 === 0 ? next : keep, DT)?.id ?? '');
check('KEEP HOLDING ⇄ RELEASE — next every tick: the strip says RELEASE and stays there', shownIds.every((id) => id === 'F5-next'), shownIds.join(' '));

// A real return to holding still shows, after the hysteresis.
filter.reset();
filter.next(next, DT);
let shown = '';
let ticks = 0;
while (shown !== 'F11-keep' && ticks < 40) { shown = filter.next(keep, DT)?.id ?? ''; ticks++; }
check(`…a lasting KEEP HOLDING takes over after the hysteresis (${OBJECTIVE_HYSTERESIS_SEC} s)`, shown === 'F11-keep'
  && Math.abs(ticks * DT - OBJECTIVE_HYSTERESIS_SEC) <= DT + 1e-9, `${(ticks * DT).toFixed(2)} s`);

// Into RELEASE is never held back (it ends a burn).
filter.reset();
filter.next(keep, DT);
check('KEEP HOLDING → RELEASE switches at once', filter.next(next, DT)?.id === 'F5-next');
// A RELEASE row to a line that does not ask for SPACE follows the normal rules ('now' at once).
filter.reset();
filter.next(next, DT);
check('RELEASE → HOLD STEADY (now, no SPACE) switches at once', filter.next({ id: 'F3b', urgency: 'now', keys: [] }, DT)?.id === 'F3b');
filter.reset();
filter.next(next, DT);
check('RELEASE → GET READY (soon) waits the hysteresis as before', filter.next(ready, DT)?.id === 'F5-next');

// The dodge's lapse.
const countdown: Line = { id: 'F8-debris-hold', urgency: 'now', keys: ['SPACE'] };
const late: Line = { id: 'F8-debris-late-hold', urgency: 'soon', keys: ['SPACE'] };
const mindLine: Line = { id: 'hollow-eating', urgency: 'soon', keys: [] };
filter.reset();
filter.next(countdown, DT);
check('`· 0:01 to dodge` → `too late to dodge` (a soon line) switches at once', filter.next(late, DT)?.id === 'F8-debris-late-hold');
filter.reset();
filter.next(countdown, DT);
check('`· 0:01 to dodge` → any other line (a mind line) switches at once', filter.next(mindLine, DT)?.id === 'hollow-eating');
filter.reset();
filter.next(late, DT);
check('…but `too late to dodge` → a mind line waits the hysteresis as before', filter.next(mindLine, DT)?.id === 'F8-debris-late-hold');
filter.reset();
filter.next({ id: 'F6-resume', urgency: 'now', keys: ['SPACE'] }, DT);
check('F6-resume\'s countdown ending switches at once too', filter.next(ready, DT)?.id === 'F11-ready');

finish();
