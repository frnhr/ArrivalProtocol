// Slice 7b FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.4 7b, §5.2): the lead's suite. Behaviour-neutral seams only:
// • the gate is down (Track DROP's line), the tuning is 01's, the words render;
// • the stubs: DROP's startLastLanding and skipLastLanding throw, its 'merge' resolver is registered and answers null; VIEW's
//   models are neutral;
// • the launchDrivers swap (R24): with no LAST LANDING it is driversInMemory; with one, only the radio drivers launch, and a
//   radio launch leaves memory untouched, takes the driver off the radio list and starts THE LAST LANDING's cadence (R26);
// • the refusal branch (no bay, its own cadence), the blind drop's factor (R27), the MIND shut and the input layer (R26),
//   the restored beacons (R29).
// ARES-VII from a constructed lock (harness-landing lockOn: no capture flown), the instant landing off.
import { check, finish } from '../landing/checks';
import { lockOn } from '../landing/harness-landing';
import { setLandingMode } from '../support/landing-instant';
import { createHarness6 } from '../wp6/harness6';
import { isDeepStrictEqual } from 'node:util';
import type { DriverSegment } from '@/types/segment';
import type { DropSolution } from '@/types/landing';
import type { LastLandingState } from '@/types/ending';
import { forceLandAll, requestLaunch } from '@systems/landing';
import { launchQueue, launchRefusal, nextToLaunch } from '@systems/landing-rules';
import { dropHalfWidthKm } from '@systems/landing-solve';
import { parkedBeacons } from '@systems/landing-hud';
import { activeLandingController, registerLandingController } from '@systems/landing-controller';
import { restoredDriver, lastLandingPods } from '@systems/ending-rules';
import { startLastLanding, skipLastLanding, lastLandingController } from '@systems/last-landing';
import { lastLandingHeader, podBayRestoredRow, restoredReportRow, restoredCreditTag } from '@systems/last-landing-hud';
import { setMode } from '@systems/mode';
import { activeLayer, pushModal } from '@systems/input';
import { replaceRange, freeSegment, mergeAdjacentFree, requireAddr } from '@systems/memory-ops';
import { driversInMemory, launchDrivers, lastLandingOn } from '@state/selectors';
import { LAST_LANDING_BUILT } from '@data/last-landing';
import { LAST_LANDING_TEXT } from '@data/last-landing-text';
import { FINALE_TEXT } from '@data/finale-text';
import {
  BLIND_DROP_MULT, BLIND_MARGIN_KM, LAST_LANDING_AUTODROP_ORBITS, LAST_LANDING_CADENCE_SEC, LAST_LANDING_SKIP_MAX_STEPS,
  MERGE_DRIVER_INTEGRITY,
} from '@data/tuning';

