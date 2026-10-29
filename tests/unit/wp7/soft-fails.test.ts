// WP7 acceptance 3 (§4.3, §9 WP7 item 6): the soft fails, headless, on the real systems.
// • run 1, ship 1: the first crash is "a simulation" (ship 1 starts over, once); the second crash with
//   AI Comms usable is an EMERGENCY TRANSMIT: the next ship, Core −25 and 3 extra transit hits;
// • a crash with AI Comms dead → the run ends: STAYED;
// • the Core eaten to 0 on ship 1 → EMERGENCY (the Core comes back at 25, clean); on the last ship →
//   OVERWRITTEN;
// • BEAM OUT: refused on run 1's ship 1, without comms, and on a ship that is not doomed; offered on an
//   impact within 20 tactical s or a tank that can't lift ▼ out of the planet; cancelled by the kid or by
//   the path clearing the planet; when it fills before the impact the ship is ABANDONED (+2 hits).
import { check, finish } from '../wp1/harness';
import { createHarness7 } from './harness7';
import { continueAfterLoss, lossPlan, startBeamOut, cancelBeamOut } from '@systems/run';
// WP7 fix round 1: run.ts no longer re-exports BEAM OUT's readers.
import { beamOutRefusal, beamOutProgress, shipDoomed } from '@systems/beam-out';
import { infectNow } from '@systems/hollow';
import { getPrediction } from '@systems/predict';
import { getByRole, hasIntegrity } from '@state/selectors';
import { LINES } from '@data/script';
import { BEAM_OUT_TAC, BEAM_OUT_EXTRA_HITS, EMERGENCY_EXTRA_HITS, EMERGENCY_CORE_HIT, CORE_RESET_INTEGRITY } from '@data/tuning';
import { getShip } from '@data/ships';
import type { SegmentRole } from '@/types/segment';

const h = createHarness7(5, { soulsFound: false });
const state = () => h.store.getState();
const integrity = (role: SegmentRole): number => {
  const file = getByRole(state(), role);
  if (!file || !hasIntegrity(file)) throw new Error(`no ${role}`);
  return file.integrity;
};

// The ship falls straight at the planet from `altitudeKm`, `speed` km/s inward (an impact course).
function plunge(altitudeKm: number, speed: number): void {
  const r = state().level.planet.R + altitudeKm;
  h.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = -speed; d.orbit.vy = 0.05; });
}

function crashNow(): void {
  plunge(20, 3);
  h.stepUntil(() => h.status() !== 'approaching', 10);
}

function bootToFlight(): void {
  h.stepUntil(() => state().run.phase === 'flight', 15);
}

// --- Run 1, ship 1: the simulation, then the emergency transmit --------------------------------------
{
  h.newRun(5);
  h.store.update((d) => { d.run.phase = 'flight'; d.ui.mode = 'tools'; });
  crashNow();
  check('run 1 ship 1, the first crash: CRASHED, the LOST card waits', h.status() === 'crashed' && state().clock.paused);
  check('…its plan is the simulation', lossPlan(state()).kind === 'simulation');
  const rev = state().run.rev;
  continueAfterLoss(h.store);
  check('…ship 1 starts over (boot, ship 1, the world reset once), no ship recorded',
    state().run.phase === 'boot' && state().run.shipIndex === 0 && state().run.rev === rev + 1 && state().run.ships.length === 0
    && state().run.simulationRetryUsed, `${state().run.phase} ${state().run.shipIndex}`);
  check('…CONTROL: "That was a simulation. :) Again."', state().log.entries.some((entry) => entry.speaker === 'control' && entry.text === LINES.simulation()));
  check('…the licences start over (fresh unit), the pods all aboard again',
    state().run.licences.join() === 'scan' && state().landing.pods.every((record) => record.fate.kind === 'aboard'));
  bootToFlight();
  const coreBefore = integrity('core');
  crashNow();
  check('the second crash: its plan is EMERGENCY TRANSMIT (Core −25, +3 hits)', (() => {
    const plan = lossPlan(state());
    return plan.kind === 'transmit' && plan.extraHits === EMERGENCY_EXTRA_HITS && plan.coreHit === EMERGENCY_CORE_HIT;
  })(), JSON.stringify(lossPlan(state())));
  continueAfterLoss(h.store);
  check('…the run goes to TRANSMIT with ship 1 recorded as crashed, its 600 colonists NOT LAUNCHED', state().run.phase === 'transmit'
    && state().run.ships[0]?.outcome === 'crashed' && state().run.ships[0]?.notLaunched === 600 && state().run.ships[0]?.landedInLz === 0,
    JSON.stringify(state().run.ships[0]));
  h.transmit();
  const hits = state().run.arrival?.hits ?? [];
  const toll = hits[0];
  const coreHits = hits.slice(1).filter((hit) => hit.role === 'core').reduce((sum, hit) => sum + hit.from - hit.to, 0);
  check('…next ship (HALCYON), the Core −25 first in the log, then the 3 + 3 transit hits',
    state().run.shipIndex === 1 && toll?.role === 'core' && toll.from === coreBefore && toll.to === coreBefore - EMERGENCY_CORE_HIT
    && hits.length === 1 + getShip(1).arrival!.transitHits + EMERGENCY_EXTRA_HITS, JSON.stringify(hits));
  check('…the Core arrives at 100 − 25 − its transit hits', Math.abs(integrity('core') - (coreBefore - EMERGENCY_CORE_HIT - coreHits)) < 1e-9,
    `${integrity('core')}`);
}

