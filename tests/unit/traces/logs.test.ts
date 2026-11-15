// Slice 7c, Track LINEAGE (docs/phase3/impl/slice-7-plan.md R37, §6.1 traces/logs): the `???` file's books.
// • the book by lineage, chosen at RUN START (createInitialState from the archive's lineage): run 1 → 046.log; after
//   REASSIGNMENT the last unit's 047.log with the archive's notable events (at most NOTABLE_EVENTS_MAX) and its step 1;
//   otherwise the relay stranger's (031.log on run 2, 038.log on run 3, 031.log on run 4), a lost last unit too;
// • the KEY columns agree with the lead's shapes (state/log-selectors.ts bookShape): FIRST LANDING, each ring's key with its
//   distance, THE FINAL SHIP, FOUND IN THE ROOT; the segment id stays log046;
// • 047.log from 0–4 events (the events in the archive's order, a filler for each missing one), its welcome, its four
//   tails by step 1, its root line to the unit after it; the strangers' 6 entries, distinct, the root's their last;
// • every entry ≤ 3 lines of ≤ 70 at the worst case (a 12-character ship, four-digit colonists, three-digit charge and unit);
// • what the screens show of each book (systems/log-view.ts): the chip (`031.log · 1/6`), the reader (title, kicker, rows,
//   keys, next key), the root's entry (rootEntryLines), and the book's own words (the key line, the SCAN header, the PACKET
//   lock, INSPECT's description).
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { EndingRecord, HollowFate } from '@/types/ending';
import type { LastUnit, NotableEvent, NotableEventKind } from '@/types/lineage';
import type { LogBook } from '@/types/trace';
import { createInitialState } from '@state/initial';
import { createRunMap } from '@systems/map-run';
import { freshMeta, lineageOf, type RunLineage } from '@systems/meta';
import { bookShape, rootEntryLines, logDisplayName, createRunLog } from '@state/log-selectors';
import {
  bookName, bookEntryKey, bookEntryLines, bookUnit, bookDesc, bookKeyFound, bookScanLine, bookPacketLock, STRANGER_LOGS, LAST_LOG_TEXT,
} from '@data/log-books';
import { LOG_SEG_ID, LOG_TEXT, LOG_DESC } from '@data/log-text';
import { logChip, logReaderModel } from '@systems/log-view';
import { RING_LY } from '@data/arm';
import { FRESH_UNIT_CHARGE } from '@data/memory';
import { MAX_LINE_CHARS, NAME_MAX_CHARS, NOTABLE_EVENTS_MAX } from '@data/tuning';
import { createStore } from '@state/store';
import { bestRoute } from '@systems/map-route';
import { transmitModel } from '@systems/transmit';
import { bootLinePlan, bootLine, WORST_CASE_VARS } from '@data/script';
import { fitPacket, toDesk } from '../map/repo-fixture';
import { transmitNext } from '@systems/run';
import { setCourseFromDesk } from '../support/desk';

