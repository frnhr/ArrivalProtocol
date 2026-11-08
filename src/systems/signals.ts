// Slice 7d: the lead's pure rules for the signals and the `?` ships (docs/phase3/impl/slice-7-plan.md §2.2 7d, §2.4 7d,
// R39–R41; 02-map §3.5, 05-story §3.3, §3.7), DOM-free and stateless, so state/initial.ts (the signal file at a ship's
// build), the codec (the records' check), the INBOX (the old colony's letter), the FINALE (CONTACT's price) and the views all
// read one rule. The stateful part (the SCAN that finds the fragments, the file's tool rule, the card) is
// systems/unknown-events.ts.
// • The fragments a run holds (signalCount): the sum of its records' `n`, wherever found (a note, the signal ship, a
//   CONTACT stop). CONTACT's price is SIGNALS_FOR_CONTACT of them.
// • The `▓▓░▓` file a ship holds in rack A (signalFileAt): the signal `?` ship's (UNKNOWN_EVENTS_BUILT, its reservation's
//   SIGNAL_EVENT_FRAGMENTS) or a CONTACT stop's (TRACES_BUILT.contact, its place not yet given, CONTACT_STOP_FRAGMENTS).
//   Never both: a trace place is never on a `?` ship (systems/traces.ts placeExcluded).
// • A `?` ship shows its `??? · NO TRANSPONDER` card until it is visited (unknownShown).
// • The old colony `?` ship's letter, one of OLD_COLONIES by the ship's own stream (unknownMessages).
// • The save's check of the records (signalRefusal, RUN_SAVE_VERSION 9).
import type { RunState } from '@state/schema';
import type { ArmShip } from '@/types/map';
import type { SignalSource } from '@/types/resident';
import type { SignalSegment } from '@/types/segment';
import type { InboxMessage } from '@/types/inbox';
import type { OldColony } from '@data/unknown';
import { armShipAt, shipRng } from '@systems/map-streams';
import { traceAt } from '@systems/traces';
import { traceBuilt } from '@data/traces';
import { UNKNOWN_EVENTS_BUILT, OLD_COLONIES, SIGNAL_SEG_ID } from '@data/unknown';
import { UNKNOWN_TEXT } from '@data/unknown-text';
import { unitName } from '@data/hollow-text';
import { SIGNALS_FOR_CONTACT, SIGNAL_EVENT_FRAGMENTS, CONTACT_STOP_FRAGMENTS, SIGNAL_FILE_BLOCKS } from '@data/tuning';

const FILE_SOURCES: readonly SignalSegment['source'][] = ['signal-event', 'contact-stop'];

// --- The count (CONTACT's price) -------------------------------------------------------------------------------------------

// The signal fragments the run holds: every SCAN's `n`, summed.
export function signalCount(run: Readonly<Pick<RunState, 'residents'>>): number {
  return run.residents.signals.reduce((sum, record) => sum + record.n, 0);
}

// Does the run hold CONTACT's price (R41: SIGNALS_FOR_CONTACT fragments)?
export function contactPaid(run: Readonly<Pick<RunState, 'residents'>>): boolean {
  return signalCount(run) >= SIGNALS_FOR_CONTACT;
}

// --- The `▓▓░▓` file -------------------------------------------------------------------------------------------------------

function armShip(run: Readonly<Pick<RunState, 'map'>>, slot: number): ArmShip | null {
  const ship = run.map.arm[slot];
  return ship === undefined || ship === null ? null : ship;
}

// What the ship in `slot` keeps in its `▓▓░▓` file this run, or null: the signal `?` ship's fragments (its reservation's,
// which must be SIGNAL_EVENT_FRAGMENTS), or a CONTACT stop's while its place waits. A source already found this run holds
// nothing more (a ship is met once a run; a file found is a file read).
export function signalSourceAt(
  run: Readonly<Pick<RunState, 'map' | 'traces' | 'residents'>>, slot: number,
): { source: SignalSegment['source']; fragments: number } | null {
  const ship = armShip(run, slot);
  if (ship === null) return null;
  const found = (source: SignalSource): boolean => run.residents.signals.some((record) => record.slot === slot && record.source === source);
  if (UNKNOWN_EVENTS_BUILT && ship.reserved.unknownEvent === 'signal' && !found('signal-event')) {
    if (ship.reserved.fragments !== SIGNAL_EVENT_FRAGMENTS) {
      throw new Error(`signalSourceAt: the signal ship ${ship.name} carries ${ship.reserved.fragments} fragments, not ${SIGNAL_EVENT_FRAGMENTS}`);
    }
    return { source: 'signal-event', fragments: SIGNAL_EVENT_FRAGMENTS };
  }
  const place = traceAt(run, slot);
  if (traceBuilt('contact') && place !== null && place.kind === 'contact' && !place.given && !found('contact-stop')) {
    return { source: 'contact-stop', fragments: CONTACT_STOP_FRAGMENTS };
  }
  return null;
}

