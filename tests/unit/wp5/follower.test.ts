// WP5 acceptance 5, slice 1a: the WP1 literal follower (it obeys the flight table and nothing else: no TAB, no repair)
// flies run 1's ship 1. There is no sealed archive any more (the drivers are files from the start), so nothing holds
// SKIP for the colonists: the follower never has a SKIP refused, it locks, and the lock starts the LANDING with all
// three pods aboard; landed instantly (tests/unit/support/landing-instant.ts), the run reaches the LANDING REPORT with
// all 600 colonists down. A second kid also follows the hurt-driver lesson (`POD 02 WILL LAND HARD — REPAIR its
// driver`) and arrives with POD 02 healed.
// The landing by the strip ([L] on the windows) is tests/unit/landing/ (Track SIM).
import { check, finish, followStrip } from '../wp1/harness';
import { createHarness5 } from './harness5';
import { colonistCounts } from '@state/selectors';
import { actionRepair } from '@state/actions';
import { installTool } from '@systems/licences';
import { setLandingMode } from '../support/landing-instant';

const h = createHarness5(1);

{
  h.resetTo('flight');
  setLandingMode('manual');
  const before = h.events.length;
  followStrip(h, 0.4, 400, () => undefined);
  check('the follower locks', h.status() === 'locked', `${h.status()} at ${h.wall().toFixed(1)} s`);
  check('the follower never had a SKIP refused (no colonists\' hold: the drivers were never sealed)',
    !h.events.slice(before).some((event) => event.name === 'refused'),
    h.events.slice(before).filter((event) => event.name === 'refused').map((event) => JSON.stringify(event.payload)).join(' '));
  h.step();
  const state = h.store.getState();
  check('the lock starts the LANDING: every pod aboard, the bay loaded, the landing\'s clock started', state.run.phase === 'landing'
    && colonistCounts(state).aboard === 600 && state.landing.bay.loaded > 0 && state.landing.startedAtTSec !== null,
    `${state.run.phase} bay ${state.landing.bay.loaded} started ${state.landing.startedAtTSec}`);
  const lockedAt = h.wall();
  setLandingMode('instant');
  h.stepUntil(() => h.store.getState().run.phase === 'report', 60);
  const counts = colonistCounts(h.store.getState());
  check('landed instantly, the LANDING REPORT follows with all 600 down in LZ-A', h.store.getState().run.phase === 'report'
    && counts.landedInLz === 600 && h.souls().length === 0, `${h.store.getState().run.phase} after ${(h.wall() - lockedAt).toFixed(1)} s, ${JSON.stringify(counts)}`);
  console.log(`      locked at ${lockedAt.toFixed(1)} s, report at ${h.wall().toFixed(1)} s`);
}

{
  // The kid who also does what the mind asks, from the ship screen (the action itself; the lesson's TAB, chip and click
  // are the e2e tier's): REPAIR POD 02 once the strip names it.
  h.resetTo('flight');
  setLandingMode('manual');
  let repaired = false;
  let asked = false;
  followStrip(h, 0.4, 400, () => {
    const state = h.store.getState();
    const line = state.director.shown;
    if (!repaired && line?.id === 'tut-hurt-driver-tab') {
      asked = true;
      if (!state.run.licences.includes('repair')) installTool(h.store, 'repair');
      repaired = actionRepair(h.store, h.soul('POD 02')) === null;
    }
  });
  check('the strip asks for POD 02 (the hurt-driver lesson) during the flight', asked);
  check('the lesson-following kid locks too, having repaired POD 02 on the way', h.status() === 'locked' && repaired && h.soul('POD 02').integrity === 100,
    `${h.status()} repaired=${repaired}`);
  setLandingMode('instant');
  h.stepUntil(() => h.store.getState().run.phase === 'report', 60);
  check('…and lands all 600', colonistCounts(h.store.getState()).landedInLz === 600);
}

finish();
