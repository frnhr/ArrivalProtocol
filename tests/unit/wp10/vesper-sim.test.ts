// WP10 acceptance 2 (§9 WP10), the lean part: VESPER's ghost thrust and the SWAP tool, on a lean harness (the store, the
// clock heartbeat, orbit-sim, the ops core and the voice), with the warp pinned at VESPER's CRUISE (×80), so 200 coasts
// take seconds. (The follower with the pip → SWAP defender is tests/unit/wp10/vesper-flow.test.ts: it needs every system.)
// • Thrust Ctrl at 31%, unfixed through the coast with RETRO pointed (VESPER's start preset), lowers ▼ by 300–900 km,
//   mean over 200 seeds, measured at the original capture's START BURN; the bursts are 1 tac s at 15% each. (WP12: the
//   window and the burst now scale with GHOST_BY_BAND.failing; see below.)
// • A SWAP at boot + 20 AI s (the SWAP tool, 2.0 s, a thread held): 0 bursts start after it completes, on 50 seeds; a
//   burst running at the swap's end is silenced at once.
// • SWAP's rules: Thrust.alt takes the role and the name, the primary is `Thrust.old` and inactive, both are scanned;
//   the backup keeps its OWN integrity and health word (the lead's item 1: a damaged backup used to read intact) and its
//   infection (§9 WP10 edge case); refused on a busy file (either one), on a ship file with no backup, on a file that
//   is not a ship file; clicking the backup swaps the pair; a cancel changes nothing; the thread is held meanwhile.
import { check, finish } from '../wp1/harness';
import { createStore } from '@state/store';
import type { GameState } from '@state/schema';
import type { Segment } from '@/types/segment';
import { createInitialState } from '@state/initial';
import { advance } from '@systems/clock';
import { resetWorld } from '@systems/reset';
import { mountOrbitSim } from '@systems/orbit-sim';
import { computePrediction, mountPredictor } from '@systems/predict';
import { mountOpsCore, threadsBusy, getOps, cancelOp } from '@systems/ops-core';
import { mountSay } from '@systems/say';
import { installTool } from '@systems/licences';
import { freshUnitRacks } from '@systems/carry';
import { capabilitiesNow } from '@systems/capabilities';
import { actionSwap, actionScan } from '@state/actions';
import { on } from '@systems/events';
import { getByRole, hasIntegrity, filesWithRole, type HealthSegment } from '@state/selectors';
import { elementsFromState } from '@/types/orbit';
import { getShip } from '@data/ships';
import { TOOL_REFUSAL } from '@data/tool-text';
import { SWAP_SEC, GHOST_BY_BAND } from '@data/tuning';
import { byDepth } from '../depth';

// WP12 part 1 (the 200-seed playthrough) retuned the failing controller from §3.3's 15% every 25 tac s to
// GHOST_BY_BAND.failing (30% every 10 tac s), so the checks below read the spec from the data. The drift window
// scales with the bursts' Δv per tactical second (amp ÷ mean interval) from the one measured at §3.3's numbers
// (300–900 km at 0.15 ÷ 25).
const FAILING = GHOST_BY_BAND.failing;
if (!FAILING) throw new Error('vesper-sim: no failing ghost spec');
const DRIFT_SCALE = (FAILING.amp / FAILING.meanIntervalTac) / (0.15 / 25);

const VESPER = 3;
const TICK = 0.05;
// Quick depth (tests/unit/depth.ts): 10 seeds for the drift's mean (30 seeds measured 2,974 km against the 1,500–4,500
// band, so 10 keep it inside), 5 for the SWAP (the slice 2 review's tier trim; it was 20 and 10); full: the WP's 200 and
// 50. A multiple of 10: the 10th–90th detail indexes by it.
const SEEDS = byDepth(10, 200);
const SWAP_SEEDS = byDepth(5, 50);
const ship = getShip(VESPER);
const CRUISE = ship.flight.cruiseWarp;

const store = createStore<GameState>(createInitialState({ seed: 1, shipIndex: VESPER, carried: freshUnitRacks(ship) }));
mountOrbitSim(store);
mountPredictor(store);
mountOpsCore(store);
mountSay(store);
const state = () => store.getState();
let starts = 0;
on('ghost-start', () => { starts++; });

function fresh(seed: number): void {
  store.update((d) => {
    Object.assign(d, createInitialState({ seed, shipIndex: VESPER, carried: freshUnitRacks(ship) }));
    d.clock.speed = CRUISE;
    d.clock.speedTarget = CRUISE;
  });
  resetWorld();
  starts = 0;
}

// Ship files (the ones this suite swaps) always carry an integrity, a health word and an infection slot.
function thrustFile(): HealthSegment {
  const file = getByRole(state(), 'thrust-ctrl');
  if (!file || !hasIntegrity(file)) throw new Error('no Thrust Ctrl with an integrity');
  return file;
}

function seg(name: string): HealthSegment {
  const found = state().memory.find((candidate) => candidate.name === name);
  if (!found || !hasIntegrity(found)) throw new Error(`no ${name} with an integrity`);
  return found;
}