// The ship's `▓▓░▓` file, as state/initial.ts createShipSlices lays it in rack A after the resident's files, or null.
export function signalFileAt(run: Readonly<Pick<RunState, 'map' | 'traces' | 'residents'>>, slot: number): SignalSegment | null {
  const held = signalSourceAt(run, slot);
  if (held === null) return null;
  return {
    id: SIGNAL_SEG_ID, name: UNKNOWN_TEXT.signal.name, type: 'signal', size: SIGNAL_FILE_BLOCKS, scanned: false,
    source: held.source, fragments: held.fragments, desc: UNKNOWN_TEXT.signal.desc,
  };
}

// --- The `?` card (R39) ----------------------------------------------------------------------------------------------------

// Does the SHIP CARD of `slot` read `??? · NO TRANSPONDER` (and the chart's label `???`): a `?` ship of the arm, not yet
// visited this run, while the `?` ships are built.
export function unknownShown(run: Readonly<Pick<RunState, 'map'>>, slot: number): boolean {
  if (!UNKNOWN_EVENTS_BUILT) return false;
  const ship = armShip(run, slot);
  return ship !== null && ship.reserved.unknownEvent !== null && !run.map.route.some((stop) => stop.slot === slot);
}

// --- The old colony's letter (R39) -----------------------------------------------------------------------------------------

// The old colony a `?` ship's receiver holds a letter from: one of OLD_COLONIES, by the ship's own stream (its ShipKey, so
// the same ship holds the same letter on any route and next run).
export function oldColonyOf(run: Readonly<Pick<RunState, 'seed' | 'map'>>, slot: number): OldColony {
  const roll = shipRng(run, slot, 'old-colony')();
  return OLD_COLONIES[Math.min(OLD_COLONIES.length - 1, Math.floor(roll * OLD_COLONIES.length))]!;
}

// The old colony `?` ship's letter, read at its boot once the route reaches it (systems/inbox.ts deriveMessages, with the
// route's other mail): from the colony, by its founding unit, SENT ???? (the colony's clock is not the receiver's), RECEIVED
// in the ship's approach year. None while the `?` ships are down.
export function unknownMessages(run: Readonly<Pick<RunState, 'seed' | 'map'>>): InboxMessage[] {
  if (!UNKNOWN_EVENTS_BUILT) return [];
  const out: InboxMessage[] = [];
  for (const stop of run.map.route) {
    const ship = armShipAt(run.map, stop.slot);
    if (ship.reserved.unknownEvent !== 'old-colony') continue;
    const colony = oldColonyOf(run, stop.slot);
    const letter = UNKNOWN_TEXT.oldColony.letters[colony.name];
    if (letter === undefined) throw new Error(`unknownMessages: no letter for the old colony ${colony.name}`);
    const unit = unitName(colony.unit);
    out.push({
      id: `old-colony:${stop.slot}`, kind: 'old-colony', from: UNKNOWN_TEXT.oldColony.from(colony.name, unit), sentYear: null,
      receivedYear: stop.hop?.approachYear ?? ship.approachYear, readAtDepth: stop.depth, subject: letter.subject,
      body: [...letter.lines(unit)], tag: null, tone: 'colony',
    });
  }
  return out;
}

// --- The save's check (RUN_SAVE_VERSION 9) ---------------------------------------------------------------------------------

// What is wrong with the run's signal records, or null. Each is on the route at its depth, once per slot and source, and is
// what that ship could give: a note's on a departed resident's ship whose note carries fragments (no more than it carries),
// the signal event's on the signal `?` ship with exactly its fragments, a CONTACT stop's on a contact place with
// CONTACT_STOP_FRAGMENTS. Found during its ship (a SCAN), so it never needs the ship's record.
export function signalRefusal(run: Readonly<Pick<RunState, 'map' | 'traces' | 'residents'>>): string | null {
  const seen = new Set<string>();
  for (const [i, record] of run.residents.signals.entries()) {
    const at = `signal ${i} (slot ${record.slot}, ${record.source})`;
    const stop = run.map.route[record.depth - 1];
    if (stop === undefined || stop.slot !== record.slot) return `${at} is at depth ${record.depth}, off the route`;
    const key = `${record.slot}:${record.source}`;
    if (seen.has(key)) return `${at} is found twice`;
    seen.add(key);
    if (!(Number.isInteger(record.n) && record.n >= 1)) return `${at} found ${record.n} fragments`;
    const ship = armShip(run, record.slot);
    if (ship === null) return `${at} is no ship of the arm`;
    switch (record.source) {
      case 'note':
        if (ship.reserved.resident?.kind !== 'left' || record.n > ship.reserved.fragments) {
          return `${at} found ${record.n}, whose note carries ${ship.reserved.resident?.kind === 'left' ? ship.reserved.fragments : 0}`;
        }
        break;
      case 'signal-event':
        if (ship.reserved.unknownEvent !== 'signal' || record.n !== ship.reserved.fragments) return `${at} found ${record.n} off the signal ship's ${ship.reserved.fragments}`;
        break;
      case 'contact-stop': {
        const place = traceAt(run, record.slot);
        if (place?.kind !== 'contact' || record.n !== CONTACT_STOP_FRAGMENTS) return `${at} found ${record.n}, and no CONTACT stop waits there`;
        break;
      }
      default:
        return `${at}: an unknown source`;
    }
  }
  return null;
}

// The run's sources as the codec reads them (save-codec's field check).
export const SIGNAL_SOURCES: readonly SignalSource[] = ['note', ...FILE_SOURCES];

