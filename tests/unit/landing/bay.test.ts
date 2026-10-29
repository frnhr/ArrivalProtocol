// Slice 1a, Track SIM: the bay (01-landing §3.4, plan §1.4). Its cadence (BAY_CADENCE_TAC 2.0) and its reload
// (BAY_RELOAD_TAC 20 per slot) run in tactical seconds of WORLD time: at TACTICAL ×20 a tactical second is a real one,
// OVERCLOCK (TAB during a window) runs the world and the bay at a quarter, and a SKIP crosses minutes of world and
// refills the bay. What the bay shows is min(loaded, launchable). Pure rules first, then ARES-VII from a constructed
// lock (harness-landing lockOn: no capture flown).
import { check, finish } from './checks';
import { lockOn } from './harness-landing';
import { createHarness5 } from '../wp5/harness5';
import { bayAfter, requestLaunch } from '@systems/landing';
import { bayShown } from '@systems/landing-rules';
import { requestSkip } from '@systems/pace';
import { setMode } from '@systems/mode';
import { driversInMemory } from '@state/selectors';
import { BAY_CADENCE_TAC, BAY_RELOAD_TAC, BAY_SLOTS, OVERCLOCK_FACTOR } from '@data/tuning';
import type { BayState } from '@/types/landing';

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

// --- The pure bay ------------------------------------------------------------------------------------------------------

const bay = (loaded: number, reloadTac = 0, cadenceLeftTac = 0): BayState => ({ loaded, reloadTac, cadenceLeftTac });

check('the cadence counts down in tactical seconds and stops at 0',
  near(bayAfter(bay(3, 0, BAY_CADENCE_TAC), 1.5).cadenceLeftTac, BAY_CADENCE_TAC - 1.5, 1e-12)
  && bayAfter(bay(3, 0, BAY_CADENCE_TAC), 3).cadenceLeftTac === 0);
{
  const almost = bayAfter(bay(3), BAY_RELOAD_TAC - 0.1);
  const filled = bayAfter(almost, 0.2);
  check(`one slot reloads in ${BAY_RELOAD_TAC} tac s`, almost.loaded === 3 && near(almost.reloadTac, BAY_RELOAD_TAC - 0.1, 1e-9)
    && filled.loaded === 4 && filled.reloadTac === 0, `${JSON.stringify(almost)} → ${JSON.stringify(filled)}`);
}
{
  // An empty bay part-way through a reload: 15 + 3 × 20 tac s fill all four; one second less leaves the last slot at 19.
  const full = bayAfter(bay(0, 5), 75);
  const short = bayAfter(bay(0, 5), 74);
  check('a long step (a SKIP) refills every slot, and a full bay keeps no reload', full.loaded === BAY_SLOTS && full.reloadTac === 0
    && short.loaded === 3 && near(short.reloadTac, 19, 1e-9), `${JSON.stringify(full)} / ${JSON.stringify(short)}`);
}
check('a full bay accrues nothing', JSON.stringify(bayAfter(bay(BAY_SLOTS), 500)) === JSON.stringify(bay(BAY_SLOTS)));
{
  let threw = 0;
  for (const dt of [-1, Number.NaN]) { try { bayAfter(bay(2), dt); } catch { threw++; } }
  check('a negative or NaN step throws', threw === 2);
}

// --- The bay in the game: ARES-VII from a lock ------------------------------------------------------------------------

const h = createHarness5(1, { soulsFound: true });
h.noFault();
lockOn(h);
const state = (): ReturnType<typeof h.store.getState> => h.store.getState();
check('the landing starts with a full bay', state().run.phase === 'landing' && state().landing.bay.loaded === BAY_SLOTS
  && state().landing.bay.cadenceLeftTac === 0, JSON.stringify(state().landing.bay));