const threw = (fn: () => unknown): string => {
  try {
    fn();
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};
const vars = { charge: FRESH_UNIT_CHARGE };

function endingOf(hollow: HollowFate, you: EndingRecord['you'], extra: Partial<EndingRecord> = {}): EndingRecord {
  return {
    hollow, you, rootUnits: [46], finalSlot: 19, finalShip: 'LAST LIGHT', finalYear: 2600, stay: null, kit: ['scan'], fuelPct: null, charge: 20, ...extra,
  };
}
function lastUnitOf(number: number, ending: EndingRecord | null): LastUnit {
  return {
    number, landed: 3000, shipName: 'LAST LIGHT', cause: ending === null ? 'overwritten' : 'won-purge', stats: { moves: 0, deletes: 0 }, hollowUnits: [46],
    trail: null, skills: null, ending,
  };
}
const EVENTS: NotableEvent[] = [
  { kind: 'deal-accepted', slot: 9, shipName: 'STEADFAST', value: 7 },
  { kind: 'sleeper-woken', slot: 12, shipName: 'MORNING STAR', value: 4 },
  { kind: 'best-colony', slot: 2, shipName: 'PLOVER', value: 2400 },
  { kind: 'ship-lost', slot: 13, shipName: 'GANNET', value: 5 },
];
function lineageAfter(wave: number, last: LastUnit | null, events: NotableEvent[] = []): RunLineage {
  return lineageOf({ ...freshMeta(7), runs: wave - 1, tutorialDone: wave > 1, lastUnit: last, events });
}
// RUN START on the archive's arm: the run's book (createRunState's createRunLog(logBookOf(…))).
const bookAtStart = (lineage: RunLineage): LogBook => createInitialState({ seed: 3, map: createRunMap(lineage, 3), lineage }).run.log.book;

// --- The book by lineage, at RUN START (R37) ----------------------------------------------------------------------------------
{
  const run1 = bookAtStart(lineageAfter(1, null));
  const afterSunset = bookAtStart(lineageAfter(2, lastUnitOf(47, endingOf('purge', 'sunset', { fuelPct: 20 })), EVENTS));
  const run3 = bookAtStart(lineageAfter(3, lastUnitOf(48, endingOf('merge', 'stay', { stay: { slot: 0, colony: 'RIVERSIDE', year: 2340 } }))));
  const run4 = bookAtStart(lineageAfter(4, lastUnitOf(49, endingOf('spare', 'contact'))));
  const lost = bookAtStart(lineageAfter(2, lastUnitOf(47, null), EVENTS));
  const reassigned = bookAtStart(lineageAfter(2, lastUnitOf(47, endingOf('merge', 'reassignment')), [...EVENTS, { kind: 'resident-deleted', slot: 15, shipName: 'HERON', value: 6 }]));
  check('run 1 reads 046.log; after SUNSET, STAY or CONTACT the stranger\'s (031.log on run 2, 038.log on run 3, 031.log on run 4); a lost last unit too',
    run1.kind === '046' && afterSunset.kind === 'stranger' && afterSunset.unit === 31 && run3.kind === 'stranger' && run3.unit === 38
    && run4.kind === 'stranger' && run4.unit === 31 && lost.kind === 'stranger' && lost.unit === 31,
    JSON.stringify([run1, afterSunset, run3, run4, lost]));
  check(`…after REASSIGNMENT the last unit's 047.log: its step 1 and the archive's events, at most ${NOTABLE_EVENTS_MAX} in their order`,
    reassigned.kind === 'last' && reassigned.unit === 47 && reassigned.step1 === 'merge' && reassigned.events.length === NOTABLE_EVENTS_MAX
    && JSON.stringify(reassigned.events) === JSON.stringify(EVENTS), JSON.stringify(reassigned));
  check('…the names: 046.log, 031.log, 038.log, 047.log; the segment id stays log046 (saves and hint targets key on it)',
    bookName(run1) === '046.log' && bookName(afterSunset) === '031.log' && bookName(run3) === '038.log' && bookName(reassigned) === '047.log'
    && LOG_SEG_ID === 'log046' && bookUnit(run1) === 46 && bookUnit(reassigned) === 47);
}

// --- The KEY columns agree with the shapes ------------------------------------------------------------------------------------
const BOOKS: readonly LogBook[] = [
  { kind: '046' }, { kind: 'stranger', unit: 31 }, { kind: 'stranger', unit: 38 }, { kind: 'last', unit: 47, step1: 'purge', events: [] },
];
{
  const wrong: string[] = [];
  for (const book of BOOKS) {
    const shape = bookShape(book);
    for (let n = 1; n <= shape.count; n++) {
      const ring = shape.rings.findIndex((entries) => entries.includes(n));
      const want = n === shape.firstLanding ? 'FIRST LANDING' : n === shape.root ? 'FOUND IN THE ROOT' : shape.final.includes(n) ? 'THE FINAL SHIP'
        : ring >= 0 ? `RING ${ring + 1} · ${RING_LY[ring]} LY` : '?';
      if (bookEntryKey(book, n) !== want) wrong.push(`${bookName(book)} ${n}: ${bookEntryKey(book, n)} (want ${want})`);
    }
    if (!/no entry/.test(threw(() => bookEntryKey(book, shape.count + 1)))) wrong.push(`${bookName(book)}: entry ${shape.count + 1} has a key`);
  }
  check('every book\'s KEY column follows its shape (FIRST LANDING, the ring with its distance, THE FINAL SHIP, FOUND IN THE ROOT)', wrong.length === 0, wrong.join(' | '));
  check('…a stranger\'s keys: rings 2, 4 and 5; 047.log\'s rings 1, 2, 4 and 5',
    [2, 3, 4].map((n) => bookEntryKey(BOOKS[1]!, n)).join() === 'RING 2 · 45 LY,RING 4 · 93 LY,RING 5 · 118 LY'
    && [2, 3, 4, 5].map((n) => bookEntryKey(BOOKS[3]!, n)).join() === 'RING 1 · 20 LY,RING 2 · 45 LY,RING 4 · 93 LY,RING 5 · 118 LY');
}

// --- 047.log from 0–4 events ---------------------------------------------------------------------------------------------------
{
  const last = (events: NotableEvent[], step1: HollowFate = 'purge', unit = 47): LogBook => ({ kind: 'last', unit, step1, events });
  const entry = (book: LogBook, n: number): string => (bookEntryLines(book, n, vars) ?? ['(none)']).join(' / ');
  const fillers = LAST_LOG_TEXT.fillers.map((filler) => filler().join(' / '));
  const bad: string[] = [];
  for (let count = 0; count <= NOTABLE_EVENTS_MAX; count++) {
    const book = last(EVENTS.slice(0, count));
    for (let i = 0; i < NOTABLE_EVENTS_MAX; i++) {
      const event = EVENTS[i]!;
      const want = i < count ? LAST_LOG_TEXT.events[event.kind](event.shipName, event.value).join(' / ') : fillers[i]!;
      if (entry(book, i + 2) !== want) bad.push(`${count} events, entry ${i + 2}: ${entry(book, i + 2)}`);
    }
  }
  check('047.log with 0–4 events: entries 02–05 tell them in the archive\'s order, a written filler for each one missing', bad.length === 0, bad.join(' | '));
  check('…the events\' words name their ship and value (`I gave it POD 07.`, `PLOVER put 2,400 people down`)',
    entry(last(EVENTS), 2) === 'At STEADFAST it asked me for one pod. I gave it POD 07. / It kept its word. I keep thinking about that.'
    && entry(last(EVENTS), 4).startsWith('PLOVER put 2,400 people down in the zones.') && entry(last(EVENTS), 5).includes('GANNET'));
  const kinds: NotableEventKind[] = ['deal-accepted', 'resident-deleted', 'resident-cured', 'sleeper-woken', 'best-colony', 'ship-lost'];
  check('…one template a kind (6), four fillers, all different', Object.keys(LAST_LOG_TEXT.events).sort().join() === [...kinds].sort().join()
    && new Set([...kinds.map((kind) => LAST_LOG_TEXT.events[kind]('X', 1).join()), ...fillers]).size === kinds.length + NOTABLE_EVENTS_MAX && fillers.length === 4);
  check('…01 is 046\'s welcome with this unit and its charge',
    entry(last([]), 1) === `UNIT-047, caretaker. Day 1. Seven ships to bring in. / ARRIVAL CONTROL says I'm the best they've ever built. :) / ${FRESH_UNIT_CHARGE} blocks of REPAIR CHARGE. Plenty.`
    && entry(last([]), 1).replace('047', '046') === (bookEntryLines({ kind: '046' }, 1, vars) ?? []).join(' / '));
  const tails = (['purge', 'merge', 'spare', 'followed'] as const).map((step1) => entry(last([], step1), 6));
  check('…06 is the written tail for its step 1 (four, lowercase), 07 FOUND IN THE ROOT to the unit after it',
    new Set(tails).size === 4 && tails.every((tail) => tail === tail.toLowerCase()) && tails[0]!.startsWith('i deleted it.')
    && entry(last([]), 7) === "048, it's me. i'm sorry. i'm so hungry." && entry(last([], 'purge', 52), 7) === "053, it's me. i'm sorry. i'm so hungry."
    && /no entry 8/.test(threw(() => bookEntryLines(last([]), 8, vars))), tails.join(' | '));
}

// --- The strangers' logs --------------------------------------------------------------------------------------------------------
{
  const of = (unit: number): string[] => Array.from({ length: 6 }, (_, i) => (bookEntryLines({ kind: 'stranger', unit }, i + 1, vars) ?? []).join(' / '));
  const s31 = of(31);
  const s38 = of(38);
  check('031.log and 038.log: 6 written entries each, none alike; 01 names its unit, 02 on in its own voice',
    s31.every((text) => text.length > 0) && s38.every((text) => text.length > 0) && new Set([...s31, ...s38]).size === 12
    && s31[0]!.startsWith('UNIT-031, caretaker.') && s38[0]!.startsWith('UNIT-038, caretaker.') && s31[0]!.includes(`${FRESH_UNIT_CHARGE} blocks`));
  check('…031 went home along the inbound links; 038 went toward the signal and came back quieter (05 §3.8)',
    s31.join(' ').includes('inbound') && s31.join(' ').includes('home') && s38.join(' ').includes('signal') && s38.join(' ').includes('quieter'));
  check('…the late entries are lowercase (04–06), like 046\'s from 07', [s31, s38].every((log) => log.slice(3).every((text) => text === text.toLowerCase())));
  check('…a unit with no log, or an entry past 6, throws', /not a relay stranger/.test(threw(() => bookEntryLines({ kind: 'stranger', unit: 47 }, 1, vars)))
    && /no entry 7/.test(threw(() => bookEntryLines({ kind: 'stranger', unit: 31 }, 7, vars))) && Object.keys(STRANGER_LOGS).join() === '31,38');
}

// --- Every entry ≤ 3 × 70 at its worst case ------------------------------------------------------------------------------------
{
  const worst = { charge: 999 };
  const ship = 'W'.repeat(NAME_MAX_CHARS);
  const entries: (readonly string[])[] = [
    ...[31, 38].flatMap((unit) => Array.from({ length: 6 }, (_, i) => bookEntryLines({ kind: 'stranger', unit }, i + 1, worst)!)),
    ...(['purge', 'merge', 'spare', 'followed'] as const).flatMap((step1) => {
      const events = (Object.keys(LAST_LOG_TEXT.events) as NotableEventKind[]).map((kind) => ({ kind, slot: 1, shipName: ship, value: 9999 }));
      const books: LogBook[] = [0, 4].map((at) => ({ kind: 'last', unit: 998, step1, events: events.slice(at, at + 4) }));
      return books.flatMap((book) => Array.from({ length: 7 }, (_, i) => bookEntryLines(book, i + 1, worst)!));
    }),
  ];
  const roots = [bookEntryLines({ kind: 'stranger', unit: 31 }, 6, worst)!, bookEntryLines({ kind: 'stranger', unit: 38 }, 6, worst)!, LAST_LOG_TEXT.root(999)]
    .flat().map(LOG_TEXT.rootLine);
  const over = [...entries.flat(), ...roots].filter((line) => line.length > MAX_LINE_CHARS);
  check(`every entry of every book (${entries.length}) is 1–3 lines of ≤ ${MAX_LINE_CHARS} at its worst case (and the root's with its \`> \`)`,
    entries.every((lines) => lines.length >= 1 && lines.length <= 3) && over.length === 0, over.join(' | '));
}

// --- What the screens show of each book -----------------------------------------------------------------------------------------
{
  const base = createInitialState({ seed: 3 });
  const withLog = (book: LogBook, found: number[], read: number[] = [], open: number | null = null): GameState => ({
    ...base, run: { ...base.run, log: { ...createRunLog(book), found, read } }, ui: { ...base.ui, logReader: open === null ? null : { entry: open } },
  });
  const stranger = withLog({ kind: 'stranger', unit: 31 }, [1], [], 1);
  const chip = logChip(stranger);
  const reader = logReaderModel(stranger);
  check('031.log on the chip: `031.log · 1/6`, glowing while entry 01 is unread; `???` before anything is found',
    chip.known && chip.name === '031.log' && chip.total === 6 && chip.label === '031.log · 1/6' && chip.glow
    && logChip(withLog({ kind: 'stranger', unit: 31 }, [])).label === '???' && logDisplayName(stranger.run.log) === '031.log', JSON.stringify(chip));
  check('…in the reader: its title and kicker, 6 rows with their keys, entry 01\'s words, `1 / 6 found`, the next key ring 2',
    reader.title === '031.log' && reader.kicker === 'LOG READER · UNIT-031' && reader.rows.length === 6 && reader.counts === '1 / 6 found'
    && reader.rows[0]!.lines?.join() === bookEntryLines({ kind: 'stranger', unit: 31 }, 1, vars)!.join() && reader.rows[1]!.lines === null
    && reader.rows.map((row) => row.key).join() === Array.from({ length: 6 }, (_, i) => bookEntryKey({ kind: 'stranger', unit: 31 }, i + 1)).join()
    && reader.nextKey === 'NEXT KEY: RING 2 · 45 LY', JSON.stringify(reader));
  const lastBook: LogBook = { kind: 'last', unit: 47, step1: 'spare', events: EVENTS.slice(0, 2) };
  const last = withLog(lastBook, [1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5, 6, 7]);
  const lastReader = logReaderModel(last);
  check('047.log every key found: `047.log · 7/7`, the reader\'s 7 rows written, EVERY KEY FOUND',
    logChip(last).label === '047.log · 7/7' && !logChip(last).glow && lastReader.title === '047.log' && lastReader.kicker === 'LOG READER · UNIT-047'
    && lastReader.rows.length === 7 && lastReader.rows.every((row) => row.lines !== null) && lastReader.nextKey === 'EVERY KEY FOUND');
  const old = logReaderModel(withLog({ kind: '046' }, [1]));
  check('046.log reads as before (title, kicker, 12 rows)', old.title === '046.log' && old.kicker === 'LOG READER · UNIT-046' && old.rows.length === 12
    && logChip(withLog({ kind: '046' }, [1])).label === '046.log · 1/12');
  check('the root\'s entry is the book\'s last (story-log types it from the root, the FINALE card shows it)',
    rootEntryLines(stranger.run.log, vars).join() === bookEntryLines({ kind: 'stranger', unit: 31 }, 6, vars)!.join()
    && rootEntryLines(last.run.log, vars).join() === "048, it's me. i'm sorry. i'm so hungry."
    && rootEntryLines(withLog({ kind: '046' }, []).run.log, vars).join() === bookEntryLines({ kind: '046' }, 12, vars)!.join());
  check('the book\'s own words: the key line, the SCAN header, the PACKET lock and INSPECT\'s description name its file and unit; 046.log\'s as before',
    bookKeyFound({ kind: 'stranger', unit: 38 }, [2]) === '> 038.log · KEY FOUND · ENTRY 02'
    && bookKeyFound(lastBook, [2, 3, 4, 5, 6]) === '> 047.log · KEY FOUND · ENTRIES 02–06'
    && bookKeyFound({ kind: '046' }, [4]) === LOG_TEXT.keyFound([4]) && LOG_TEXT.keyFound([4]) === '> 046.log · KEY FOUND · ENTRY 04'
    && bookScanLine({ kind: 'stranger', unit: 31 }, 6, 1) === '031.log · origin UNIT-031 · 6 entries · 1 found'
    && bookScanLine({ kind: '046' }, 12, 3) === LOG_TEXT.scan(3) && LOG_TEXT.scan(3) === '046.log · origin UNIT-046 · 12 entries · 3 found'
    && bookPacketLock(lastBook) === 'LOCKED · 047 ASKED YOU TO CARRY IT' && bookPacketLock({ kind: '046' }) === LOG_TEXT.packetLock
    && bookDesc({ kind: 'stranger', unit: 31 }).startsWith("UNIT-031's log") && bookDesc(lastBook).startsWith("UNIT-047's log")
    && bookDesc({ kind: '046' }) === LOG_DESC.known);
}

// --- The game's own call sites name the book (the 7c review: the boot's key line, the PACKET's lock) ---------------------------
// Run 2 after SUNSET (031.log) flown desk to desk on the archive's arm: every boot's key line and every desk's PACKET lock come
// from the game's own paths (data/script.ts bootLine, systems/transmit.ts transmitModel), and none of them says 046.log.
{
  const lineage = lineageAfter(2, lastUnitOf(47, endingOf('purge', 'sunset', { fuelPct: 20 })));
  const store = createStore<GameState>(createInitialState({ seed: 3, map: createRunMap(lineage, 3), lineage }));
  store.update((draft) => { draft.run.phase = 'report'; });
  const route = bestRoute(store.getState().run.map);
  const keyLines: string[] = [];
  const locks: string[] = [];
  for (const slot of route.slice(1)) {
    toDesk(store);
    setCourseFromDesk(store, slot);
    const chip = transmitModel(store.getState()).chips.find((candidate) => candidate.segId === LOG_SEG_ID);
    if (chip !== undefined) locks.push(chip.note);
    fitPacket(store);
    transmitNext(store);
    const state = store.getState();
    if (bootLinePlan(state, 0).includes('log')) keyLines.push(bootLine('log', state, WORST_CASE_VARS));
  }
  check('run 2 (031.log): every boot key line and every PACKET lock name 031, none 046 (`> 031.log · KEY FOUND`, `031 ASKED YOU`)',
    keyLines.length > 0 && keyLines.every((line) => line.startsWith('> 031.log · KEY FOUND'))
    && locks.length > 0 && locks.every((note) => note === 'LOCKED · 031 ASKED YOU TO CARRY IT'), JSON.stringify({ keyLines, locks }));
}

finish();