function integrityOf(file: Segment): number {
  if (!hasIntegrity(file)) throw new Error(`${file.name} has no integrity`);
  return file.integrity;
}

// The game time of the original capture's START BURN (the end of the coast) and ▼ at the start.
function coastEnd(): { endTSec: number; rp0: number } {
  const pred = computePrediction(state());
  if (!pred.burnPoint) throw new Error('VESPER opens with no capture burn point');
  return { endTSec: state().clock.tSec + pred.burnPoint.inSec, rp0: pred.rp };
}

function runUntil(tSec: number): void {
  while (state().clock.tSec < tSec - 1e-9 && state().burn.status === 'approaching') advance(store, TICK);
}

// --- The arrival ---------------------------------------------------------------------------------------------------
{
  fresh(1);
  const file = thrustFile();
  const backup = seg('Thrust.alt');
  check('VESPER arrives with its Thrust Ctrl at 31%, unscanned (a ship file: hidden), and Thrust.alt at 100',
    hasIntegrity(file) && file.integrity === 31 && file.type === 'ship' && !file.scanned && integrityOf(backup) === 100,
    `${file.name} ${integrityOf(file)} scanned ${'scanned' in file ? file.scanned : '-'}`);
  check(`…failing: a burst about every ${FAILING.meanIntervalTac} tac s, ${FAILING.amp * 100}% for ${FAILING.durTac} tac s (C2, WP12's tuning)`,
    capabilitiesNow(state()).thrustCtrl.band === 'failing' && capabilitiesNow(state()).thrustCtrl.ghost === FAILING);
  check('…the flight opens with ▼ at 5,600 km (in the ring) and RETRO engaged', state().burn.sasMode === 'retrograde'
    && Math.abs(computePrediction(state()).rp - 5600) < 1, `rp ${computePrediction(state()).rp.toFixed(1)}`);
}

// --- The drift over the coast, 200 seeds -------------------------------------------------------------------------
{
  let drop = 0;
  let bursts = 0;
  let dv = 0;
  // The seeds whose last burst ended inside the coast (none cut by its end): their bursts are all whole.
  let wholeBursts = 0;
  let wholeDv = 0;
  const drops: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    fresh(seed);
    const { endTSec, rp0 } = coastEnd();
    runUntil(endTSec);
    const rp = elementsFromState(state().orbit, state().level.planet.mu).rp;
    drops.push(rp0 - rp);
    drop += rp0 - rp;
    bursts += starts;
    dv += state().burn.dvDeliveredKmS;
    if (state().burn.ghost === null) {
      wholeBursts += starts;
      wholeDv += state().burn.dvDeliveredKmS;
    }
  }
  const mean = drop / SEEDS;
  const meanBursts = bursts / SEEDS;
  drops.sort((a, b) => a - b);
  check(`unfixed through the coast with RETRO pointed, ▼ sinks ${(300 * DRIFT_SCALE).toFixed(0)}–${(900 * DRIFT_SCALE).toFixed(0)} km (mean over ${SEEDS} seeds)`,
    mean >= 300 * DRIFT_SCALE && mean <= 900 * DRIFT_SCALE,
    `mean ${mean.toFixed(0)} km (median ${drops[SEEDS / 2]!.toFixed(0)}, 10th–90th ${drops[SEEDS / 10]!.toFixed(0)}–${drops[SEEDS * 0.9]!.toFixed(0)}), `
    + `${meanBursts.toFixed(1)} bursts, ${((dv / bursts) * 1000).toFixed(1)} m/s each`);
  // A burst still running when the coast's span ends is cut there, so it is measured on the seeds whose bursts all
  // ended inside the coast (with fewer seeds in quick depth one cut burst moved the all-seed mean past 0.5%).
  check(`…each burst delivers ${FAILING.amp * 100}% × 5 m/s² × ${FAILING.durTac} tac s (×30) = ${(FAILING.amp * 5 * FAILING.durTac * 30).toFixed(1)} m/s (within 0.5%, the bursts no coast end cut)`,
    wholeBursts > 0 && Math.abs(wholeDv / wholeBursts / (FAILING.amp * 0.005 * FAILING.durTac * 30) - 1) < 0.005,
    `${((wholeDv / wholeBursts) * 1000).toFixed(4)} m/s over ${wholeBursts} bursts (all: ${((dv / bursts) * 1000).toFixed(4)})`);
}