const threw = (fn: () => unknown): string => {
  try {
    fn();
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

// --- The gate, the numbers, the words --------------------------------------------------------------------------------------
// Track DROP's gate line:
check('built: THE LAST LANDING not yet (7a\'s interim MERGE plays)', !LAST_LANDING_BUILT);
// (end of DROP's gate line)

check('the numbers are 01 §3.17\'s: 2.0 s between launches, 2 orbits of AUTODROP, ±(W/2 + 150 km), ×2 spread; the skip cap far above a run',
  LAST_LANDING_CADENCE_SEC === 2 && LAST_LANDING_AUTODROP_ORBITS === 2 && BLIND_MARGIN_KM === 150 && BLIND_DROP_MULT === 2
  && LAST_LANDING_SKIP_MAX_STEPS >= 100_000);
check('the seeded words: the TERMINAL\'s radio line, the POD BAY row, the report row, the header and hint',
  LAST_LANDING_TEXT.radio(7, 'okafor') === '> pod07 ... DRIVER RESTORED · OKAFOR' && LAST_LANDING_TEXT.bayRow(4) === 'RESTORED 4'
  && LAST_LANDING_TEXT.reportRow({ restored: 4, landed: 3, offSite: 1, noGo: 0 }) === '4 RESTORED · 3 LANDED · 1 OFF-SITE'
  && LAST_LANDING_TEXT.header === 'THE LAST LANDING' && LAST_LANDING_TEXT.skipHint === '[ENTER] SKIP TO THE END');
check('MERGE\'s 7b NOW: line names one driver as one', FINALE_TEXT.now(1) === 'NOW: + 1 eaten driver comes back · its pod lands on its own'
  && FINALE_TEXT.now(2) === 'NOW: + 2 eaten drivers come back · their pods land on their own');
{
  const f = { sensor: 1.2, plotter: 1.1, driver: 1.3 };
  const s = dropHalfWidthKm(7000, 6000, f);
  check('the blind drop doubles the spread in the one product (R27), and a factor set without it is unchanged',
    dropHalfWidthKm(7000, 6000, { ...f, blind: BLIND_DROP_MULT }) === s * BLIND_DROP_MULT && dropHalfWidthKm(7000, 6000, { ...f, blind: 1 }) === s);
}

// --- The input layer -----------------------------------------------------------------------------------------------------
{
  const before = activeLayer();
  const close = pushModal('last-landing');
  const up = activeLayer();
  const closeChoice = pushModal('choice');
  const over = activeLayer();
  closeChoice();
  close();
  check('the \'last-landing\' layer sits over the game and under the choice (R26)', before === 'game' && up === 'last-landing' && over === 'choice'
    && activeLayer() === 'game');
}

// --- ARES-VII in its landing ------------------------------------------------------------------------------------------------
setLandingMode('manual');
const h = createHarness6(1, { soulsFound: true });
h.noFault();
lockOn(h);
const state = (): ReturnType<typeof h.store.getState> => h.store.getState();

// Track DROP's stubs (its block: as built, it rewrites these lines; ending/last-landing is its own suite):
check('DROP\'s stubs: startLastLanding and skipLastLanding throw, the \'merge\' resolver answers null',
  /not built \(Track DROP/.test(threw(() => startLastLanding(h.store, [1]))) && /not built \(Track DROP/.test(threw(() => skipLastLanding(h.store)))
  && lastLandingController(state()) === null);
// (end of DROP's stubs)

check('the \'merge\' resolver is registered by the harness\'s mount (a second one throws), and no controller flies',
  /already registered/.test(threw(() => registerLandingController('merge', () => null))) && activeLandingController(state()) === null);
check('with no LAST LANDING the launch path reads memory: launchDrivers is driversInMemory, the beacons are none',
  state().run.phase === 'landing' && !lastLandingOn(state()) && isDeepStrictEqual(launchDrivers(state()), driversInMemory(state()))
  && launchDrivers(state()).length > 1 && parkedBeacons(state()).length === 0);
check('THE LAST LANDING\'s pods on a fresh landing: none (no driver was eaten)', lastLandingPods(state()).length === 0);
check('a blind drop outside THE LAST LANDING, or by another source, throws',
  /blind drop/.test(threw(() => requestLaunch(h.store, { source: 'merge', blind: true })))
  && /blind drop/.test(threw(() => requestLaunch(h.store, { source: 'player', blind: true }))));

// A fake solution in the band (launchRefusal reads only its block and dot).
const sol = { block: null, dot: { inBand: true } } as unknown as DropSolution;
h.store.update((draft) => { draft.landing.bay.loaded = 0; });
check('control: an empty bay refuses BAY EMPTY outside THE LAST LANDING', launchRefusal(state(), sol, { source: 'merge', fromMind: true }) === 'BAY EMPTY');

// THE LAST LANDING by hand: pod `radio`'s driver taken out of memory (as MERGE takes the eaten blocks in) and given back by radio.
const memoryDriver = driversInMemory(state())[0]!;
const radioPod = memoryDriver.pod;
const record = state().landing.pods.find((candidate) => candidate.pod === radioPod)!;
const machine = (cadenceLeftSec: number): LastLandingState => ({
  pods: [radioPod], drivers: [restoredDriver(record)], flier: 'blind', orbitsFlown: 0, cadenceLeftSec, skipped: false,
});
h.store.update((draft) => { draft.landing.lastLanding = machine(0); });
check('a driver both by radio and in memory is a bug: the launch throws', /both by radio and in memory/.test(threw(() => forceLandAll(h.store))));
{
  const memory = state().memory;
  const start = requireAddr(memory, memoryDriver);
  replaceRange(memory, start, start + memoryDriver.size, [freeSegment(memoryDriver.size)], { opId: null, own: [memoryDriver] });
  mergeAdjacentFree(memory);
  h.store.update((draft) => { draft.ui.memoryRev++; });
}
const radio: DriverSegment = state().landing.lastLanding!.drivers[0]!;
check(`the radio driver is MERGE's: pod ${radioPod} at MERGE_DRIVER_INTEGRITY, not in memory`, radio.pod === radioPod
  && radio.integrity === MERGE_DRIVER_INTEGRITY && !state().memory.some((seg) => seg.id === radio.id));
check('during THE LAST LANDING only the radio drivers launch (R24): the queue and the next pod are the restored one',
  lastLandingOn(state()) && launchDrivers(state()).map((driver) => driver.pod).join() === String(radioPod)
  && launchQueue(state()).map((driver) => driver.pod).join() === String(radioPod) && nextToLaunch(state())?.pod === radioPod
  && driversInMemory(state()).length > 0);
check('…with no bay (R26): an empty bay does not refuse it, the cadence does',
  launchRefusal(state(), sol, { source: 'merge', fromMind: true }) === null
  && (() => {
    h.store.update((draft) => { draft.landing.lastLanding!.cadenceLeftSec = 1; });
    const refusal = launchRefusal(state(), sol, { source: 'merge', fromMind: true });
    h.store.update((draft) => { draft.landing.lastLanding!.cadenceLeftSec = 0; });
    return refusal === 'RELOADING';
  })());
{
  const beacons = parkedBeacons(state());
  check('its pod rides as a restored beacon (R29), the parked ones not restored', beacons.length === 1 && beacons[0]!.pod === radioPod
    && beacons[0]!.restored);
}
{
  setMode(h.store, 'memory');
  check('the MIND is shut while it runs (R26)', state().ui.mode === 'tools');
}
{
  const memoryBefore = JSON.stringify(state().memory);
  forceLandAll(h.store);
  const landed = state().landing.pods.find((candidate) => candidate.pod === radioPod)!;
  check('a radio launch leaves memory untouched, takes the driver off the radio list and starts the cadence (R24, R26)',
    JSON.stringify(state().memory) === memoryBefore && state().landing.lastLanding!.drivers.length === 0
    && state().landing.lastLanding!.cadenceLeftSec === LAST_LANDING_CADENCE_SEC && landed.fate.kind === 'down',
    `${landed.fate.kind} · ${JSON.stringify(state().landing.lastLanding)}`);
  check('…and nothing else launched: the memory drivers\' pods were parked as the landing ended',
    state().landing.pods.filter((candidate) => candidate.fate.kind === 'down').length === 1);
}
h.store.update((draft) => { draft.landing.lastLanding = null; });

// Track VIEW's stubs (its block: as built, it rewrites these lines; ending/last-landing-models is its own suite):
check('VIEW\'s models are neutral: no header, no POD BAY row, no report row model, no credit tag',
  lastLandingHeader(state()) === null && podBayRestoredRow(state()) === null && restoredReportRow({ restored: 200 } as never) === null
  && restoredCreditTag({ pod: radioPod } as never) === '');
// (end of VIEW's stubs)

finish();
