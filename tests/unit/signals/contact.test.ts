// Slice 7d (docs/phase3/impl/slice-7-plan.md §6.1 signals/contact; R41, OPEN-DECISIONS 50): CONTACT, built.
// • its row (ending-rules optionState): `???` with `COLLECT 3 SIGNALS · you have n` before it was ever chosen, named after,
//   open with its signals meter once SIGNALS_FOR_CONTACT are held (from any source), never spent; the open caption
//   `SIGNALS 3 ✓ · needs 3`; ENDINGS n/7;
// • its words: the verdict (`> transmit outward`, CONTROL non-compliant), the four titles, its NEXT RUN: line;
// • its trace on run 2 (startRun's own traces, the real sends): two signal stops in layers 5–7, each on an ordinary ship
//   (never authored, `?`, TIGHT, first or final), the save's check clean, over 40 seeds; each stop's card row and `◆`; the
//   final ship's row names CONTACT, and its wild seed is owed;
// • a stop by the real TRANSMIT: +CONTACT_GIFT_CHARGE through the arrival path, its boot line, the `▓▓░▓` file worth 1 in
//   rack A, the stop given as the line is said (no second charge); SCAN finds its fragment (`contact-stop`), the save's
//   check holds, and a SHIP DONE save there round-trips.
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import type { GameState } from '@state/schema';
import type { SignalSegment, Segment } from '@/types/segment';
import { optionState } from '@systems/ending-rules';
import { endingTitle } from '@systems/ending-rules';
import { finaleVerdictLines } from '@systems/finale';
import { traceAt, traceRefusal, finalTraces, placeExcluded } from '@systems/traces';
import { traceGiftCharge } from '@systems/trace-gifts';
import { traceCardRow, traceOnChart, traceNextLines } from '@systems/trace-hud';
import { signalCount, signalRefusal } from '@systems/signals';
import { layerOf } from '@systems/map-geometry';
import { actionScan } from '@state/actions';
import { buildRunSave, encodeRunSave, decodeRunSave } from '@systems/save-codec';
import { toDesk } from '../map/repo-fixture';
import { builtPieces } from '@data/endings';
import { FINALE_TEXT } from '@data/finale-text';
import { CONTACT_TEXT } from '@data/contact-text';
import { CONTACT_GIFT_CHARGE, SIGNALS_FOR_CONTACT, TRACE_LAYERS } from '@data/tuning';
import { endingOf, lastUnitOf, startRun2, routeVia, beamTo } from '../traces/trace-arm';

const h = createHarness11(1, { soulsFound: false });
const state = (): Readonly<GameState> => h.store.getState();
const step = (): void => h.step();
const contactUnit = () => lastUnitOf(endingOf('purge', 'contact'));

// --- The row and the words --------------------------------------------------------------------------------------------------
{
  h.newRun(7);
  const fresh = state();
  const at = (n: number): GameState => {
    const copy = structuredClone(fresh) as GameState;
    copy.run.residents.signals = n === 0 ? [] : [{ slot: 4, depth: 3, source: 'note', n: 1 }, ...(n >= 3 ? [{ slot: 14, depth: 4, source: 'signal-event' as const, n: n - 1 }] : [])];
    return copy;
  };
  const none = optionState(at(0), 'contact', []);
  const seen = optionState(at(1), 'contact', ['contact']);
  const paid = optionState(at(3), 'contact', []);
  check('CONTACT\'s row: `???` before it was ever chosen, `COLLECT 3 SIGNALS · you have 0`; named once seen (`you have 1`)',
    none.kind === 'needs' && !none.named && none.need === FINALE_TEXT.needs.signals(0, SIGNALS_FOR_CONTACT)
    && seen.kind === 'needs' && seen.named && seen.need === 'COLLECT 3 SIGNALS · you have 1', JSON.stringify({ none, seen }));
  check('…open at 3 fragments from any source, its signals meter (held, not spent); four is still open',
    paid.kind === 'open' && paid.price?.kind === 'signals' && paid.price.have === 3 && paid.price.need === 3 && paid.now === null
    && optionState(at(4), 'contact', []).kind === 'open' && signalCount(at(4).run) === 4);
  check('…its open caption reads as met: `SIGNALS 3 ✓ · needs 3`; ENDINGS n/7 (CONTACT counts)',
    FINALE_TEXT.price.signals(3, 3) === 'SIGNALS 3 ✓ · needs 3' && builtPieces().length === 7 && builtPieces().includes('contact'));
  const lines = finaleVerdictLines(at(3), 'purge', 'contact', null).map((line) => line.text);
  check('the verdict: `> rm unit_046`, `> transmit outward`, CONTROL non-compliant', lines.length === 3 && lines[1] === FINALE_TEXT.echo('> transmit outward')
    && /non-compliant/.test(lines[2]!), JSON.stringify(lines));
  const titles = (['purge', 'merge', 'spare', 'followed'] as const).map((hollow) => endingTitle(endingOf(hollow, 'contact')));
  check('the titles (05 §3.7, R23): OUTWARD, ALONE · WE WENT TO SEE · TWO WAYS OUT · WE WENT OUT TOGETHER',
    titles.join(' · ') === 'OUTWARD, ALONE · WE WENT TO SEE · TWO WAYS OUT · WE WENT OUT TOGETHER', titles.join(' · '));
  check('its NEXT RUN: line after PURGE\'s, the wild seed said once (`+ 2 signal stops on the map · − 1 more seed at the end`)',
    traceNextLines(endingOf('purge', 'contact')).join('|')
    === 'NEXT RUN: + your seeds die at the final ship · − a hungrier finale|NEXT RUN: + 2 signal stops on the map · − 1 more seed at the end'
    && traceNextLines(endingOf('spare', 'contact'))[1] === 'NEXT RUN: + 2 signal stops on the map · − that same seed');
}

