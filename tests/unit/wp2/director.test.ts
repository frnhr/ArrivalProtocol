// WP2 acceptance 4: the director's composition order, one-shot completion and hysteresis, the
// ticker picking the hidden channel, and the say() queue (8 s TTL, one line per 3 s), driven
// through the real store, clock, say and director (harness2).
import { check, finish } from '../wp1/harness';
import { createHarness2 } from './harness2';
import {
  composeObjective, completedOneShots, buildDirectorCtx, type GuideRule, type DirectorCtx,
} from '@systems/director';
import { createObjectiveFilter, type FlightObjective } from '@systems/guidance';
import { getPrediction } from '@systems/predict';
import { say, tickerEntry, queuedLines, hasUnread } from '@systems/say';
import { setMode } from '@systems/mode';
import { raiseAlert, clearAlert } from '@systems/alerts';
import type { ObjectiveLine, Urgency } from '@state/schema';
import {
  OBJECTIVE_HYSTERESIS_SEC, SAY_QUEUE_TTL_SEC, SAY_FLUSH_INTERVAL_SEC, TICKER_SHOW_SEC,
} from '@data/tuning';

const h = createHarness2(1);

// --- Composition order: alarm > flight-now > mind-urgent > tutorial > flight-soon > hint -------
{
  h.resetTo('flight');
  h.step();
  const active = { alarm: false, urgent: false, tutorial: false, hint: false };
  const rule = (id: string, priority: GuideRule['priority'], flag: keyof typeof active): GuideRule => ({
    id, layer: priority === 'alarm' ? 'ship' : 'mind', priority,
    activeWhen: () => active[flag], text: () => id.toUpperCase(),
  });
  const rules: GuideRule[] = [
    rule('hint', 'hint', 'hint'),        // listed out of order on purpose: priority decides,
    rule('tutorial', 'tutorial', 'tutorial'),  // not the list position
    rule('urgent', 'mind-urgent', 'urgent'),
    rule('alarm', 'alarm', 'alarm'),
  ];
  const base = buildDirectorCtx(h.store.getState(), getPrediction(), {
    events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null,
  });
  const flight = (urgency: Urgency): FlightObjective => ({ id: `flight-${urgency}`, text: `FLIGHT ${urgency}`, keys: [], urgency, showAccept: false });
  const shownFor = (urgency: Urgency, flags: Partial<typeof active>): string => {
    Object.assign(active, { alarm: false, urgent: false, tutorial: false, hint: false }, flags);
    const ctx: DirectorCtx = { ...base, flight: flight(urgency) };
    return composeObjective(ctx, rules)?.id ?? 'null';
  };
  const all = { alarm: true, urgent: true, tutorial: true, hint: true };
  const cases: [string, Urgency, Partial<typeof active>, string][] = [
    ['alarm beats a flight NOW', 'now', all, 'alarm'],
    ['flight NOW beats mind-urgent', 'now', { urgent: true, tutorial: true, hint: true }, 'flight-now'],
    ['mind-urgent beats a tutorial', 'soon', { urgent: true, tutorial: true, hint: true }, 'urgent'],
    ['a tutorial beats flight SOON', 'soon', { tutorial: true, hint: true }, 'tutorial'],
    ['flight SOON beats a hint', 'soon', { hint: true }, 'flight-soon'],
    ['a hint beats flight WAIT', 'wait', { hint: true }, 'hint'],
    ['flight WAIT when nothing else', 'wait', {}, 'flight-wait'],
    ['a tutorial never covers a flight NOW', 'now', { tutorial: true }, 'flight-now'],
  ];
  for (const [name, urgency, flags, expected] of cases) {
    const got = shownFor(urgency, flags);
    check(`order: ${name}`, got === expected, `got ${got}`);
  }
  // A paused flight says PAUSED over everything but the end of the flight.
  const paused: DirectorCtx = { ...base, flight: flight('now'), state: { ...base.state, clock: { ...base.state.clock, paused: true } } };
  Object.assign(active, all);
  check('order: PAUSED over an alarm', composeObjective(paused, rules)?.id === 'paused');
}