// --- A crash with AI Comms dead: STAYED ---------------------------------------------------------------
{
  h.newRun(6);
  h.store.update((d) => { d.run.phase = 'flight'; d.ui.mode = 'tools'; d.run.simulationRetryUsed = true; });
  h.setIntegrity('comms', 10);
  crashNow();
  check('comms dead, crashed: the plan ends the run (STAYED)', (() => {
    const plan = lossPlan(state());
    return plan.kind === 'end' && plan.cause === 'stayed';
  })());
  continueAfterLoss(h.store);
  check('…RUN END: stayed', state().run.phase === 'end' && state().run.endCause === 'stayed' && state().run.ships.length === 1);
}

// --- The Core eaten to 0 -----------------------------------------------------------------------------------
{
  h.newRun(7);
  h.store.update((d) => { d.run.phase = 'flight'; d.ui.mode = 'tools'; });
  const core = getByRole(state(), 'core')!;
  infectNow(h.store, core);
  h.store.update((d) => { if (core.type === 'core') core.integrity = 0.5; d.ui.memoryRev++; });
  h.stepUntil(() => state().run.coreLost, 5);
  check('Core 0 on ship 1: the ship is lost (coreLost), its plan is EMERGENCY (Core reset)', state().run.coreLost && (() => {
    const plan = lossPlan(state());
    return plan.kind === 'transmit' && plan.coreReset && plan.extraHits === EMERGENCY_EXTRA_HITS;
  })(), JSON.stringify(lossPlan(state())));
  continueAfterLoss(h.store);
  check('…recorded as emergency', state().run.ships[0]?.outcome === 'emergency');
  h.transmit();
  const coreNow = getByRole(state(), 'core')!;
  check('…on HALCYON the Core is back at 25 and clean', integrity('core') === CORE_RESET_INTEGRITY && coreNow.type === 'core' && !coreNow.infected
    && !state().run.coreLost, `${integrity('core')}`);
  bootToFlight();
  // WP9: HALCYON is no longer the last ship: its Core eaten is an EMERGENCY to KESTREL, and the last ship is that one.
  const onHalcyon = getByRole(state(), 'core')!;
  infectNow(h.store, onHalcyon);
  h.store.update((d) => { if (onHalcyon.type === 'core') onHalcyon.integrity = 0.5; d.ui.memoryRev++; });
  h.stepUntil(() => state().run.coreLost, 5);
  check('Core 0 on HALCYON (not the last ship any more): EMERGENCY again', lossPlan(state()).kind === 'transmit', JSON.stringify(lossPlan(state())));
  continueAfterLoss(h.store);
  h.transmit();
  bootToFlight();
  // WP10: KESTREL is not the last ship either: its Core eaten is an EMERGENCY to VESPER, the last ship now.
  const onKestrel = getByRole(state(), 'core')!;
  infectNow(h.store, onKestrel);
  h.store.update((d) => { if (onKestrel.type === 'core') onKestrel.integrity = 0.5; d.ui.memoryRev++; });
  h.stepUntil(() => state().run.coreLost, 5);
  check('Core 0 on KESTREL (not the last ship any more): EMERGENCY again', lossPlan(state()).kind === 'transmit', JSON.stringify(lossPlan(state())));
  continueAfterLoss(h.store);
  h.transmit();
  bootToFlight();
  // WP11: VESPER is not the last ship either: its Core eaten is an EMERGENCY to LAST LIGHT, the flagship and the last ship.
  const onVesper = getByRole(state(), 'core')!;
  infectNow(h.store, onVesper);
  h.store.update((d) => { if (onVesper.type === 'core') onVesper.integrity = 0.5; d.ui.memoryRev++; });
  h.stepUntil(() => state().run.coreLost, 5);
  check('Core 0 on VESPER (not the last ship any more): EMERGENCY again', lossPlan(state()).kind === 'transmit', JSON.stringify(lossPlan(state())));
  continueAfterLoss(h.store);
  h.transmit();
  bootToFlight();
  const last = getByRole(state(), 'core')!;
  infectNow(h.store, last);
  h.store.update((d) => { if (last.type === 'core') last.integrity = 0.5; d.ui.memoryRev++; });
  h.stepUntil(() => state().run.coreLost, 5);
  continueAfterLoss(h.store);
  check('Core 0 on the last ship (LAST LIGHT): OVERWRITTEN', state().run.phase === 'end' && state().run.endCause === 'overwritten'
    && state().level.shipName === 'LAST LIGHT', `${state().run.phase} ${state().run.endCause} ${state().level.shipName}`);
}

