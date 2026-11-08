// Slice 7d (docs/phase3/impl/slice-7-plan.md §6.1 signals/events; R39, R40, OPEN-DECISIONS 19, 31, 49): the three `?` ships
// on seed 7's run 1, by the route that meets them all, ARES-VII → HALCYON → LAPWING (old colony) → PLOVER (gone resident) →
// KITTIWAKE (signal), on the WP7 harness (the real sends, the boots played, the residents and the signal file mounted):
// • the `?` card: from HALCYON's desk the three read their public schedule and `??? · NO TRANSPONDER` for the rest (no
//   colonists, pods, problems, resident, planet, LZs; no ENGINE FAULT or no-go rows), their chart label `NAME · ???` and
//   no ark shape; a visited one reads whole; HERON, a departed resident's ordinary ship, keeps its `unknown` card;
// • the old colony: LAPWING's boot INBOX holds one letter from OLDWELL, SUNDIAL or CANDLEWICK (the ship's own pick), ≤ 6
//   lines, SENT ????; none before LAPWING;
// • the gone resident: PLOVER plays slice 5's departed resident (its note's fragment, `source` 'note');
// • the glyph (R40): none while nothing is held; then on KITTIWAKE (a `?` ship that carries fragments), never on the old
//   colony, and never on HERON's `unknown` card (OD 31 holds);
// • the signal: KITTIWAKE's rack A holds the 1-block `▓▓░▓` file after Cargo Ctrl, not food, SCAN only; SCAN finds its 2
//   fragments once (`SIGNAL · 3/3`, 'signal-event', the TERMINAL's line, INSPECT's line and noise), a second SCAN nothing;
// • the run's records pass the save's check, and a SHIP DONE save there round-trips.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { Segment, SignalSegment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import { createHarness7 } from '../wp7/harness7';
import { send, toDesk } from '../map/repo-fixture';
import { setLandingMode } from '../support/landing-instant';
import { startRun } from '@systems/run';
import { receiveTransmission } from '@systems/boot';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { on } from '@systems/events';
import { cardModel, chartModel } from '@systems/desk';
import { inboxMessages } from '@systems/inbox';
import { signalGlyph, residentInspect, residentSegmentLook, signalStamp } from '@systems/resident-hud';
import { signalCount, signalRefusal, oldColonyOf } from '@systems/signals';
import { targetRefusal } from '@systems/tool-targets';
import { actionScan } from '@state/actions';
import { isInfectable } from '@state/selectors';
import { buildRunSave, encodeRunSave, decodeRunSave } from '@systems/save-codec';
import { UNKNOWN_TEXT } from '@data/unknown-text';
import { TOOL_REFUSAL } from '@data/tool-text';
import { INBOX_BODY_MAX_LINES } from '@data/tuning';

const SEED = 7;
const [HALCYON, LAPWING, PLOVER, KITTIWAKE, HERON] = [2, 8, 10, 14, 4];
const h = createHarness7(SEED);
const st = (): Readonly<GameState> => h.store.getState();
const heard: { name: string; payload: unknown }[] = [];
on('signal-found', (payload) => heard.push({ name: 'signal-found', payload }));
on('signal-event', (payload) => heard.push({ name: 'signal-event', payload }));
const NT = UNKNOWN_TEXT.card.noTransponder;

setLandingMode('manual');
h.newRun(SEED);
startRun(h.store, SEED, FIRST_RUN_LINEAGE);
if (!receiveTransmission(h.store)) throw new Error('events: not on the title');
h.stepUntil(() => st().run.phase === 'flight', 30);
const to = (slot: number): void => {
  if (st().run.phase !== 'desk') h.store.update((draft) => { draft.run.phase = 'report'; });
  send(h.store, slot);
  h.stepUntil(() => st().run.phase === 'flight', 40);
};