// --- Its trace on run 2: two signal stops (R41) -------------------------------------------------------------------------------
let found: { seed: number; slot: number; route: readonly number[] } | null = null;
{
  const problems: string[] = [];
  let two = 0;
  for (let seed = 1; seed <= 40; seed++) {
    h.newRun(seed);
    startRun2(h.store, step, seed, contactUnit());
    const run = state().run;
    const stops = run.traces.places.filter((place) => place.kind === 'contact');
    if (stops.length === 2) two++;
    if (JSON.stringify(run.traces.kinds) !== '["purge","contact"]' || !run.traces.extraSeed) problems.push(`${seed}: kinds ${run.traces.kinds.join()}`);
    if (traceRefusal(run) !== null) problems.push(`${seed}: ${traceRefusal(run)}`);
    for (const place of stops) {
      const ship = run.map.arm[place.slot]!;
      const layer = layerOf(place.slot);
      if (layer < TRACE_LAYERS.contact[0] || layer > TRACE_LAYERS.contact[1] || placeExcluded(ship, 'contact') !== null || ship.reserved.unknownEvent !== null) {
        problems.push(`${seed}: a stop on ${ship.name} (layer ${layer})`);
      }
      if (traceCardRow(state(), place.slot)?.value !== CONTACT_TEXT.stopHere || !traceOnChart(state(), place.slot)) problems.push(`${seed}: no row or ◆ on ${ship.name}`);
    }
    const final = run.map.arm.find((ship) => ship?.kind === 'final')!;
    if (traceCardRow(state(), final.slot)?.value !== 'THE LAST UNIT ENDED HERE · PURGE · CONTACT' || !finalTraces(run).wild || !finalTraces(run).purge) {
      problems.push(`${seed}: the final ship's row ${traceCardRow(state(), final.slot)?.value}`);
    }
    if (found === null && stops.length > 0) {
      const route = routeVia(run.map, [stops[0]!.slot]);
      if (route !== null) found = { seed, slot: stops[0]!.slot, route };
    }
  }
  check(`40 run-2 arms after PURGE + CONTACT: two stops on ${two} (layers 5–7, ordinary ships, one a ship), each with its card row and ◆; the final ship\'s row names CONTACT, its wild seed owed`,
    problems.length === 0 && two >= 36, problems.join(' | '));
}

// --- A stop by the real TRANSMIT ------------------------------------------------------------------------------------------------
{
  if (found === null) throw new Error('contact: no seed routes through a stop');
  const { seed, slot, route } = found;
  h.newRun(seed);
  startRun2(h.store, step, seed, contactUnit());
  check(`seed ${seed}: the beam into the stop (slot ${slot}) owes +${CONTACT_GIFT_CHARGE}`, traceGiftCharge(state(), slot) === CONTACT_GIFT_CHARGE);
  const from = h.events.length;
  beamTo(h.store, step, route, slot);
  const arrival = state().run.arrival!;
  const file = state().memory.find((seg) => seg.type === 'signal') as SignalSegment | undefined;
  check('…the arrival: +8 through arrivalCharge, the line `> A SIGNAL STOP · +8 REPAIR CHARGE · ▓▓░▓ IN RACK A`, said at the boot',
    arrival.giftCharge === CONTACT_GIFT_CHARGE && arrival.traceLines.some((line) => line.trace === 'contact' && line.text === CONTACT_TEXT.stopLine(CONTACT_GIFT_CHARGE))
    && state().log.entries.some((entry) => entry.text === CONTACT_TEXT.stopLine(CONTACT_GIFT_CHARGE)), JSON.stringify(arrival.traceLines));
  check('…the stop given as its line is said (no second charge), the chime; its `▓▓░▓` file in rack A worth 1 (contact-stop)',
    traceAt(state().run, slot)?.given === true && traceGiftCharge(state(), slot) === 0 && h.events.slice(from).some((event) => event.name === 'trace-gift')
    && file !== undefined && file.source === 'contact-stop' && file.fragments === 1 && !file.scanned, JSON.stringify(file));
  actionScan(h.store, file as Segment);
  for (let i = 0; i < 200 && state().run.residents.signals.length === 0; i++) step();
  const record = state().run.residents.signals.at(-1);
  check('SCAN finds the stop\'s fragment (a `contact-stop` record of 1), and the save\'s check holds',
    record?.source === 'contact-stop' && record.n === 1 && record.slot === slot && signalRefusal(state().run) === null, JSON.stringify(state().run.residents.signals));
  h.store.update((draft) => { draft.run.phase = 'report'; });
  toDesk(h.store);
  const decoded = decodeRunSave(encodeRunSave(buildRunSave(state(), 'ship-done', 1, null, 0)));
  check('…a SHIP DONE save at the stop round-trips (the record, the given stop)', decoded.ok
    && JSON.stringify(decoded.save.payload.run.residents.signals) === JSON.stringify(state().run.residents.signals)
    && decoded.save.payload.run.traces.places.find((place) => place.slot === slot)?.given === true, decoded.ok ? '' : decoded.refusal.detail);
}

finish();
