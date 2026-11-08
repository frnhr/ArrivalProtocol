// Slice 2 (slice-2-plan §6.2: "wp6/hollow-sim and wp6/follower → the calm ship-1 follower"). Phase 2's ship-1 fight (POD
// 01 bitten as the loop closes, `> ...047?`, the story holding the report) moved to VESPER's arrival with the ARRIVAL stage
// (Track THREAT's threat/arrival-story). What stays here is ship 1 as it flies now, calm (04 §3.2), flown by the WP1
// literal follower (the flight table's capture timings, reaction 0.4 s) with HOLLOW mounted as on the page:
// • full engine, 40% engine (the ENGINE I/O FAULT never repaired) and one Core thread busy the whole flight (THRUST LIMIT
//   75%): the follower locks every time, and nothing bites: no HOLLOW block, no infection, HOLLOW never wakes;
// • the 40% engine flown by the strip (a kid who burns and never TABs): it locks, and the strip never shows an alarm;
// • the landing (instant, tests/unit/support/landing-instant.ts) reaches the LANDING REPORT promptly: no HOLLOW story to
//   wait for (01-landing §2; slice-2-plan §3.3), and the pause stops nothing that isn't there.
import '../support/classic-world';
import { check, finish, followStrip } from '../wp1/harness';
import { createHarness6 } from './harness6';
import { reserveThread, releaseThread } from '@systems/ops-core';
import { colonistCounts } from '@state/selectors';
import { LANDING_DONE_LINGER_SEC } from '@data/tuning';

const h = createHarness6(1, { soulsFound: true });

interface Flight {
  lockedAt: number;
  status: string;
  bites: number;
  everAwake: boolean;
}

// Flies ship 1 with the follower until the flight ends. `prepare` runs on the fresh state.
function fly(prepare: () => void): Flight {
  h.resetTo('flight');
  prepare();
  const start = h.events.length;
  let everAwake = false;
  followStrip(h, 0.4, 400, () => { if (h.store.getState().hollow.phase === 'awake') everAwake = true; });
  const bites = h.events.slice(start).filter((event) => event.name === 'hollow-infect').length;
  return { lockedAt: h.wall(), status: h.status(), bites, everAwake };
}

const report = (flight: Flight): string => `${flight.status} at ${flight.lockedAt.toFixed(1)} s, ${flight.bites} bites, awake ${flight.everAwake}`;
const calm = (flight: Flight): boolean => flight.bites === 0 && !flight.everAwake && h.hollowBlocks().length === 0
  && !h.store.getState().alerts.list.some((alert) => alert.id.startsWith('hollow') || alert.id.startsWith('eaten:'));

// --- Full engine: locks, nothing bites, the report comes promptly -------------------------------------------------------
{
  const flight = fly(() => h.noFault());
  check('full engine: the follower locks', flight.status === 'locked', report(flight));
  check('full engine: a calm ship: no HOLLOW block, no bite, HOLLOW never wakes, no HOLLOW alert', calm(flight), report(flight));
  let storyPending = false;
  let downAt: number | null = null;
  h.stepUntil(() => {
    const state = h.store.getState();
    if (state.hollow.story === 'pending') storyPending = true;
    if (downAt === null && state.landing.ended !== null) downAt = state.clock.aiSec;
    return state.run.phase === 'report';
  }, 60);
  const state = h.store.getState();
  check('the landing reaches the LANDING REPORT with all 600 down, no HOLLOW story to wait for',
    state.run.phase === 'report' && colonistCounts(state).down === 600 && !storyPending && state.hollow.story !== 'pending',
    `${state.run.phase} ${JSON.stringify(colonistCounts(state))}`);
  check(`…promptly: within the linger (${LANDING_DONE_LINGER_SEC} s) and a second of the landing's end`,
    downAt !== null && state.clock.aiSec - downAt <= LANDING_DONE_LINGER_SEC + 1, `${downAt === null ? 'never ended' : (state.clock.aiSec - downAt).toFixed(1)} s`);
  h.checkMemory();
}

// --- 40% engine: the fault never repaired ---------------------------------------------------------------------------
{
  const flight = fly(() => undefined);
  check('40% engine (ENGINE I/O FAULT never repaired): the follower still locks, and nothing bites', flight.status === 'locked'
    && calm(flight), report(flight));
}

// --- 40% engine, flown by the strip (what a kid reads, not guidance's objective) ---------------------------------
// The kid who chose to burn rather than hack: does what the strip says about SPACE and the presets, and never TABs.
{
  h.resetTo('flight');
  let holding = false;
  const setHolding = (on: boolean): void => {
    if (on && !holding) h.keyDown('Space');
    if (!on && holding) h.keyUp('Space');
    holding = on;
  };
  // The WP1 follower's reactions (wp1/harness followStrip), on the strip's text.
  const react = (text: string): void => {
    const keyMatch = text.match(/press \[([WASD])\]/);
    if (/RELEASE|TOO EARLY|WAIT|TURN AROUND/.test(text)) {
      setHolding(false);
      if (keyMatch) h.press(`Key${keyMatch[1]}`);
    } else {
      if (keyMatch) h.press(`Key${keyMatch[1]}`);
      if (/hold \[SPACE\]|KEEP HOLDING|NOW/.test(text)) setHolding(true);
    }
    if (text.includes('[F]')) h.press('KeyF');
  };
  const queue: { at: number; text: string }[] = [];
  let lastText = '';
  let alarmShown = '';
  const end = h.wall() + 400;
  while (h.status() === 'approaching' && h.wall() < end) {
    h.step();
    const shown = h.shown();
    if (shown?.id.startsWith('alarm-') && alarmShown === '') alarmShown = shown.text;
    const text = shown?.text ?? '';
    if (text !== lastText) { lastText = text; queue.push({ at: h.wall() + 0.4, text }); }
    while (queue.length > 0 && queue[0]!.at <= h.wall() + 1e-9) react(queue.shift()!.text);
  }
  setHolding(false);
  check('40% engine, flown by the strip: locks, and no alarm ever stood on the strip (nothing attacks on ship 1)',
    h.status() === 'locked' && alarmShown === '' && h.hollowBlocks().length === 0, `${h.status()}, alarm: ${alarmShown || 'none'}`);
}

// --- One busy thread the whole flight -------------------------------------------------------------------------------
{
  const flight = fly(() => { h.noFault(); reserveThread('wp6-busy'); });
  releaseThread('wp6-busy');
  check('1 busy thread (THRUST LIMIT 75%): the follower locks, and nothing bites', flight.status === 'locked' && calm(flight), report(flight));
}

finish();
