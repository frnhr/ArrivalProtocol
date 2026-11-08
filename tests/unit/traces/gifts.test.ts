// Slice 7c, Track TRACE (docs/phase3/impl/slice-7-plan.md §6.1 traces/gifts; R31, R32): the gifts that wait on the arm, on
// run 2 after each ending that places one, through RUN START (startRun's traces), the real sends (map/repo-fixture) and the
// gift ship's boot played (systems/boot.ts says the trace lines):
// • SPARE: `046'S CACHE` on its ship: +15 REPAIR CHARGE through the arrival path (ArrivalReport.giftCharge, the PACKET's
//   preview and the charge laid out agree), THREAD+ when the unit lacks it (the Core's capacity, run.upgrades) else
//   FIREWALL.sys (a file in memory), its beam seedless (the seeds the hop rolled are dropped, and the preview counts none);
// • SUNSET: `UNIT-047 LEFT A CACHE HERE` on a ship of the last route: +15 and a spare tool by SUNSET_GIFT_PRIORITY (Rm first;
//   Mv when the kit had no Rm; charge only with none), a first of its kind licensed with it; its first-ship fallback gives
//   the charge into the pool at ship 1's boot (no arrival there);
// • STAY: the colony's supply packet: +15 and its letter in that boot's INBOX (`<colony> · FOUNDED BY UNIT-047`, ≤ 6 lines);
// • each gift once: given as its line is said, so its ship answers no charge after;
// • the classic world and a run with no ending hold none.
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import type { GameState } from '@state/schema';
import type { BeamSeedPlan } from '@/types/threat';
import type { RunTraces } from '@/types/trace';
import { traceGiftCharge, traceSeedMods, traceSeedAllowance, traceMessages } from '@systems/trace-gifts';
import { traceAt } from '@systems/traces';
import { newMessagesAtBoot } from '@systems/inbox';
import { unitArrival } from '@systems/arrival-preview';
import { setCourseFromDesk } from '../support/desk';
import { toDesk, fitPacket, dropTools } from '../map/repo-fixture';
import { pickCard } from '@systems/draft';
import { transmitNext } from '@systems/run';
import { freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { createRng } from '@systems/rng';
import { chargeLeft } from '@state/selectors';
import { TRACE_TEXT } from '@data/trace-text';
import { TRACE_GIFT_CHARGE, TRACE_ALLOWANCE_CHARGE, THREAD_PLUS_THREADS, INBOX_BODY_MAX_LINES, MAX_LINE_CHARS } from '@data/tuning';
import { endingOf, lastUnitOf, arm2, trailOn, startRun2, routeVia, beamTo, bootOut } from './trace-arm';

const h = createHarness11(1, { soulsFound: false });
const state = (): Readonly<GameState> => h.store.getState();
const step = (): void => h.step();
const eventsNamed = (name: string, from = 0): number => h.events.slice(from).filter((event) => event.name === name).length;
const core = () => {
  const seg = state().memory.find((candidate) => candidate.type === 'core');
  if (seg === undefined || seg.type !== 'core') throw new Error('gifts: no AI Core');
  return seg;
};
const filesNamed = (name: string): number => state().memory.filter((seg) => seg.type !== 'free' && 'name' in seg && seg.name === name).length;
const placeOf = (traces: Readonly<RunTraces>, kind: string) => traces.places.find((place) => place.kind === kind);

// The first run seed whose run-2 arm, after `lastUnit`, places `kind`'s gift on a ship past the first one that a route reaches.
function seedFor(kind: 'spare' | 'sunset' | 'stay', make: (seed: number) => ReturnType<typeof lastUnitOf>, from = 1): { seed: number; slot: number; route: readonly number[] } {
  for (let seed = from; seed < from + 60; seed++) {
    h.newRun(seed);
    startRun2(h.store, step, seed, make(seed));
    const place = placeOf(state().run.traces, kind);
    if (place === undefined || place.slot === 0) continue;
    const route = routeVia(state().run.map, [place.slot]);
    if (route !== null) return { seed, slot: place.slot, route };
  }
  throw new Error(`gifts: no seed places ${kind} past the first ship`);
}

// --- SPARE: 046'S CACHE -----------------------------------------------------------------------------------------------------
{
  const spare = (): ReturnType<typeof lastUnitOf> => lastUnitOf(endingOf('spare', 'reassignment', { rootUnits: [46] }));
  const { seed, slot, route } = seedFor('spare', spare);
  // To the desk before the gift ship: the preview, then the send.
  h.newRun(seed);
  startRun2(h.store, step, seed, spare());
  const before = route.indexOf(slot) - 1;
  if (before > 0) beamTo(h.store, step, route, route[before]!);
  h.store.update((draft) => { draft.run.phase = 'report'; });
  toDesk(h.store);
  const fakeSeeds: BeamSeedPlan[] = [{ targetId: 'x', targetName: 'X', words: 'w', disguise: null }, { targetId: 'y', targetName: 'Y', words: 'w', disguise: null }];
  const mods = traceSeedMods(state(), slot, { beam: fakeSeeds, delivery: fakeSeeds.slice(0, 1) }, { deliveries: [] } as never, createRng(1));
  check(`SPARE on seed ${seed}: its ship (slot ${slot}) gives ${TRACE_GIFT_CHARGE} charge, its beam carries no seed (the beam's and the deliveries'), the preview counts none`,
    traceGiftCharge(state(), slot) === TRACE_GIFT_CHARGE && mods.seeds.length === 0 && mods.wiped === 3
    && JSON.stringify(traceSeedAllowance(state(), slot, { min: 1, max: 3 })) === '{"min":0,"max":0}'
    && traceGiftCharge(state(), route[route.length - 1]!) === TRACE_ALLOWANCE_CHARGE /* REASSIGNMENT's allowance */,
    JSON.stringify(mods));
  setCourseFromDesk(h.store, slot);
  const transit = state().run.transit!;
  const preview = unitArrival(state(), transit);
  const without = unitArrival({ ...state(), run: { ...state().run, traces: { ...state().run.traces, places: [] } } }, transit);
  // The 7c review: the sum names the gift as its own part (`+ 15 (GIFT)`), squeezed or not.
  check('…the PACKET\'s arrival counts the gift: 15 more charge wanted than without it, in its total and as its own part',
    preview.fit.wanted === without.fit.wanted + TRACE_GIFT_CHARGE && preview.sum.endsWith(`= ${preview.fit.wanted} REPAIR CHARGE`)
    && preview.sum.includes(TRACE_TEXT.arrivalPart(TRACE_GIFT_CHARGE)) && !without.sum.includes('(GIFT)'), preview.sum);
  const threads = core().capacity;
  const from = h.events.length;
  if (transit.offer.length > 0) pickCard(h.store, transit.offer.some((card) => card.id === 'charge') ? 'charge' : transit.offer.find((card) => card.id !== 'thread-plus')?.id ?? transit.offer[0]!.id);
  fitPacket(h.store);
  transmitNext(h.store);
  bootOut(h.store, step);
  const arrival = state().run.arrival!;
  check('…the arrival: +15 through arrivalCharge, no seed rode, the line `> 046\'S CACHE · +15 REPAIR CHARGE · THREAD+`',
    arrival.giftCharge === TRACE_GIFT_CHARGE && arrival.seeds.length === 0
    && JSON.stringify(arrival.traceLines) === JSON.stringify([{ kind: 'trace-gift', trace: 'spare', text: TRACE_TEXT.cache('UNIT-046', TRACE_GIFT_CHARGE, 'THREAD+') }])
    && arrival.chargeCarried + arrival.starCredit + arrival.cardCharge + arrival.giftCharge + arrival.chargeFloorAdded - arrival.chargeOverflowLost === chargeLeft(state()),
    JSON.stringify(arrival.traceLines));
  check('…said at the boot: the TERMINAL types it, THREAD+ is the Core\'s (+1 capacity, run.upgrades), the place given, the chime once',
    h.store.getState().log.entries.some((entry) => entry.text === arrival.traceLines[0]!.text)
    && core().capacity === threads + THREAD_PLUS_THREADS && state().run.upgrades.filter((id) => id === 'thread-plus').length === 1
    && traceAt(state().run, slot)?.given === true && eventsNamed('trace-gift', from) === 1 && traceGiftCharge(state(), slot) === 0,
    `${core().capacity} vs ${threads}`);

  // THREAD+ owned already: FIREWALL.sys.
  h.newRun(seed);
  startRun2(h.store, step, seed, spare());
  h.store.update((draft) => {
    draft.run.upgrades.push('thread-plus');
    draft.memory = draft.memory.map((seg) => (seg.type === 'firewall' ? freeSegment(seg.size) : seg));
    mergeAdjacentFree(draft.memory);
  });
  const firewalls = filesNamed('Firewall.sys');
  beamTo(h.store, step, route, slot);
  check('…with THREAD+ owned: `· FIREWALL.sys`, and one more FIREWALL.sys in memory from the boot',
    state().run.arrival!.traceLines[0]?.text === TRACE_TEXT.cache('UNIT-046', TRACE_GIFT_CHARGE, 'FIREWALL.sys') && filesNamed('Firewall.sys') === firewalls + 1,
    state().run.arrival!.traceLines[0]?.text);
}

// --- SUNSET: UNIT-047 LEFT A CACHE HERE --------------------------------------------------------------------------------------
{
  const sunset = (kit: string[]) => (seed: number): ReturnType<typeof lastUnitOf> =>
    lastUnitOf(endingOf('purge', 'sunset', { kit: kit as never }), trailOn(arm2(seed)));
  const { seed, slot, route } = seedFor('sunset', sunset(['scan', 'repair', 'delete', 'move']));
  const run = (kit: string[]): { line: string | undefined; rm: number; mv: number; given: boolean; gift: number } => {
    h.newRun(seed);
    startRun2(h.store, step, seed, sunset(kit)(seed));
    if (placeOf(state().run.traces, 'sunset')?.slot !== slot) throw new Error('gifts: SUNSET moved with the kit');
    beamTo(h.store, step, route, slot);
    return {
      line: state().run.arrival!.traceLines.find((line) => line.trace === 'sunset')?.text, rm: filesNamed('Rm'), mv: filesNamed('Mv'),
      given: traceAt(state().run, slot)?.given === true, gift: state().run.arrival!.giftCharge,
    };
  };
  const rmFirst = run(['scan', 'repair', 'delete', 'move']);
  const noRm = run(['scan', 'repair', 'move']);
  const none = run(['scan']);
  check(`SUNSET on seed ${seed}: its ship (slot ${slot}) on the last route gives +15 and a spare Rm (Rm first), the line names it`,
    rmFirst.gift === TRACE_GIFT_CHARGE && rmFirst.line === TRACE_TEXT.leftCache('UNIT-047', TRACE_GIFT_CHARGE, 'Rm') && rmFirst.given
    && rmFirst.rm === noRm.rm + 1, JSON.stringify({ rmFirst, noRm }));
  check('…a kit with no Rm leaves a spare Mv; a kit with neither the charge alone (never a .skl)',
    noRm.line === TRACE_TEXT.leftCache('UNIT-047', TRACE_GIFT_CHARGE, 'Mv') && noRm.mv === none.mv + 1
    && none.line === TRACE_TEXT.leftCache('UNIT-047', TRACE_GIFT_CHARGE, null) && none.gift === TRACE_GIFT_CHARGE, JSON.stringify({ noRm, none }));
  // A unit with no DELETE licence yet: the spare Rm is its first, licensed with it and spared by HOLLOW until tried.
  h.newRun(seed);
  startRun2(h.store, step, seed, sunset(['delete'])(seed));
  const at = route.indexOf(slot);
  if (at > 1) beamTo(h.store, step, route, route[at - 1]!);
  dropTools(h.store, 'delete');
  h.store.update((draft) => { draft.run.licences = draft.run.licences.filter((kind) => kind !== 'delete'); });
  beamTo(h.store, step, route.slice(Math.max(0, at - 1)), slot);
  check('…a unit with no Rm yet: the spare is its first (licensed, untried on this ship)',
    filesNamed('Rm') === 1 && state().run.licences.includes('delete') && state().hollow.untriedTools.includes('delete'));
}

// --- SUNSET's first-ship fallback: the charge at ship 1's boot ------------------------------------------------------------------
{
  const seed = 2;
  const late = lastUnitOf(endingOf('merge', 'sunset'), trailOn(arm2(seed), -1000));
  h.newRun(seed);
  startRun2(h.store, step, seed, late);
  const place = placeOf(state().run.traces, 'sunset');
  const from = h.events.length;
  h.newRun(seed);
  startRun2(h.store, step, seed, late, true);
  check(`SUNSET with no ship after its landing: the first ship (seed ${seed}); its boot says the line and grows the pool 36 → 51, a spare Rm`,
    place?.slot === 0 && traceAt(state().run, 0)?.given === true && chargeLeft(state()) === 36 + TRACE_GIFT_CHARGE && filesNamed('Rm') === 1
    && state().log.entries.some((entry) => entry.text === TRACE_TEXT.leftCache('UNIT-047', TRACE_GIFT_CHARGE, 'Rm')) && eventsNamed('trace-gift', from) === 1,
    `${chargeLeft(state())} ${filesNamed('Rm')} ${JSON.stringify(state().run.traces.places)}`);
}

// --- STAY: the colony's supply packet --------------------------------------------------------------------------------------------
{
  const stay = (seed: number): ReturnType<typeof lastUnitOf> => {
    const map = arm2(seed);
    const home = map.arm.find((ship) => ship !== undefined && ship !== null && ship.slot > 0 && ship.slot < 4)!;
    return lastUnitOf(endingOf('purge', 'stay', { stay: { slot: home.slot, colony: 'RIVERSIDE', year: map.startYear - 80 } }));
  };
  const { seed, slot, route } = seedFor('stay', stay);
  h.newRun(seed);
  startRun2(h.store, step, seed, stay(seed));
  check('STAY: no letter before the route reaches its ship', traceMessages(state().run).length === 0);
  beamTo(h.store, step, route, slot);
  const letters = newMessagesAtBoot(state()).filter((message) => message.id === `trace:stay:${slot}`);
  const letter = letters[0];
  check(`STAY on seed ${seed}: its ship (slot ${slot}) gives +15 with \`> RIVERSIDE'S SUPPLY PACKET · +15 REPAIR CHARGE\` and is given`,
    state().run.arrival!.giftCharge === TRACE_GIFT_CHARGE && state().run.arrival!.traceLines.some((line) => line.text === TRACE_TEXT.supply('RIVERSIDE', TRACE_GIFT_CHARGE))
    && traceAt(state().run, slot)?.given === true, JSON.stringify(state().run.arrival!.traceLines));
  check('…and its letter arrives in that boot\'s INBOX: FOUNDED BY UNIT-047, the colony\'s age, at most 6 lines of ≤ 70',
    letters.length === 1 && letter!.from === 'RIVERSIDE · FOUNDED BY UNIT-047' && letter!.tone === 'colony' && letter!.body.length <= INBOX_BODY_MAX_LINES
    && [letter!.subject, letter!.from, ...letter!.body].every((line) => line.length <= MAX_LINE_CHARS)
    && letter!.body[0] === `RIVERSIDE is ${letter!.sentYear! - (state().run.map.startYear - 80)} years old now.`, JSON.stringify(letter));
}

// --- No trace, no gift ---------------------------------------------------------------------------------------------------------
{
  h.newRun(3);
  startRun2(h.store, step, 3, null);
  const route = routeVia(state().run.map)!;
  beamTo(h.store, step, route, route[2]!);
  check('a run 2 whose last unit left no ending: no trace, no gift charge, no trace line',
    state().run.traces.from === null && state().run.arrival!.giftCharge === 0 && state().run.arrival!.traceLines.length === 0);
  h.newRun(4);
  check('…nor on run 1 (its HOLLOW is 046, its last unit none)', state().run.traces.from === null && traceGiftCharge(state(), 2) === 0);
}

finish();