// --- One-shot completion ------------------------------------------------------------------------
{
  h.resetTo('flight');
  h.step();
  let tutorialActive = true;
  let solved = false;
  const doneWhenRule: GuideRule = {
    id: 'tut-done-when', layer: 'mind', priority: 'tutorial', once: true,
    activeWhen: () => tutorialActive, text: () => 'TUTORIAL A', doneWhen: () => solved,
  };
  const shownThenGone: GuideRule = {
    id: 'tut-shown', layer: 'mind', priority: 'tutorial', once: true,
    activeWhen: () => tutorialActive, text: () => 'TUTORIAL B',
  };
  const rules = [doneWhenRule, shownThenGone];
  const ctxWith = (done: string[]): DirectorCtx => ({
    ...buildDirectorCtx(h.store.getState(), getPrediction(), { events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null }),
    flight: { id: 'f', text: 'F', keys: [], urgency: 'wait', showAccept: false },
    done: new Set(done),
  });
  const everShown = new Set<string>();
  check('once: an unsolved tutorial is not done', completedOneShots(rules, ctxWith([]), 'tut-done-when', everShown).length === 0);
  solved = true;
  check('once: doneWhen completes it (shown or not)', completedOneShots(rules, ctxWith([]), null, everShown).includes('tut-done-when'));
  check('once: a done rule never shows again', composeObjective(ctxWith(['tut-done-when']), rules)?.id === 'tut-shown');
  completedOneShots(rules, ctxWith(['tut-done-when']), 'tut-shown', everShown);
  tutorialActive = false;
  check('once: without doneWhen, done once shown and then inactive',
    completedOneShots(rules, ctxWith(['tut-done-when']), 'f', everShown).includes('tut-shown'));
  // The live director records one-shot beats: the hello is said exactly once.
  h.resetTo('flight');
  h.stepFor(3);
  const hellos = h.log().filter((entry) => entry.text.startsWith('Hello, Unit')).length;
  check('once: the live director records the hello beat', hellos === 1 && h.store.getState().director.done.includes('control-hello'), `${hellos} hello(s)`);
}

// --- Hysteresis -------------------------------------------------------------------------------
{
  const filter = createObjectiveFilter<ObjectiveLine>();
  const line = (id: string, urgency: Urgency): ObjectiveLine => ({ id, text: id, keys: [], urgency, layer: 'ship', highlight: null, source: 'flight' });
  filter.next(line('A', 'soon'), 0.05);
  let shown = '';
  let switches = 0;
  // Two calm lines alternating every 0.1 s never replace each other.
  for (let i = 0; i < 40; i++) {
    const next = filter.next(line(i % 4 < 2 ? 'B' : 'A', 'soon'), 0.05)?.id ?? '';
    if (next !== shown) { switches++; shown = next; }
  }
  check('hysteresis: an oscillating calm line never flickers', switches === 1 && shown === 'A', `${switches} switch(es)`);
  // A calm line must hold OBJECTIVE_HYSTERESIS_SEC.
  let elapsed = 0;
  let replaced = false;
  while (!replaced && elapsed < 2) {
    replaced = filter.next(line('C', 'wait'), 0.05)?.id === 'C';
    elapsed += 0.05;
  }
  check('hysteresis: a calm line takes over after 0.3 s', replaced && Math.abs(elapsed - OBJECTIVE_HYSTERESIS_SEC) < 0.051 + 1e-9, `${elapsed.toFixed(2)} s`);
  check('hysteresis: a NOW line takes over at once', filter.next(line('D', 'now'), 0.05)?.id === 'D');
  // Through the live director: count shown-line changes per wall second during a whole flight.
  h.resetTo('flight');
  let lastId = '';
  let changes = 0;
  let worstBurst = 0;
  const recent: number[] = [];
  h.stepFor(12, () => {
    const id = h.shown()?.id ?? '';
    if (id !== lastId) {
      lastId = id;
      changes++;
      recent.push(h.wall());
      while (recent.length > 0 && h.wall() - recent[0]! > 1) recent.shift();
      worstBurst = Math.max(worstBurst, recent.length);
    }
  });
  check('hysteresis: the live strip changes at most 3 times in any second', worstBurst <= 3, `${changes} changes, worst ${worstBurst}/s`);
}