// --- HALCYON's desk: the `?` cards -------------------------------------------------------------------------------------------
to(HALCYON);
const desk = (): void => {
  h.store.update((draft) => { draft.run.phase = 'report'; });
  toDesk(h.store);
};
desk();
{
  const rows = (slot: number): Record<string, string> => Object.fromEntries(cardModel(st(), slot).rows.map((row) => [row.key, row.value]));
  const lapwing = cardModel(st(), LAPWING);
  const hidden = ['problems', 'resident', 'planet', 'lzs'];
  check('LAPWING\'s card from HALCYON: `??? COLONISTS`, `??? PODS`, no tags, and `??? · NO TRANSPONDER` for its problems, resident, planet and LZs',
    lapwing.colonists === UNKNOWN_TEXT.card.colonists && lapwing.sub.endsWith('??? PODS') && lapwing.tags.length === 0
    && hidden.every((key) => rows(LAPWING)[key] === NT) && lapwing.top.endsWith('??? COLONISTS'), JSON.stringify(lapwing.rows));
  check('…its public schedule stands: the years, the cost, the fit, the memory, the beam and its noise (02 §3.5)',
    lapwing.schedule !== null && lapwing.timeline !== null && lapwing.cost !== null
    && ['fit', 'memory', 'beam', 'noise'].every((key) => rows(LAPWING)[key] !== undefined && rows(LAPWING)[key] !== NT), JSON.stringify(rows(LAPWING)));
  const all = [LAPWING, PLOVER, KITTIWAKE].map((slot) => cardModel(st(), slot));
  check('…PLOVER and KITTIWAKE (out of reach) read the same; no row names what is aboard (no ENGINE FAULT, no-go or SITE DATA words)',
    all.every((card) => card.colonists === UNKNOWN_TEXT.card.colonists && !card.rows.some((row) => row.key === 'noswap' || row.key === 'nogo')
      && card.rows.filter((row) => ['problems', 'resident', 'planet', 'lzs', 'site'].includes(row.key)).every((row) => row.value === NT)));
  const nodes = chartModel(st()).nodes;
  const node = (slot: number) => nodes.find((candidate) => candidate.slot === slot)!;
  check('the chart: the three `?` nodes are labelled `NAME · ???` and drawn as standard ships; HERON keeps its own label',
    [LAPWING, PLOVER, KITTIWAKE].every((slot) => node(slot).label === UNKNOWN_TEXT.chartNode(node(slot).name) && node(slot).kind !== 'ark')
    && !node(HERON).label.includes('???'), JSON.stringify([LAPWING, PLOVER, KITTIWAKE, HERON].map((slot) => node(slot).label)));
  check('HERON (an ordinary departed resident\'s ship) keeps its card: RESIDENT `unknown`, its colonists', rows(HERON).resident === 'unknown'
    && cardModel(st(), HERON).colonists !== UNKNOWN_TEXT.card.colonists);
  check('no `▓░` glyph while the run holds no fragment', ![PLOVER, KITTIWAKE, HERON].some((slot) => signalGlyph(st(), slot)));
  check('no old colony\'s letter before LAPWING', !inboxMessages(st()).some((message) => message.kind === 'old-colony'));
}

// --- LAPWING: the old colony's letter -----------------------------------------------------------------------------------------
to(LAPWING);
{
  const letters = inboxMessages(st()).filter((message) => message.kind === 'old-colony');
  const colony = oldColonyOf(st().run, LAPWING);
  const depth = st().run.map.route.at(-1)!.depth;
  check(`LAPWING's boot INBOX: one letter from ${colony.name} · FOUNDED BY UNIT-0${colony.unit < 10 ? '0' : ''}${colony.unit}, SENT ????, ≤ ${INBOX_BODY_MAX_LINES} lines, read here`,
    letters.length === 1 && letters[0]!.from === UNKNOWN_TEXT.oldColony.from(colony.name, `UNIT-${String(colony.unit).padStart(3, '0')}`)
    && letters[0]!.sentYear === null && letters[0]!.readAtDepth === depth && letters[0]!.body.length <= INBOX_BODY_MAX_LINES && letters[0]!.tone === 'colony',
    JSON.stringify(letters));
  check('…its card reads whole now that it is visited (from the ship itself)', cardModel(st(), LAPWING).colonists !== UNKNOWN_TEXT.card.colonists);
  check('…and the letter stays in the INBOX on the next ships (derived from the route)', true);
}

// --- PLOVER: the gone resident (slice 5's note) -------------------------------------------------------------------------------
to(PLOVER);
{
  const note = st().memory.find((seg) => seg.type === 'note');
  check('PLOVER plays slice 5\'s departed resident: its note carries the fragment, and no `▓▓░▓` file', note?.type === 'note' && note.fragment
    && !st().memory.some((seg) => seg.type === 'signal'));
  actionScan(h.store, note!);
  h.stepUntil(() => st().resident.left?.noteRead === true, 10);
  check('…SCAN on it finds 1 (`source` note): `SIGNAL · 1/3`', signalCount(st().run) === 1 && st().run.residents.signals[0]?.source === 'note'
    && JSON.stringify(heard.at(-1)) === JSON.stringify({ name: 'signal-found', payload: { slot: PLOVER, count: 1 } }), JSON.stringify(heard));
  desk();
  check('the glyph (R40): on KITTIWAKE (a `?` ship with fragments), not on the visited old colony, not on HERON (OD 31)',
    signalGlyph(st(), KITTIWAKE) && !signalGlyph(st(), LAPWING) && !signalGlyph(st(), HERON) && chartModel(st()).nodes.find((node) => node.slot === KITTIWAKE)?.signal === true);
  check('…KITTIWAKE\'s card still says nothing of its resident or its file', cardModel(st(), KITTIWAKE).rows.find((row) => row.key === 'resident')?.value === NT);
}

