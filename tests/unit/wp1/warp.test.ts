// WP1 acceptance 4: the same 60 game-s burn at forced x20 and x2000 never drives fuel below 0,
// and the delivered Δv is within 1% of the fuel Δv. Run twice: with fuel to spare, and with
// a tank that runs dry mid-burn (the clipped sub-step).
import { createHarness, check, finish } from './harness';

const harness = createHarness(3);
const store = harness.store;
const BURN_GAME_SEC = 60;

interface BurnResult { deliveredDv: number; fuelDv: number; minFuelPct: number; gameSec: number }

function burnAtWarp(warp: number, startFuelPct: number): BurnResult {
  harness.reset();
  const budget = store.getState().level.dvBudgetKmS;
  // Force the warp: the ladder override, with the effective speed already settled there.
  store.update((d) => { d.burn.fuelPct = startFuelPct; d.clock.debugWarp = warp; });
  harness.step(1e-6); // let pace adopt the override (glide resumes from 0 at ≤ tactical)
  store.mutate((d) => { d.clock.speed = warp; });
  const t0 = store.getState().clock.tSec;
  const dv0 = store.getState().burn.dvDeliveredKmS;
  const fuel0 = store.getState().burn.fuelPct;
  let minFuel = fuel0;
  harness.keyDown('Space');
  // Feed exactly BURN_GAME_SEC of world time in standard 50 ms ticks (the last one shortened).
  while (store.getState().clock.tSec - t0 < BURN_GAME_SEC - 1e-9 && harness.status() === 'approaching') {
    const remainingGame = BURN_GAME_SEC - (store.getState().clock.tSec - t0);
    harness.step(Math.min(0.05, remainingGame / warp));
    minFuel = Math.min(minFuel, store.getState().burn.fuelPct);
  }
  harness.keyUp('Space');
  const burn = store.getState().burn;
  return {
    deliveredDv: burn.dvDeliveredKmS - dv0,
    fuelDv: ((fuel0 - burn.fuelPct) / 100) * budget,
    minFuelPct: minFuel,
    gameSec: store.getState().clock.tSec - t0,
  };
}

for (const startFuel of [100, 8]) {
  const slow = burnAtWarp(20, startFuel);
  const fast = burnAtWarp(2000, startFuel);
  for (const [label, result] of [['x20', slow], ['x2000', fast]] as const) {
    check(`fuel ${startFuel}% ${label}: fuel never below 0`, result.minFuelPct >= 0, `min ${result.minFuelPct.toFixed(6)}%`);
    const relErr = Math.abs(result.deliveredDv - result.fuelDv) / result.fuelDv;
    check(`fuel ${startFuel}% ${label}: delivered Δv within 1% of fuel Δv`, relErr <= 0.01,
      `delivered ${result.deliveredDv.toFixed(5)} vs fuel ${result.fuelDv.toFixed(5)} km/s over ${result.gameSec.toFixed(2)} game s`);
  }
  const between = Math.abs(slow.deliveredDv - fast.deliveredDv) / slow.deliveredDv;
  check(`fuel ${startFuel}%: x20 and x2000 deliver the same Δv (±1%)`, between <= 0.01,
    `${slow.deliveredDv.toFixed(5)} vs ${fast.deliveredDv.toFixed(5)} km/s`);
}

// The dry-tank case must actually run dry (otherwise it tests nothing).
{
  const dry = burnAtWarp(2000, 8);
  check('fuel 8%: the tank runs dry inside the burn', store.getState().burn.fuelPct === 0, `fuel ${store.getState().burn.fuelPct}`);
  const budget = store.getState().level.dvBudgetKmS;
  check('fuel 8%: delivered exactly the tank', Math.abs(dry.deliveredDv - 0.08 * budget) < 1e-9, `${dry.deliveredDv} vs ${0.08 * budget}`);
}

finish();