// SKIP to the first window, then step to its sure part (where the strip says LAUNCH NOW).
const skip = requestSkip(h.store);
h.stepUntil(() => state().landing.window?.sure === true, 120);
check('a SKIP and the GET READY reach the first window\'s sure part', skip.ok && state().landing.window?.sure === true,
  JSON.stringify(state().landing.window));

const launched = requestLaunch(h.store, { source: 'player' });
check('a launch spends one slot and starts the cadence', launched.kind === 'launched' && state().landing.bay.loaded === BAY_SLOTS - 1
  && state().landing.bay.cadenceLeftTac === BAY_CADENCE_TAC, JSON.stringify(state().landing.bay));
check('a second launch inside the cadence is refused RELOADING',
  (() => { const again = requestLaunch(h.store, { source: 'player' }); return again.kind === 'refused' && again.reason === 'RELOADING'; })());

// At TACTICAL ×20 a tactical second is a real one: the cadence runs out in BAY_CADENCE_TAC real seconds.
{
  const wall = h.stepUntil(() => state().landing.bay.cadenceLeftTac <= 0, 10);
  check(`at TACTICAL the ${BAY_CADENCE_TAC} tac s cadence takes ${BAY_CADENCE_TAC} real s`, state().clock.pace === 'tactical'
    && near(wall, BAY_CADENCE_TAC, 0.1), `${wall.toFixed(2)} s at ${state().clock.pace}`);
  check('the reload ran meanwhile, in the same world time', near(state().landing.bay.reloadTac, wall, 0.15),
    `reload ${state().landing.bay.reloadTac.toFixed(2)} tac s after ${wall.toFixed(2)} s`);
}

// OVERCLOCK: TAB during the window (a pod still falling holds TACTICAL) slows the world, and the bay with it, to ¼.
{
  requestLaunch(h.store, { source: 'player' });
  setMode(h.store, 'memory');
  h.step();
  const before = state().landing.bay.cadenceLeftTac;
  const overclocked = state().clock.overclock;
  h.stepFor(1);
  const spent = before - state().landing.bay.cadenceLeftTac;
  check('TAB during a window overclocks the landing', overclocked && state().clock.pace === 'tactical', `pace ${state().clock.pace}`);
  check(`OVERCLOCK runs the bay at ${OVERCLOCK_FACTOR} of real time`, near(spent, OVERCLOCK_FACTOR, 0.06), `${spent.toFixed(3)} tac s in 1 real s`);
  setMode(h.store, 'tools');
}

// A SKIP refills the bay: once the window has closed and the pods are down, the SKIP to the next pass crosses a whole
// orbit of world time.
{
  h.stepUntil(() => state().landing.window === null && !state().landing.pods.some((record) => record.fate.kind === 'falling'), 60);
  const loadedBefore = state().landing.bay.loaded;
  const ok = requestSkip(h.store).ok;
  h.stepUntil(() => state().clock.skipWarp === null && state().clock.pace !== 'skip', 30);
  check('a SKIP between windows refills the bay', ok && loadedBefore < BAY_SLOTS && state().landing.bay.loaded === BAY_SLOTS,
    `${loadedBefore} → ${state().landing.bay.loaded}`);
}

// What the bay shows: never more than the pods that could go.
{
  const drivers = driversInMemory(state());
  check('one pod left aboard: the bay shows 1 of 4', drivers.length === 1 && bayShown(state()) === 1, `${drivers.length} drivers`);
  h.store.update((draft) => {
    const driver = draft.memory.find((seg) => seg.type === 'driver');
    if (driver && driver.type === 'driver') driver.infected = { side: 'left' };
  });
  check('an infected last driver: the bay shows 0', bayShown(state()) === 0 && state().landing.bay.loaded === BAY_SLOTS);
  h.store.update((draft) => {
    const driver = draft.memory.find((seg) => seg.type === 'driver');
    if (driver && driver.type === 'driver') delete driver.infected;
    draft.landing.bay.loaded = 0;
  });
  check('an empty bay shows 0 whatever is launchable', bayShown(state()) === 0);
}

finish();