// --- KITTIWAKE: the `▓▓░▓` file ------------------------------------------------------------------------------------------------
to(KITTIWAKE);
{
  const file = st().memory.find((seg) => seg.type === 'signal') as SignalSegment | undefined;
  const index = st().memory.findIndex((seg) => seg.type === 'signal');
  const cargo = st().memory.findIndex((seg) => seg.type === 'ship' && seg.role === 'cargo');
  check('KITTIWAKE: rack A holds the 1-block `▓▓░▓` file after Cargo Ctrl, unread, worth 2 (signal-event)',
    file !== undefined && file.name === UNKNOWN_TEXT.signal.name && file.size === 1 && !file.scanned && file.fragments === 2 && file.source === 'signal-event'
    && index > cargo && cargo >= 0 && st().memory.slice(cargo + 1, index).every((seg) => seg.type === 'free' || seg.type !== 'driver'), JSON.stringify(file));
  const rule = (kind: FsToolKind): string | null => targetRefusal(file as Segment, { state: st(), activeKind: kind, pickedSource: null });
  check('…it is no food (a blocker), and takes SCAN only (the log\'s words for the rest)', !isInfectable(file as Segment) && rule('scan') === null
    && rule('delete') === TOOL_REFUSAL.logDelete && rule('copy') === TOOL_REFUSAL.logCopy && rule('move') === TOOL_REFUSAL.logMove
    && rule('repair') === TOOL_REFUSAL.logRepair && rule('swap') === TOOL_REFUSAL.swapShipOnly);
  check('…the strip draws it grey and `?` until read', residentSegmentLook(file as Segment)?.health === '?');
  const logFrom = st().log.entries.length;
  const from = heard.length;
  actionScan(h.store, file as Segment);
  h.stepUntil(() => st().run.residents.signals.length === 2, 20);
  h.stepUntil(() => st().log.entries.slice(logFrom).some((entry) => entry.text === UNKNOWN_TEXT.signal.found(2, 3, 3)), 200);
  const read = st().memory.find((seg) => seg.type === 'signal') as SignalSegment;
  const record = st().run.residents.signals.at(-1);
  check('SCAN reads it: 2 fragments found (3 held), the record `signal-event` × 2 at its depth, `SIGNAL · 3/3`, \'signal-event\'',
    signalCount(st().run) === 3 && record?.source === 'signal-event' && record.n === 2 && record.slot === KITTIWAKE && record.depth === st().run.map.route.at(-1)!.depth
    && JSON.stringify(heard.slice(from)) === JSON.stringify([{ name: 'signal-found', payload: { slot: KITTIWAKE, count: 3 } }, { name: 'signal-event', payload: { slot: KITTIWAKE, n: 2 } }])
    && signalStamp(3).text === 'SIGNAL · 3/3', JSON.stringify(heard.slice(from)));
  check('…the TERMINAL says `> ▓▓░▓ · 2 FRAGMENTS OF THE SIGNAL · 3/3`', st().log.entries.slice(logFrom).some((entry) => entry.text === UNKNOWN_TEXT.signal.found(2, 3, 3)),
    JSON.stringify(st().log.entries.slice(logFrom).map((entry) => entry.text)));
  const inspect = residentInspect(st(), read);
  check('…INSPECT shows its one line, no sender and its noise; the strip its `▓░`', read.scanned && inspect?.note?.lines[0] === UNKNOWN_TEXT.signal.lines['signal-event']
    && inspect.note.noise === UNKNOWN_TEXT.signal.noise && residentSegmentLook(read)?.health === '▓░' && read.desc === UNKNOWN_TEXT.signal.read(2));
  const before = JSON.stringify(st().run.residents.signals);
  actionScan(h.store, read);
  h.stepUntil(() => false, 8);
  check('…a second SCAN finds nothing more', JSON.stringify(st().run.residents.signals) === before && heard.length === from + 2);
  check('the run\'s records pass the save\'s check (each on the route, once, what its ship gives)', signalRefusal(st().run) === null);
  check('past CONTACT\'s price the stamp says the count alone', signalStamp(4).text === 'SIGNAL · 4');
}

// --- A SHIP DONE save at KITTIWAKE round-trips ----------------------------------------------------------------------------------
{
  desk();
  const raw = encodeRunSave(buildRunSave(st(), 'ship-done', 1, null, 0));
  const decoded = decodeRunSave(raw);
  check('a SHIP DONE save at KITTIWAKE with the three records decodes, the records whole',
    decoded.ok && JSON.stringify(decoded.save.payload.run.residents.signals) === JSON.stringify(st().run.residents.signals),
    decoded.ok ? '' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`);
}

finish();
