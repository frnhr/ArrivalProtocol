// Phase 3 slice 2, Track UI (slice-2-plan §5.3, §6.1): the DOM-free models behind the threat ladder's screens, on
// crafted states (run.threat, run.log, beam-flagged hollow segments, ui.logReader set directly), no flight flown:
// • the TRACE meter (systems/hollow-hud.ts traceMeter): hidden on a calm run, `TRACE ■■□` with `1 MORE AND IT FINDS
//   YOU` one short, `■■■ +1` past a full meter, `IT RIDES WITH YOU · 10 BLOCKS` once HOLLOW is aboard; a beam seed in
//   memory shows it;
// • the LANDING REPORT's TRACE line (reportTraceLine) from tallyPreview: the seeds left, TRACE before → after; HOLLOW
//   aboard: they feed it; a ship whose seeds were all deleted says nothing reports home; none met: no line;
// • NEXT BITE on a calm-only wake: the calm clock's remainder, frozen while calmAiSec stands (TACTICAL), never jumping;
//   `?:??` on VESPER's silent boarding until the capture;
// • the PACKET (systems/transmit.ts): KESTREL → VESPER carries the uninvited `??? · 10 BLOCKS · NOT YOURS · RIDES FREE`
//   (no link room), the boarding warning on the TRACE line, and 046.log as `046.log · 3/12`, glowing while unread;
//   VESPER → LAST LIGHT carries it at 16 with its fed share, and `NO RM · YOU CAN'T DELETE THE ROOT` without a working rm;
// • the LOG READER (systems/log-view.ts): one row per entry (number, KEY, text or `[NOT FOUND YET]`), the open entry,
//   the next key, the entry a chip click opens; story-log's actions open, mark read and close it.
import { check, finish } from '../wp1/harness';
import { createStore, type Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { HollowSegment, Segment } from '@/types/segment';
import { createInitialState } from '@state/initial';
import { freshUnitRacks } from '@systems/carry';
import { traceMeter, reportTraceLine, biteClock, TRACE_UI_TEXT } from '@systems/hollow-hud';
import { transmitModel } from '@systems/transmit';
import { endShip, goTransmit } from '@systems/run';
import { logChip, logReaderModel, logEntryToOpen, adjacentFoundEntry, LOG_UI_TEXT } from '@systems/log-view';
import { openLogReader, closeLogReader, markLogEntryRead } from '@systems/story-log';
import { noWorkingRm } from '@state/threat-selectors';
import { beamIfLeftText, BEAM_SEED_INSPECT } from '@components/memory-view/DetailPanel';
import { hollowLabel } from '@systems/say';
import { SEEDS_ONLY_DEF } from '@data/threats';
import { THREAT_TEXT } from '@data/threat-text';
import { LOG_TEXT, LOG_ENTRY_COUNT } from '@data/log-text';
import { HOLLOW_HUD_TEXT, UNNAMED_HOLLOW } from '@data/hollow-text';
import { BEAM_SEED_FIRST_BITE_CALM_SEC, MAX_LINE_CHARS } from '@data/tuning';
import { classicShip } from '@data/classic-five';

const KESTREL = 2;
const VESPER = 3;

function world(shipIndex: number, seed = 7): Store<GameState> {
  // A later ship meets a fresh unit carried in (the way the harnesses build a ship alone); ship 1 writes its own racks.
  const carried = shipIndex === 0 ? null : freshUnitRacks(classicShip(shipIndex));
  return createStore(createInitialState({ seed, shipIndex, carried }));
}

// A 2-block beam seed cut from the front of the first free run that has room (memory stays 384 blocks).
function plantBeamSeed(store: Store<GameState>, id: string): void {
  store.update((draft) => {
    const index = draft.memory.findIndex((seg) => seg.type === 'free' && seg.size >= 4);
    const free = draft.memory[index];
    if (!free) throw new Error('plantBeamSeed: no free run of 4 blocks');
    free.size -= 2;
    const seed: HollowSegment = { id, name: UNNAMED_HOLLOW, type: 'hollow', size: 2, root: false, locked: false, owner: UNNAMED_HOLLOW, seed: true, beam: true };
    draft.memory.splice(index, 0, seed);
    draft.ui.memoryRev++;
  });
}

function removeBeamSeeds(store: Store<GameState>): void {
  store.update((draft) => {
    draft.memory = draft.memory.map((seg): Segment => (seg.type === 'hollow' && seg.beam ? { id: `${seg.id}-gone`, name: 'FREE', type: 'free', size: seg.size } : seg));
    draft.ui.memoryRev++;
  });
}

// --- The TRACE meter -------------------------------------------------------------------------------------------------
{
  const store = world(0);
  const meter = (): ReturnType<typeof traceMeter> => traceMeter(store.getState());
  check('a calm ship with TRACE 0 and no seed: the meter is hidden', !meter().visible && meter().text === 'TRACE □□□', meter().text);
  store.update((draft) => { draft.run.threat.trace = 1; });
  check('TRACE 1: `TRACE ■□□`, shown, quiet', meter().visible && meter().text === 'TRACE ■□□' && meter().tone === 'quiet' && meter().note === null,
    `${meter().text} ${meter().tone}`);
  store.update((draft) => { draft.run.threat.trace = 2; });
  check('TRACE 2: `TRACE ■■□` · 1 MORE AND IT FINDS YOU (warn)', meter().text === 'TRACE ■■□'
    && meter().note === THREAT_TEXT.traceOneMore && meter().tone === 'warn', `${meter().text} / ${meter().note}`);
  store.update((draft) => { draft.run.threat.trace = 4; });
  check('TRACE 4: the cells cap at three, `■■■ +1` (full)', meter().cells === '■■■ +1' && meter().filled === 3 && meter().over === 1
    && meter().tone === 'full', meter().cells);
  store.update((draft) => { draft.run.threat.trace = 0; });
  plantBeamSeed(store, 'beam-seed-1');
  check('a beam seed in memory shows the meter at TRACE 0', meter().visible && meter().text === 'TRACE □□□');
  check('the meter\'s words fit a line', [meter().text, THREAT_TEXT.traceOneMore, TRACE_UI_TEXT.clean('■■■ +9')].every((line) => line.length <= MAX_LINE_CHARS));

  const vesper = world(VESPER);
  const aboard = traceMeter(vesper.getState());
  const root = vesper.getState().memory.find((seg): seg is HollowSegment => seg.type === 'hollow' && seg.root);
  check('VESPER (HOLLOW aboard, the 10-block root in its slot): `IT RIDES WITH YOU · 10 BLOCKS` in the meter\'s place',
    root?.size === 10 && aboard.visible && aboard.aboard && aboard.text === THREAT_TEXT.ridesWithYou(10) && aboard.tone === 'aboard', aboard.text);
}

// --- The LANDING REPORT's TRACE line ---------------------------------------------------------------------------------
{
  const store = world(KESTREL);
  check('no seed met, none left: no TRACE line', reportTraceLine(store.getState()) === null);
  plantBeamSeed(store, 'beam-seed-a');
  plantBeamSeed(store, 'beam-seed-b');
  const two = reportTraceLine(store.getState());
  check('two beam seeds left at TRACE 0: `2 SEEDS LEFT BEHIND · THEY REPORT HOME · TRACE □□□ → ■■□` (warn)',
    two?.text === '2 SEEDS LEFT BEHIND · THEY REPORT HOME · TRACE □□□ → ■■□' && two.tone === 'warn', two?.text);
  store.update((draft) => { draft.run.threat.trace = 1; });
  removeBeamSeeds(store);
  plantBeamSeed(store, 'beam-seed-c');
  const one = reportTraceLine(store.getState());
  check('one left at TRACE 1: `1 SEED LEFT BEHIND · IT REPORTS HOME · TRACE ■□□ → ■■□`',
    one?.text === '1 SEED LEFT BEHIND · IT REPORTS HOME · TRACE ■□□ → ■■□', one?.text);
  removeBeamSeeds(store);
  // The beam into this ship brought a seed (the arrival report THREAT's transmitNext writes; a ship built alone has none).
  store.update((draft) => {
    draft.run.arrival = {
      hits: [], chargeCarried: 0, starCredit: 0, stars: 0, card: null, cardCharge: 0, chargeFloorAdded: 0, chargeOverflowLost: 0, eccCorrected: 0,
      scripted: [], seeds: [{ segId: 'beam-seed-c', targetName: 'Telemetry' }], boarded: null,
    };
  });
  const clean = reportTraceLine(store.getState());
  check('the beam\'s seeds all deleted: the line says nothing reports home (good)', clean?.text === TRACE_UI_TEXT.clean('■□□') && clean.tone === 'good', clean?.text);

  const vesper = world(VESPER);
  plantBeamSeed(vesper, 'beam-seed-v');
  const fed = reportTraceLine(vesper.getState());
  check('HOLLOW aboard: a seed left feeds it (`1 SEED LEFT BEHIND · IT FEEDS ???`)', fed?.text === THREAT_TEXT.reportFed(1, UNNAMED_HOLLOW)
    && fed.tone === 'fed', fed?.text);
}

// --- NEXT BITE on a calm-only wake, and VESPER's silence ---------------------------------------------------------------
{
  const store = world(KESTREL);
  plantBeamSeed(store, 'beam-seed-k');
  store.update((draft) => {
    draft.hollow.cfg = SEEDS_ONLY_DEF;
    draft.hollow.phase = 'asleep';
    draft.hollow.calmAiSec = 10;
  });
  const first = biteClock(store.getState());
  check('a calm-only wake counts calm AI seconds: NEXT BITE is the calm clock\'s remainder',
    first.secLeft === BEAM_SEED_FIRST_BITE_CALM_SEC - 10 && first.key === HOLLOW_HUD_TEXT.nextBite, first.text);
  store.mutate((draft) => { draft.clock.aiSec += 7; });
  check('…frozen while the calm clock stands (TACTICAL): AI time alone does not move it', biteClock(store.getState()).secLeft === first.secLeft,
    biteClock(store.getState()).text);
  let last = first.secLeft ?? Infinity;
  let rose = false;
  for (let i = 0; i < 70; i++) {
    store.mutate((draft) => {
      draft.clock.aiSec += 0.5;
      if (i % 3 !== 0) draft.hollow.calmAiSec += 0.5;   // a TACTICAL tick every third
    });
    const now = biteClock(store.getState()).secLeft;
    if (now === null || now > last) rose = true;
    last = now ?? last;
  }
  check('…and never jumps up as calm and TACTICAL alternate', !rose && last === 0, String(last));
  store.update((draft) => { draft.hollow.wakeHeld = true; });
  check('…a debris dodge holding the wake shows no time', biteClock(store.getState()).time === HOLLOW_HUD_TEXT.noTimer);

  const vesper = world(VESPER);
  const silent = biteClock(vesper.getState());
  check('VESPER before the capture: HOLLOW asleep on its scripted wake, `NEXT BITE ?:??`', vesper.getState().hollow.phase === 'asleep'
    && silent.secLeft === null && silent.text === `${HOLLOW_HUD_TEXT.nextBite} ${HOLLOW_HUD_TEXT.noTimer}`, silent.text);
}

// --- The PACKET ------------------------------------------------------------------------------------------------------
function toTransmit(store: Store<GameState>): void {
  store.update((draft) => { draft.run.phase = 'report'; });
  endShip(store, 'locked');
  goTransmit(store, store.getState().run.shipIndex + 1);
  if (store.getState().run.phase !== 'transmit') throw new Error(`toTransmit: phase ${store.getState().run.phase}`);
}

{
  const store = world(KESTREL);
  toTransmit(store);
  const model = transmitModel(store.getState());
  check('KESTREL → VESPER: HOLLOW boards (forced) and rides as the uninvited chip, `??? · 10 BLOCKS · NOT YOURS · RIDES FREE`',
    model.uninvited?.text === '??? · 10 BLOCKS · NOT YOURS · RIDES FREE' && model.uninvited.boards && model.uninvited.blocks === 10
    && model.uninvited.note === 'NOT YOURS · RIDES FREE' && model.uninvited.fedText === null, model.uninvited?.text);
  check('…it costs no link room (the packet\'s files are the unit\'s own)', model.files === store.getState().run.transit?.filesBlocks);
  check('…the TRACE line says it found you anyway (forced one hop from the final ship, not by TRACE: minor 2)',
    model.trace?.tone === 'boards' && model.trace.text.endsWith(THREAT_TEXT.foundYouAnyway) && !model.trace.text.includes(THREAT_TEXT.willFindYou), model.trace?.text);
  store.update((draft) => { draft.run.transit!.threat.boards = 'trace'; });
  check('…and, boarding by TRACE (slice 3\'s routes), that it finds you on this beam', transmitModel(store.getState()).trace?.text.endsWith(THREAT_TEXT.willFindYou) === true);
  store.update((draft) => { draft.run.transit!.threat.boards = 'forced'; });
  check('…no NO RM warning (not the beam to the final ship)', model.noRm === null);
  const logOf = (): ReturnType<typeof transmitModel>['chips'][number] | undefined => transmitModel(store.getState()).chips.find((chip) => chip.log);
  check('046.log rides locked (`LOCKED · 046 ASKED YOU TO CARRY IT`), `???` while it is unknown, no glow', logOf()?.lock === 'log'
    && logOf()?.note === LOG_TEXT.packetLock && logOf()?.name === '???' && logOf()?.glow === false, logOf()?.name);
  store.update((draft) => { draft.run.log.found = [1, 2, 3]; draft.run.log.read = [1, 2]; });
  check('…keys found: `046.log · 3/12`, glowing while entry 03 is unread', logOf()?.name === '046.log · 3/12' && logOf()?.glow === true, logOf()?.name);
  store.update((draft) => { draft.run.log.read = [1, 2, 3]; });
  check('…all read: no glow', logOf()?.glow === false);
  check('a chip click opens the entry left unread, else the last found', logEntryToOpen(store.getState()) === 3);
}

{
  const store = world(VESPER);
  store.update((draft) => { draft.run.hollowNamed = true; });
  toTransmit(store);
  // Track THREAT's endShip writes the ship's own tally (none left here), so the fed blocks are set after it.
  store.update((draft) => { draft.run.threat.lastTally = { left: 2, traceBefore: 1, traceAfter: 1, fed: true }; });
  const model = transmitModel(store.getState());
  const owner = model.uninvited?.owner ?? '';
  check('VESPER → LAST LIGHT: HOLLOW rides at the FINALE\'s 16, named, not boarding (already aboard)', model.uninvited?.blocks === 16
    && owner !== UNNAMED_HOLLOW && !model.uninvited.boards && model.uninvited.text === THREAT_TEXT.uninvitedChip(owner, 16), model.uninvited?.text);
  check('…on the final beam feeding changes nothing (its root is the FINALE\'s 16): no `SEEDS FED IT` (minor 3)',
    model.uninvited?.fedText === null && model.uninvited.fed === 0, model.uninvited?.fedText ?? 'none');
  store.update((draft) => { draft.run.transit!.threat.isFinal = false; });
  const notFinal = transmitModel(store.getState());
  check('…a beam HOLLOW rides into a ship before the final one says why it grew (`+2: 2 SEEDS FED IT`)',
    notFinal.uninvited?.fedText === THREAT_TEXT.uninvitedFed(owner, 16, 2), notFinal.uninvited?.fedText ?? 'none');
  store.update((draft) => { draft.run.transit!.threat.isFinal = true; });
  check('…no TRACE line while it already rides with you', model.trace === null, model.trace?.text);
  const hasRm = !noWorkingRm(store.getState());
  check('…NO RM only when no working rm is aboard', model.noRm === (hasRm ? null : THREAT_TEXT.noRmPacket), `rm aboard: ${hasRm}`);
  store.update((draft) => {
    draft.memory = draft.memory.map((seg): Segment => (seg.type === 'fs-tool' && seg.fsTool === 'delete' ? { id: `${seg.id}-gone`, name: 'FREE', type: 'free', size: seg.size } : seg));
  });
  check('…with the last rm gone: `NO RM · YOU CAN\'T DELETE THE ROOT` before the beam to the final ship',
    transmitModel(store.getState()).noRm === THREAT_TEXT.noRmPacket);
  check('the packet\'s new words fit a line', [THREAT_TEXT.noRmPacket, model.uninvited?.text ?? '', notFinal.uninvited?.fedText ?? '',
    `${THREAT_TEXT.trace(2)} · ${THREAT_TEXT.willFindYou}`, `${THREAT_TEXT.trace(2)} · ${THREAT_TEXT.foundYouAnyway}`].every((line) => line.length <= MAX_LINE_CHARS));
}

// INSPECT's `if left` row (minor 3): TRACE before HOLLOW boards, its next root once aboard, nothing on the final ship.
{
  const owner = hollowLabel(world(VESPER).getState().run);
  check('INSPECT on a beam-born block: `if left` reports home (KESTREL), feeds HOLLOW (VESPER), and says nothing on the final ship',
    beamIfLeftText(world(KESTREL).getState()) === BEAM_SEED_INSPECT.reports && beamIfLeftText(world(VESPER).getState()) === BEAM_SEED_INSPECT.feeds(owner)
    && beamIfLeftText(world(VESPER + 1).getState()) === null);
}

// --- The LOG READER --------------------------------------------------------------------------------------------------
{
  const store = world(1);
  const state = (): GameState => store.getState();
  check('nothing found: the chip reads `???`, the reader can open on nothing', logChip(state()).label === '???' && logEntryToOpen(state()) === null);
  store.update((draft) => { draft.run.log.found = [1, 2]; });
  openLogReader(store, 1);
  let model = logReaderModel(state());
  check('the reader has one row per entry, open on entry 01', model.rows.length === LOG_ENTRY_COUNT && model.open === 1
    && model.rows[0]?.open === true && model.rows[0].num === '01');
  check('…a found entry shows its KEY and its text (entry 01: FIRST LANDING, three lines)', model.rows[0]?.key === 'FIRST LANDING'
    && model.rows[0].lines?.length === 3 && model.rows[0].found, model.rows[0]?.lines?.join(' / '));
  check('…an entry not found yet shows `[NOT FOUND YET]` (no text)', model.rows[2]?.found === false && model.rows[2].lines === null
    && LOG_TEXT.notFound === '[NOT FOUND YET]');
  check('…and the next key under them (`NEXT KEY: RING 2 · 45 LY`)', model.nextKey === LOG_UI_TEXT.nextKey('RING 2 · 45 LY'), model.nextKey);
  check('the chip glows while 01 and 02 are unread (`046.log · 2/12`)', logChip(state()).glow && logChip(state()).unread === 2
    && logChip(state()).label === '046.log · 2/12', logChip(state()).label);
  markLogEntryRead(store, 1);
  check('reading 01 leaves 02 to open next', logEntryToOpen(state()) === 2 && logChip(state()).unread === 1);
  check('↓ from 01 is 02, ↑ from 01 is nothing', adjacentFoundEntry(state(), 1, 1) === 2 && adjacentFoundEntry(state(), 1, -1) === null);
  openLogReader(store, 2);
  markLogEntryRead(store, 2);
  model = logReaderModel(state());
  check('…open on 02, both read: no glow, the chip click opens the last found', model.open === 2 && model.rows[1]?.read === true
    && !logChip(state()).glow && logEntryToOpen(state()) === 2);
  let threw = false;
  try { openLogReader(store, 5); } catch { threw = true; }
  check('the reader never opens on an entry not found (it fails loudly)', threw);
  closeLogReader(store);
  check('closed: ui.logReader is null, the model has nothing open', state().ui.logReader === null && logReaderModel(state()).open === null);
  store.update((draft) => { draft.run.log.found = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; });
  // Entries 05–09 are not written in slice 2 (risk 8): a found entry with no text is a data bug, and the model says so.
  let unwritten = false;
  try { logReaderModel(state()); } catch { unwritten = true; }
  check('a found entry with no text fails loudly (slice 2 never finds 05–09)', unwritten);
}

finish();