// --- A SWAP at boot + 20 AI s, SWAP_SEEDS seeds --------------------------------------------------------------------------
{
  let after = 0;
  let swapped = 0;
  let silencedAtOnce = true;
  for (let seed = 1; seed <= SWAP_SEEDS; seed++) {
    fresh(seed);
    installTool(store, 'swap');
    const { endTSec } = coastEnd();
    while (state().clock.aiSec < 20 - 1e-9) advance(store, TICK);
    if (actionSwap(store, thrustFile()) !== null) continue;
    while (getOps().some((operation) => operation.kind === 'swap')) advance(store, TICK);
    swapped++;
    // The op's last tick: a burst that was running is silenced by the very next tick's sim (the capabilities read the
    // new holder at once).
    if (state().burn.ghost !== null) {
      advance(store, TICK);
      if (state().burn.ghost !== null || state().burn.lastTickDvKmS !== 0) silencedAtOnce = false;
    }
    const before = starts;
    runUntil(endTSec);
    after += starts - before;
  }
  check(`a SWAP at boot + 20 AI s: 0 further bursts through the coast (${SWAP_SEEDS} seeds)`, swapped === SWAP_SEEDS && after === 0, `${swapped} swapped, ${after} bursts after`);
  check('…a burst running when it lands is silenced at once', silencedAtOnce);
}

// --- SWAP's rules ----------------------------------------------------------------------------------------------------
{
  fresh(3);
  installTool(store, 'swap');
  const primary = thrustFile();
  const backup = seg('Thrust.alt');
  // Busy: a SCAN on either file of the pair holds the swap.
  check('SWAP refused while the primary is busy (a SCAN on it)', actionScan(store, primary) === null && actionSwap(store, primary) === TOOL_REFUSAL.busy);
  while (getOps().length > 0) advance(store, TICK);
  check('…and while the backup is busy', actionScan(store, backup) === null && actionSwap(store, primary) === TOOL_REFUSAL.busy);
  while (getOps().length > 0) advance(store, TICK);
  check('…refused on a ship file with no backup (Reactor)', actionSwap(store, seg('Reactor')) === TOOL_REFUSAL.noBackup);
  check('…refused on a file that is not a ship file (the AI Core)', actionSwap(store, seg('AI Core')) === TOOL_REFUSAL.swapShipOnly);
  // A cancel changes nothing.
  check('SWAP starts (on the primary) and holds a thread', actionSwap(store, primary) === null && threadsBusy() === 1
    && getOps()[0]?.kind === 'swap');
  const opId = getOps()[0]!.id;
  advance(store, TICK);
  cancelOp(opId);
  check('…a cancel changes nothing (the role stays, the names stay, the thread is free)', primary.role === 'thrust-ctrl' && backup.role === undefined
    && primary.name === 'Thrust Controller' && threadsBusy() === 0 && !primary.operating && !backup.operating);
  // Clicking the backup swaps the pair; it takes SWAP_SEC.
  const startAi = state().clock.aiSec;
  check('…clicking Thrust.alt swaps its pair', actionSwap(store, backup) === null);
  while (getOps().length > 0) advance(store, TICK);
  const took = state().clock.aiSec - startAi;
  check(`…in ${SWAP_SEC} AI s`, Math.abs(took - SWAP_SEC) <= TICK + 1e-9, `${took.toFixed(2)} s`);
  check('…Thrust.alt now does the job, named Thrust Controller, at its own 100 (intact), scanned',
    backup.role === 'thrust-ctrl' && backup.name === 'Thrust Controller' && integrityOf(backup) === 100 && backup.state === 'intact'
    && 'scanned' in backup && backup.scanned === true, `${backup.name} ${backup.state}`);
  check('…the old one is Thrust.old: inactive, no role, its 31% now scanned (the cause, seen)',
    primary.name === 'Thrust.old' && primary.state === 'inactive' && primary.role === undefined && integrityOf(primary) === 31
    && 'scanned' in primary && primary.scanned === true);
  check('…the controller is ok: no ghost', capabilitiesNow(state()).thrustCtrl.band === 'ok' && capabilitiesNow(state()).thrustCtrl.ghost === null);
  check('…one file with the role', filesWithRole(state(), 'thrust-ctrl').length === 1);
  check('…the pair can\'t be swapped back (the backup link is gone)', actionSwap(store, backup) === TOOL_REFUSAL.noBackup
    && actionSwap(store, primary) === TOOL_REFUSAL.noBackup);
}
{
  // The lead's item 1: a damaged, infected backup keeps its integrity, its health word and its infection.
  fresh(4);
  installTool(store, 'swap');
  const primary = thrustFile();
  const backup = seg('Thrust.alt');
  store.update((d) => {
    const alt = d.memory.find((candidate) => candidate.id === backup.id);
    if (!alt || !hasIntegrity(alt)) throw new Error('no Thrust.alt');
    alt.integrity = 40;
    alt.infected = { side: 'left' };
    d.ui.memoryRev++;
  });
  actionSwap(store, primary);
  while (getOps().length > 0) advance(store, TICK);
  check('a backup at 40 swapped in stays at 40, `corrupt` (not intact), still failing (the ghost goes on)',
    integrityOf(backup) < 41 && backup.state === 'corrupt' && capabilitiesNow(state()).thrustCtrl.band === 'failing'
    && capabilitiesNow(state()).thrustCtrl.ghost !== null, `${integrityOf(backup).toFixed(1)} ${backup.state}`);
  check('…and the infection carries with it', backup.infected !== undefined);
}

finish();
