// WP3 acceptance 4: OVERCLOCK (§3.2, §6.1). In blue at TACTICAL pace the world advances at 0.25×
// the amber rate; at CRUISE the rates are equal (± 1 tick). Plus: the label and the ×¼ badge,
// jacking in never cancels SKIP, SKIP works from blue, the mind keeps full speed while the world
// is slowed, leaving blue glides the world back up, and pause stops both clocks.
import { check, finish } from '../wp1/harness';
import { createHarness3 } from './harness3';
import { setMode } from '@systems/mode';
import { setPaused } from '@systems/clock';
import { requestSkip } from '@systems/pace';
import { getPrediction } from '@systems/predict';
import { paceLabel, countdownChip, upcomingEvents } from '@systems/flight-hud';
import { actionScan, scanSec } from '@state/actions';
import { getOps } from '@systems/ops-core';
import { OVERCLOCK_FACTOR } from '@data/tuning';

const h = createHarness3(1);
const TICKS = 40;  // 2 wall seconds

function worldRate(): number {
  const before = h.store.getState().clock.tSec;
  for (let i = 0; i < TICKS; i++) h.step();
  return (h.store.getState().clock.tSec - before) / (TICKS * 0.05);
}

// --- TACTICAL: the impact course at the opening ---------------------------------------------------
h.resetTo('flight');
h.stepFor(0.5);
const tactical = h.store.getState().level.tacticalWarp;
check('opening: TACTICAL', h.pace() === 'tactical' && !h.store.getState().clock.overclock);
const amberRate = worldRate();
setMode(h.store, 'memory');
h.step();  // pace re-evaluates in the next pre-tick; slowing down snaps
const blueRate = worldRate();
check('acceptance 4: in blue at TACTICAL the world runs at 0.25× the amber rate',
  Math.abs(blueRate / amberRate - OVERCLOCK_FACTOR) < 1e-9, `amber ×${amberRate.toFixed(3)}, blue ×${blueRate.toFixed(3)}`);
check('overclock: amber ran at the tactical warp', Math.abs(amberRate - tactical) < 1e-9, `${amberRate}`);
const state = h.store.getState();
const chip = countdownChip(state, getPrediction());
check('overclock: the pace label reads OVERCLOCK ×¼', paceLabel(state) === 'OVERCLOCK ×¼', paceLabel(state));
check('overclock: the countdown chip shows ×¼, not ▸▸', chip !== null && chip.slow && !chip.fastForward, JSON.stringify(chip));
check('overclock: the clock flags it', state.clock.overclock && state.clock.pace === 'tactical');

// The mind keeps full speed: a scan takes its AI seconds while the world crawls.
{
  const engine = h.store.getState().memory.find((seg) => seg.type === 'tool' && seg.size === 8 && seg.integrity === 38)!;
  actionScan(h.store, engine);
  const start = h.wall();
  while (getOps().length > 0) h.step();
  check('overclock: a scan still takes its full-speed AI time', Math.abs(h.wall() - start - scanSec(engine.size)) <= 0.05,
    `${(h.wall() - start).toFixed(2)} s`);
}

// Leaving blue: the world glides back up to the tactical warp (speed-ups glide, §6.1).
setMode(h.store, 'tools');
h.step();
check('back in amber: OVERCLOCK ends at once', !h.store.getState().clock.overclock && paceLabel(h.store.getState()) === `TACTICAL ×${tactical}`);
let glideTicks = 0;
while (h.store.getState().clock.speed < tactical && glideTicks < 200) { h.step(); glideTicks++; }
check('back in amber: the world glides back to full tactical speed within ~2 s', glideTicks > 1 && glideTicks <= 45, `${glideTicks} ticks`);

// --- CRUISE: blue runs the coast at full speed -------------------------------------------------------
h.resetTo('flight');
h.step();
h.keyDown('Space');  // OUT is preselected: clear the planet and raise ▼ into the ring
while (h.rp() < 6000 && h.wall() < 60) h.step();
h.keyUp('Space');
h.press('KeyS');
while (h.pace() !== 'cruise' && h.wall() < 90) h.step();
check('coast: CRUISE reached', h.pace() === 'cruise', h.pace());
h.stepFor(4);  // let the glide finish
const amberCruise = worldRate();
setMode(h.store, 'memory');
h.step();
const blueCruise = worldRate();
const oneTick = (h.store.getState().level.cruiseWarp * 0.05) / (TICKS * 0.05);
check('acceptance 4: at CRUISE blue and amber run the world at the same rate (± 1 tick)',
  Math.abs(blueCruise - amberCruise) <= oneTick, `amber ×${amberCruise.toFixed(2)}, blue ×${blueCruise.toFixed(2)}`);
check('cruise in blue: no OVERCLOCK, the label still says CRUISE',
  !h.store.getState().clock.overclock && paceLabel(h.store.getState()).startsWith('CRUISE'), paceLabel(h.store.getState()));
check('cruise in blue: upcoming events keep ▸▸', !upcomingEvents(h.store.getState(), getPrediction()).includes('×¼'));

// --- SKIP from blue, and jacking in never cancels it ---------------------------------------------------
{
  const skip = requestSkip(h.store);
  h.step();
  check('SKIP works from blue', skip.ok && h.pace() === 'skip', JSON.stringify(skip));
  setMode(h.store, 'tools');
  h.step();
  const skipWarp = h.store.getState().clock.skipWarp;
  setMode(h.store, 'memory');
  h.step();
  check('jacking in never cancels a SKIP', h.pace() === 'skip' && h.store.getState().clock.skipWarp === skipWarp
    && !h.store.getState().clock.overclock, `${h.pace()} ×${h.store.getState().clock.skipWarp}`);
  // When the SKIP ends at the burn, TACTICAL in blue is overclocked.
  let guard = 0;
  while (h.pace() !== 'tactical' && guard++ < 4000) h.step();
  h.step();
  check('the SKIP ends into TACTICAL, and in blue that is OVERCLOCK', h.store.getState().clock.overclock
    && h.store.getState().clock.speedTarget === h.store.getState().level.tacticalWarp * OVERCLOCK_FACTOR);
}

// --- Pause stops both clocks -----------------------------------------------------------------------
{
  setPaused(h.store, true);
  const before = h.store.getState().clock;
  const tSec = before.tSec;
  const aiSec = before.aiSec;
  h.stepFor(1);
  const after = h.store.getState().clock;
  check('pause stops the world and the mind', after.tSec === tSec && after.aiSec === aiSec && !after.overclock);
  check('pause: the label says PAUSED, not OVERCLOCK', paceLabel(h.store.getState()) === 'PAUSED');
  setPaused(h.store, false);
  h.stepFor(0.2);
  check('resume in blue at TACTICAL: OVERCLOCK again', h.store.getState().clock.overclock);
}

finish();