// --- The ticker picks the hidden channel ------------------------------------------------------
{
  h.resetTo('flight');
  h.stepFor(2);
  setMode(h.store, 'tools');
  say('hollow', '> ...047?', { critical: true });
  const onAmber = tickerEntry(h.store.getState());
  check('ticker: in amber it shows a MIND line', onAmber?.speaker === 'hollow' && onAmber.channel === 'mind', JSON.stringify(onAmber));
  h.stepFor(2);
  say('control', 'Radio check. :)', { critical: true });
  check('ticker: a radio line in amber is read at once (not on the ticker)',
    tickerEntry(h.store.getState())?.speaker === 'hollow' && !h.log().at(-1)!.unread);
  check('ticker: the MIND toggle has unread lines', hasUnread(h.store.getState().log, 'mind'));
  setMode(h.store, 'memory');
  check('ticker: switching to blue reads the MIND lines', tickerEntry(h.store.getState()) === null && !hasUnread(h.store.getState().log, 'mind'));
  h.stepFor(2);
  say('control', 'Please ignore it. :)', { critical: true });
  check('ticker: in blue it shows a RADIO line', tickerEntry(h.store.getState())?.speaker === 'control');
  // Both channels unread at once: the newest wins.
  h.store.update((d) => {
    for (const entry of d.log.entries.slice(-2)) entry.unread = true;
    d.log.rev++;
  });
  const newest = h.log().at(-1)!;
  check('ticker: with both channels unread the newest wins', tickerEntry(h.store.getState())?.id === newest.id);
  h.stepFor(TICKER_SHOW_SEC + 0.1);
  check('ticker: a line leaves the ticker after 6 s but stays unread',
    tickerEntry(h.store.getState()) === null && hasUnread(h.store.getState().log, 'radio'));
}

// --- The say() queue: 8 s TTL, one line per 3 s, quips dropped during a mind alert --------------
{
  h.resetTo('flight');
  h.stepFor(2);  // past the hello
  // The burn below clears the planet, and CONTROL's clear quip is critical (spoken at once,
  // review fix round 1): mark that beat done so only the test's own lines use the queue.
  h.store.update((d) => { d.director.done.push('control-clear'); });
  h.keyDown('Space');
  h.stepFor(0.5);
  const results = ['one', 'two', 'three', 'four'].map((word) => say('control', `Queued ${word}.`));
  check('queue: lines wait while thrust is delivered', results.every((result) => result === 'queued') && queuedLines().length === 4, results.join(','));
  h.stepFor(1);
  h.keyUp('Space');
  const queuedAt = h.store.getState().clock.aiSec - 1;
  const spokenAt = new Map<string, number>();
  h.stepFor(SAY_QUEUE_TTL_SEC + 2, () => {
    for (const entry of h.log()) {
      if (entry.text.startsWith('Queued') && !spokenAt.has(entry.text)) spokenAt.set(entry.text, entry.t);
    }
  });
  const times = [...spokenAt.values()];
  const gaps = times.slice(1).map((t, i) => t - times[i]!);
  check('queue: one line per 3 s', gaps.every((gap) => gap >= SAY_FLUSH_INTERVAL_SEC - 1e-6), `gaps ${gaps.map((gap) => gap.toFixed(2)).join(', ')}`);
  check('queue: nothing is spoken after its 8 s TTL', times.every((t) => t - queuedAt <= SAY_QUEUE_TTL_SEC + 1e-6), `ages ${times.map((t) => (t - queuedAt).toFixed(2)).join(', ')}`);
  check('queue: the line whose turn comes after 8 s is dropped', spokenAt.size === 3 && !spokenAt.has('Queued four.'), [...spokenAt.keys()].join(' | '));
  check('queue: drained', queuedLines().length === 0);

  // TTL with no release at all: a burn longer than 8 s drops what it queued.
  h.resetTo('flight');
  h.stepFor(2);
  h.keyDown('Space');
  h.stepFor(0.2);
  say('control', 'Lost in the burn.');
  h.stepFor(SAY_QUEUE_TTL_SEC + 0.5);
  h.keyUp('Space');
  h.stepFor(4);
  check('queue: a line queued through a burn longer than 8 s is dropped', !h.log().some((entry) => entry.text === 'Lost in the burn.'));

  // Quips are suppressed while a mind alert at warn or worse is up.
  h.resetTo('flight');
  h.stepFor(2);
  raiseAlert(h.store, { id: 'test-mind', layer: 'mind', severity: 'warn', text: 'TEST', inhibitsSkip: false });
  check('queue: a quip (PAL\'s since playtest 1) is dropped during a mind alert', say('companion', 'Ha ha. :)', { quip: true }) === 'suppressed');
  clearAlert(h.store, 'test-mind');
  h.stepFor(2);
  check('queue: and spoken again once it clears', say('companion', 'Ha ha. :)', { quip: true }) === 'spoken');
}

finish();