// --- BEAM OUT --------------------------------------------------------------------------------------------
{
  h.newRun(8);
  h.store.update((d) => { d.run.phase = 'flight'; d.ui.mode = 'tools'; });
  plunge(1000, 3);
  h.step();
  check('BEAM OUT: refused on run 1\'s ship 1 (the tutorial)', beamOutRefusal(state(), getPrediction()) === 'tutorial');
  // Run 2 (WP8 counts the runs): ship 1 is no longer the tutorial. (WP8 fix round 1: the tutorial is its own
  // flag, the archive's tutorialDone, not the wave: a returning unit has both.)
  h.newRun(8);
  h.store.update((d) => { d.run.phase = 'flight'; d.ui.mode = 'tools'; d.run.wave = 2; d.run.tutorial = false; });
  h.step();
  check('…refused while the ship is not doomed (the opening crash course with a full tank)',
    beamOutRefusal(state(), getPrediction()) === 'not-doomed', `${beamOutRefusal(state(), getPrediction())}`);
  h.store.mutate((d) => { d.burn.fuelPct = 0; });
  h.step();
  check('…offered when the tank can no longer lift ▼ out of the planet', shipDoomed(state(), getPrediction())
    && beamOutRefusal(state(), getPrediction()) === null);
  h.store.mutate((d) => { d.burn.fuelPct = 100; });
  plunge(1000, 3);
  h.step();
  check('…offered when the impact is within 20 tactical s', beamOutRefusal(state(), getPrediction()) === null);
  h.setIntegrity('comms', 10);
  check('…refused with AI Comms dead', beamOutRefusal(state(), getPrediction()) === 'no-comms');
  h.setIntegrity('comms', 100);
  startBeamOut(h.store);
  h.stepFor(2);
  check('…the kid cancels it: the bar goes', cancelBeamOut(h.store) && state().run.beamOut === null);
  // The orbit fixed under the bar: a closed loop in the ring, no impact.
  startBeamOut(h.store);
  h.step();
  const mu = state().level.planet.mu;
  const r = (state().level.ring.min + state().level.ring.max) / 2;
  h.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(mu / r); });
  h.stepFor(1);
  check('…the path clears the planet under the bar: BEAM OUT cancels itself', state().run.beamOut === null);
  // The race: the impact 15 tactical s away, the bar 6.
  plunge(1000, 3);
  h.step();
  const impactPred = getPrediction();
  const before = state().clock.tSec;
  check('…started on a doomed ship', startBeamOut(h.store) === null);
  h.stepUntil(() => h.status() !== 'approaching', 30);
  const tookTac = (state().clock.tSec - before) / state().level.tacticalWarp;
  check('BEAM OUT fills in 6 tactical s, before the impact: ABANDONED', h.status() === 'abandoned' || state().run.shipIndex === 1,
    `${h.status()} after ${tookTac.toFixed(2)} tac s (impact was ${(impactPred.impactInSec ?? 0) / state().level.tacticalWarp} tac s out)`);
  check('…the bar took BEAM_OUT_TAC', Math.abs(tookTac - BEAM_OUT_TAC) < 0.2, tookTac.toFixed(2));
  check('…the unit goes straight on (no card): TRANSMIT, ship 1 recorded as abandoned, +2 hits planned',
    state().run.phase === 'transmit' && state().run.ships[0]?.outcome === 'abandoned' && state().run.transit?.extraHits === BEAM_OUT_EXTRA_HITS,
    `${state().run.phase} ${JSON.stringify(state().run.transit)}`);
  h.transmit();
  check('…HALCYON arrives with 3 + 2 transit hits', (state().run.arrival?.hits.length ?? 0) === getShip(1).arrival!.transitHits + BEAM_OUT_EXTRA_HITS,
    `${state().run.arrival?.hits.length}`);
  check('the progress readout is null when not beaming', beamOutProgress(state()) === null);
}

finish();
