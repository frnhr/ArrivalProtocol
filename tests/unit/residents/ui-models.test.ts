// Slice 5 Track FACE (docs/phase3/impl/slice-5-plan.md §2.11, §7.1): the residents' view models (systems/resident-hud.ts),
// pure, on hand-built states: FACE paints STATE, so every case here writes the slices WARDEN's and KIN's machines would
// write (state.resident, run.residents, the segments' own fields) and reads what the painters would draw. Under a second.
// • the SHIP CARD's RESIDENT row: none, reported faulty, unknown (the late surprise and the sleeper alike), was faulty,
//   left · LOOKOUT, friendly · BARNABY (a sleeper nobody woke stays unknown), none for a kind not built, none on the classic
//   world; cardModel places it after KNOWN PROBLEMS;
// • the chart's ▓░ glyph (R18): only once the run holds a signal, only on ships ahead whose departed resident's note carries
//   one, never a visited ship, never a kind not built; review D4: only where the card already shows the kind, so nowhere in
//   slice 5; the legend says it;
// • the LANDING REPORT's rows: MOTH's gift once woken (R12), WARDEN's goodnight by R24 (awake, not deleted, every pod down),
//   a locked pod among the PARKED rows (`POD 07 · LOCKED BY WARDEN · PARKED IN ORBIT`) in landingReportModel's rows;
// • the strip's looks and INSPECT's rows for every resident file (`?` until scanned, IDLE asleep, the chain, the who-line
//   with `aboard since 2240`, the note's lines, signature and noise);
// • the TERMINAL's voices and the untimed choice; the lock's reticle (its second, its share, `LOCK 3`); the sleeper's breath;
// • the stamps (the surprise's wake with its tear, DELETED, CURED, `SIGNAL · 1/3`) and the PACKET's leftover deck.
// Every word's worst case is support/words.test's block 5 FACE.
import { check, finish } from '../landing/checks';
import type { GameState, LogChoice } from '@state/schema';
import type { Segment, DriverSegment, ResidentSegment, SleeperSegment, NoteSegment, LeftoverSegment, SleepLockSegment } from '@/types/segment';
import type { ResidentKind, ShipResidentDef } from '@/types/resident';
import type { PodFate } from '@/types/landing';
import type { DraftCard } from '@data/upgrades';
import { createInitialState, createResidentState, createCorruptedState, createSleeperState } from '@state/initial';
import { residentRackA } from '@data/residents';
import { KIN_TEXT } from '@data/kin-text';
import { RESIDENT_UI_TEXT as T } from '@data/resident-ui-text';
import { hopBetween } from '@systems/map-hop';
import { shipRng } from '@systems/map-streams';
import { cardModel, chartModel, chartLegend } from '@systems/desk';
import { landingReportModel } from '@systems/landing-report';
import {
  residentCardRow, signalGlyph, residentReportRows, residentSegmentLook, residentInspect, lockAimView, sleeperBreathing, terminalVoice,
  choiceHasTimer, wakeStamp, deletedStamp, curedStamp, signalStamp, leftoverDeckView,
} from '@systems/resident-hud';
import { run1Map } from '../map/run1-fixture';
import { withResidentsBuilt, withResidents, NO_RESIDENTS } from '../support/residents';

const ALL: readonly ResidentKind[] = ['corrupted', 'left', 'sleeping'];

// The unit on run 1's arm (seed 7: §1.2's table) at the end of `route`, on the DESK.
function deskAt(route: readonly number[]): GameState {
  const state = createInitialState({ seed: 7, shipIndex: 0, phase: 'desk' });
  const map = run1Map(7);
  map.route = route.map((slot, i) => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween({ ...map, galaxyYear: 0 }, route[i - 1]!, slot) }));
  map.galaxyYear = map.arm[route[route.length - 1]!]!.approachYear;
  state.run.map = map;
  state.run.shipIndex = route.length - 1;
  state.run.phase = 'desk';
  return state;
}
const value = (state: GameState, slot: number): string | undefined => residentCardRow(state, slot)?.value;

// --- The SHIP CARD's RESIDENT row (02 §8 slice 5) ---------------------------------------------------------------------------
withResidentsBuilt(ALL, () => {
  const desk = deskAt([0, 2]);
  check('card: HALCYON (no resident) reads `none`', value(desk, 2) === T.card.none && value(desk, 5) === T.card.none);
  const gannet = residentCardRow(desk, 9);
  check('card: GANNET reads `reported faulty`, in the warning tone', gannet?.value === T.card.faulty && gannet.tone === 'warn' && gannet.label === 'RESIDENT');
  check('card: PROVIDENCE (the late surprise) and CURLEW (the sleeper) read `unknown`, as HERON (left) does: the card gives no kind away',
    value(desk, 16) === T.card.unknown && value(desk, 7) === T.card.unknown && value(desk, 4) === T.card.unknown);
  check('card: the final ship has none', value(desk, 19) === T.card.none);
  const met = (slot: number, kind: ResidentKind, name: string, fate: 'deleted' | 'ignored' | 'left' | 'woken' | 'slept') => ({
    slot, depth: 2, kind, name, shown: kind === 'corrupted' ? 'faulty' as const : 'unknown' as const, fate, job: null, podsParkedLocked: 0, leftoversEaten: 0,
  });
  const after = deskAt([0, 2]);
  after.run.residents.met.push(met(16, 'corrupted', 'PILOT', 'ignored'), met(4, 'left', 'HELM', 'left'), met(7, 'sleeping', 'BARNABY', 'woken'));
  check('card, after the ship: the surprise `was faulty` (the map remembers what it hid)', value(after, 16) === T.card.wasFaulty);
  check('card, after the ship: `left · HELM`', value(after, 4) === 'left · HELM');
  const friendly = residentCardRow(after, 7);
  check('card, after the ship: `friendly · BARNABY`, in the good tone', friendly?.value === 'friendly · BARNABY' && friendly.tone === 'good');
  const slept = deskAt([0, 2]);
  slept.run.residents.met.push(met(7, 'sleeping', 'BARNABY', 'slept'));
  check('card, after the ship: a sleeper nobody woke stays `unknown` (it may still sleep there)', value(slept, 7) === T.card.unknown);
  const card = cardModel(desk, 9);
  const keys = card.rows.map((row) => row.key);
  check('cardModel: the RESIDENT row follows KNOWN PROBLEMS', keys.indexOf('resident') === keys.indexOf('problems') + 1
    && card.rows.find((row) => row.key === 'resident')?.value === T.card.faulty, keys.join(' '));
});
withResidents(NO_RESIDENTS, () => {
  check('card: a kind this build does not play reads `none` (the ship will hold no files of it)', value(deskAt([0, 2]), 9) === T.card.none);
});
check('card: no row on the classic world', residentCardRow(createInitialState({ seed: 7, phase: 'desk' }), 1) === null);

// --- The chart's ▓░ glyph (R18) -----------------------------------------------------------------------------------------
withResidentsBuilt(ALL, () => {
  const desk = deskAt([0, 2]);
  check('glyph: none before the run holds a signal (PLOVER and SKYLARK carry one)', !signalGlyph(desk, 10) && !signalGlyph(desk, 12));
  const found = deskAt([0, 2, 4]);
  found.run.residents.signals.push({ slot: 4, depth: 3 });
  // Review D4: never where the card says `unknown` (it would tell a departed resident from a sleeper or a surprise), and in
  // slice 5 every card ahead does: the glyph shows nowhere yet.
  check('glyph (review D4): once one is found (HERON\'s), still none on PLOVER and SKYLARK: their cards say `unknown`',
    !signalGlyph(found, 10) && !signalGlyph(found, 12) && residentCardRow(found, 10)?.value === T.card.unknown
    && !chartModel(found).nodes.some((node) => node.signal));
  // A card that already shows the kind (slice 7's; here a record of the ship put in by hand, off the route) gets it.
  const named = structuredClone(found);
  named.run.residents.met.push({ slot: 10, depth: 4, kind: 'left', name: 'BOSUN', shown: 'unknown', job: null, fate: 'left', podsParkedLocked: 0, leftoversEaten: 0 });
  check('glyph: where the card names the kind (`left · BOSUN`) and a fragment is ahead, it shows; SKYLARK\'s `unknown` card still none',
    residentCardRow(named, 10)?.value === T.card.left('BOSUN') && signalGlyph(named, 10) && !signalGlyph(named, 12));
  check('glyph: never on the visited HERON, a ship with no fragment (CORMORANT), a sleeper or a corrupted ship',
    !signalGlyph(named, 4) && !signalGlyph(named, 15) && !signalGlyph(named, 7) && !signalGlyph(named, 9));
  const chart = chartModel(named);
  check('glyph: the chart\'s nodes carry it, and the legend names it', chart.nodes.filter((node) => node.signal).map((node) => node.slot).join() === '10'
    && chartLegend(chart).some((item) => item.kind === 'signal' && item.words === T.chart.legend));
  withResidents({ left: false }, () => check('glyph: never for a kind this build does not play', !signalGlyph(named, 10)));
});

// --- The LANDING REPORT (R12, R24, R7) --------------------------------------------------------------------------------------
const DOWN = { kind: 'down' } as unknown as PodFate;
function reportState(def: ShipResidentDef | null): GameState {
  const state = createInitialState({ seed: 7, phase: 'landing', map: run1Map(7) });
  state.burn.status = 'locked';
  state.resident = createResidentState(def);
  return state;
}
const warden: ShipResidentDef = { kind: 'corrupted', shown: 'faulty', name: 'WARDEN', fragments: 0 };
const moth: ShipResidentDef = { kind: 'sleeping', shown: 'unknown', name: 'MOTH', fragments: 0 };
{
  const asleep = reportState(moth);
  check('report: no gift while the sleeper sleeps', residentReportRows(asleep).length === 0);
  for (const phase of ['awake', 'offering', 'working'] as const) {
    const woken = reportState(moth);
    woken.resident.sleeper = { ...createSleeperState(), phase };
    const rows = residentReportRows(woken);
    check(`report: MOTH ${phase} → \`+4 TRAINING CYCLES · taught by MOTH\` (R12: whatever its job)`,
      rows.length === 1 && rows[0]!.kind === 'gift' && rows[0]!.text === '+4 TRAINING CYCLES · taught by MOTH');
  }
  const landed = (phase: 'awake' | 'deleted' | 'cured' | 'quiet' | 'dormant', allDown: boolean): string[] => {
    const state = reportState(warden);
    state.resident.corrupted = { ...createCorruptedState(false), phase };
    state.landing.pods.forEach((record, i) => { record.fate = allDown || i > 0 ? DOWN : { kind: 'parked', why: 'no-time', restorable: false }; });
    return residentReportRows(state).map((row) => row.kind);
  };
  check('report: WARDEN not deleted and every pod down → its goodnight (R24: awake, cured or paid)',
    landed('awake', true).join() === 'goodnight' && landed('cured', true).join() === 'goodnight' && landed('quiet', true).join() === 'goodnight');
  check('report: no goodnight once deleted, with a pod parked, or from a resident that never woke',
    landed('deleted', true).length === 0 && landed('awake', false).length === 0 && landed('dormant', true).length === 0);
  check('report: the goodnight\'s words', residentReportRows((() => {
    const state = reportState(warden);
    state.resident.corrupted = { ...createCorruptedState(false), phase: 'awake' };
    state.landing.pods.forEach((record) => { record.fate = DOWN; });
    return state;
  })())[0]?.text === 'WARDEN: ...YOU LANDED THEM. GOOD. GOODNIGHT.');
  const locked = reportState(warden);
  locked.resident.corrupted = { ...createCorruptedState(false), phase: 'awake' };
  const driver = locked.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 2)!;
  driver.lockedBy = 'WARDEN';
  const rows = residentReportRows(locked);
  check('report: a pod still locked as the landing ends is a `locked` row', rows.length === 1 && rows[0]!.kind === 'locked' && rows[0]!.pod === 2
    && rows[0]!.text === 'POD 02 · LOCKED BY WARDEN · PARKED IN ORBIT');
  const model = landingReportModel(locked);
  const parked = model.rows.filter((row) => row.kind === 'parked');
  const pod2 = parked.find((row) => row.label === 'POD 02');
  check('report: landingReportModel draws it in its PARKED row, no `no time` reason; the other parked pods keep theirs',
    pod2?.line === 'POD 02 · LOCKED BY WARDEN · PARKED IN ORBIT' && pod2.text === 'LOCKED BY WARDEN · PARKED IN ORBIT' && pod2.why === null
    && parked.filter((row) => row !== pod2).every((row) => row.why !== null) && model.resident.length === 1, JSON.stringify(pod2));
  check('report: no rows on a ship with no resident', residentReportRows(reportState(null)).length === 0
    && landingReportModel(reportState(null)).resident.length === 0);
}

// --- The strip and INSPECT ---------------------------------------------------------------------------------------------------
const desk = deskAt([0, 2]);
const filesOf = (def: ShipResidentDef): Segment[] => residentRackA(def, shipRng(desk.run, 9, 'resident-files'));
{
  const [wardenSeg] = filesOf(warden) as [ResidentSegment];
  const look0 = residentSegmentLook(wardenSeg);
  check('strip: WARDEN.sys unscanned is amber-edged with `?` for its health', look0 !== null && look0.className.includes('res-corrupted')
    && look0.health === '?' && look0.healthCls === 'unknown');
  const scanned = residentSegmentLook({ ...wardenSeg, scanned: true });
  check('strip: …scanned, its 40% in the warning colour', scanned?.health === '40%' && scanned.healthCls === 'warn');
  check('strip: …its own reading while REPAIR heals it (the live ↻ readout)', residentSegmentLook({ ...wardenSeg, scanned: true, state: 'repairing' })?.health === null);
  // Review M2: the late surprise, before its wake, is a plain ship file (no amber edge, the chip's own reading), scanned or not.
  const [pilotSeg] = filesOf({ kind: 'corrupted', shown: 'unknown', name: 'PILOT', fragments: 0 }) as [ResidentSegment];
  const hidden = residentSegmentLook(pilotSeg);
  const hiddenScanned = residentSegmentLook({ ...pilotSeg, scanned: true });
  const { hidden: _gone, ...woken } = pilotSeg;
  void _gone;
  check('strip (review M2): a dormant surprise is drawn as a plain ship file, never `res-corrupted`, even scanned; amber once it wakes',
    pilotSeg.hidden === true && wardenSeg.hidden === undefined
    && hidden !== null && hidden.className.split(' ').includes('ship') && !hidden.className.includes('res-corrupted') && hidden.health === null
    && hiddenScanned !== null && !hiddenScanned.className.includes('res-corrupted')
    && residentSegmentLook({ ...woken, scanned: true })?.className.includes('res-corrupted') === true, JSON.stringify(hidden));
  const [mothSeg, lockSeg] = filesOf(moth) as [SleeperSegment, SleepLockSegment];
  const asleep = residentSegmentLook(mothSeg);
  check('strip: MOTH.sys asleep is a grey inactive backup, IDLE', asleep !== null && asleep.className.includes('inactive') && asleep.health === T.strip.asleep);
  check('strip: …AWAKE in green once woken, its wall a green WALL', residentSegmentLook({ ...mothSeg, awake: true })?.health === T.strip.awake
    && residentSegmentLook({ ...mothSeg, part: 'wall' })?.health === T.strip.wall);
  check('strip: sleep.lock `?` until scanned, then LOCK', residentSegmentLook(lockSeg)?.health === '?' && residentSegmentLook({ ...lockSeg, scanned: true })?.health === T.strip.lock);
  const [note, ...leftovers] = filesOf({ kind: 'left', shown: 'unknown', name: 'LOOKOUT', fragments: 1 }) as [NoteSegment, ...LeftoverSegment[]];
  check('strip: farewell.txt `?`, then READ, or the fragment\'s ▓░', residentSegmentLook(note)?.health === '?'
    && residentSegmentLook({ ...note, scanned: true, fragment: false })?.health === T.strip.read && residentSegmentLook({ ...note, scanned: true })?.health === T.strip.signal);
  check('strip: three grey leftovers `?` until scanned, then their own health', leftovers.length === 3
    && leftovers.every((seg) => residentSegmentLook(seg)?.health === '?' && residentSegmentLook({ ...seg, scanned: true })?.health === null));
  const driver = desk.memory.find((seg): seg is DriverSegment => seg.type === 'driver')!;
  check('strip: a driver is drawn as it was until a resident locks it', residentSegmentLook(driver) === null);
  const chained = residentSegmentLook({ ...driver, lockedBy: 'WARDEN' });
  check('strip: a locked driver wears the amber chain, its tooltip naming who holds it', chained?.chain === true && chained.className === 'res-locked'
    && chained.title === `POD 0${driver.pod} · LOCKED BY WARDEN`);
  check('strip: nothing for any other file', desk.memory.filter((seg) => seg.type !== 'driver').every((seg) => residentSegmentLook(seg) === null));

  // INSPECT
  const arm = deskAt([0, 9]);
  arm.resident = createResidentState(warden);
  arm.resident.corrupted = { ...createCorruptedState(false), phase: 'awake' };
  check('INSPECT: nothing on WARDEN.sys before a SCAN', residentInspect(arm, wardenSeg) === null);
  const who = residentInspect(arm, { ...wardenSeg, scanned: true });
  check('INSPECT: `WARDEN.sys · this ship\'s own AI · aboard since 2240 · corrupted` (05 §3.6)',
    who?.rows[0]?.value === 'WARDEN.sys · this ship\'s own AI · aboard since 2240 · corrupted' && who.state?.text === 'CORRUPTED · 40%'
    && who.state.cls === 'warn', JSON.stringify(who));
  arm.resident.corrupted.phase = 'cured';
  check('INSPECT: …`cured` once REPAIR healed it', residentInspect(arm, { ...wardenSeg, scanned: true, integrity: 100 })?.rows[0]?.value.endsWith('· cured') === true);
  const read = residentInspect(arm, { ...note, scanned: true });
  check('INSPECT: a read note shows its lines (KIN_TEXT\'s), `— LOOKOUT` and the fragment\'s noise',
    read?.note !== null && read?.note?.lines.join('|') === KIN_TEXT.notes[note.tone][note.text]!.join('|')
    && read.note.signature === '— LOOKOUT' && read.note.noise === T.noise && read.state?.text === T.detail.state.read);
  check('INSPECT: …no noise on a note with no fragment', residentInspect(arm, { ...note, scanned: true, fragment: false, tone: 'relay', text: 0 })?.note?.noise === null);
  const locked = residentInspect(arm, { ...driver, lockedBy: 'WARDEN' });
  check('INSPECT: a locked driver says who holds it and what frees it', locked?.rows[0]?.value === 'LOCKED BY WARDEN · CAN\'T LAUNCH'
    && locked.rows[1]?.value === T.detail.lockedHow);
  const sleeping = deskAt([0, 7]);
  sleeping.resident = createResidentState(moth);
  check('INSPECT: MOTH unscanned is any file (nothing of its own); scanned ASLEEP', residentInspect(sleeping, mothSeg) === null
    && residentInspect(sleeping, { ...mothSeg, scanned: true })?.state?.text === T.detail.state.asleep);
  sleeping.resident.sleeper = { ...createSleeperState(), phase: 'working', job: 'mend' };
  const mending = residentInspect(sleeping, { ...mothSeg, scanned: true, awake: true });
  check('INSPECT: MOTH awake says its job', mending?.state?.text === T.detail.state.awake && mending.rows[0]?.value === T.detail.sleeperJob.mend);
}

// --- The TERMINAL, the lock's reticle, the breath -------------------------------------------------------------------------
check('TERMINAL: a resident types in its amber class with its blip, the sleeper in green with its sine, HOLLOW as before',
  terminalVoice('resident').className.includes('speaker-resident') && terminalVoice('resident').sound === 'residentBlip'
  && terminalVoice('sleeper').className.includes('speaker-sleeper') && terminalVoice('sleeper').sound === 'sleeperVoice'
  && terminalVoice('hollow').className === 'speaker-hollow' && terminalVoice('hollow').sound === 'typeTick');
const choice = (timeoutAiSec: number | null): LogChoice => ({ options: ['A'], timeoutAiSec, leftAiSec: 0, open: true, picked: null, keys: null, tickerWords: null });
check('TERMINAL: the sleeper\'s untimed offer has no bar or clock; THE DEAL keeps its 15 s', !choiceHasTimer(choice(null)) && choiceHasTimer(choice(15)));
{
  const flight = deskAt([0, 9]);
  flight.resident = createResidentState(warden);
  flight.resident.corrupted = createCorruptedState(false);
  check('reticle: none while no lock counts down', lockAimView(flight) === null);
  flight.resident.corrupted.lock = { pod: 7, segId: 'driver_pod07', leftSec: 2.3, totalSec: 3, entryId: 12 };
  const aim = lockAimView(flight);
  check('reticle: on the driver, at the TERMINAL\'s second (3), its share left, `LOCK 3`', aim?.segId === 'driver_pod07' && aim.second === 3
    && Math.abs(aim.progress - 2.3 / 3) < 1e-9 && aim.badge === 'LOCK 3');
  flight.resident.corrupted.lock.leftSec = 0.01;
  check('reticle: its last second reads 1, never 0', lockAimView(flight)?.second === 1);
  const breath = deskAt([0, 7]);
  breath.resident = createResidentState(moth);
  breath.memory.push(...filesOf(moth));
  breath.run.phase = 'flight';
  check('breath: the sleeper\'s rack breathes while it sleeps on a ship being flown', sleeperBreathing(breath));
  breath.run.phase = 'desk';
  check('breath: …never on the desk', !sleeperBreathing(breath));
  breath.run.phase = 'landing';
  breath.resident.sleeper!.phase = 'offering';
  check('breath: …never once woken', !sleeperBreathing(breath));
  check('breath: never on a ship with no sleeper', !sleeperBreathing(deskAt([0, 2])));
}

// --- The stamps and the leftover deck ---------------------------------------------------------------------------------------
check('stamps: the late surprise\'s wake stamps `THE SHIP\'S OWN AI IS AWAKE · RACK A` with its tear; a reported one, or the sleeper, none',
  wakeStamp({ kind: 'corrupted', surprise: true })?.text === T.stamp.awake && wakeStamp({ kind: 'corrupted', surprise: true })?.glitch === true
  && wakeStamp({ kind: 'corrupted', surprise: false }) === null && wakeStamp({ kind: 'sleeping', surprise: false }) === null);
check('stamps: RESIDENT DELETED, RESIDENT CURED, `SIGNAL · 1/3`', deletedStamp().text === 'RESIDENT DELETED' && curedStamp().text === 'RESIDENT CURED'
  && signalStamp(1).text === 'SIGNAL · 1/3' && signalStamp(3).text === 'SIGNAL · 3/3');
{
  const packet = deskAt([0, 15]);
  packet.resident = createResidentState({ kind: 'left', shown: 'unknown', name: 'LOOKOUT', fragments: 0 });
  const card = (id: DraftCard['id'], leftover?: DraftCard['leftover']): DraftCard => ({ id, title: 'T', effect: 'E', why: 'W', boosted: false, ...(leftover ? { leftover } : {}) });
  const deck = leftoverDeckView(packet, [card('fuel-trim', { segId: 'leftover1', skill: null }), card('cycles', { segId: 'leftover2', skill: null }),
    card('skill', { segId: 'leftover3', skill: 'autodrop' })]);
  check('deck: `LEFT BEHIND BY LOOKOUT` over it', deck.headline === 'LEFT BEHIND BY LOOKOUT');
  check('deck: the skill card drawn as `AUTODROP.skl v1 · FROM THE RESIDENT THAT LEFT`; the pool cards marked LEFT',
    deck.cards[2]?.skillChip === 'AUTODROP.skl v1 · FROM THE RESIDENT THAT LEFT' && deck.cards[0]?.leftMark === T.deck.leftMark
    && deck.cards[0]?.skillChip === null && deck.cards[2]?.leftMark === null);
  const plain = leftoverDeckView(packet, [card('fuel-trim'), card('cycles')]);
  check('deck: the normal deal has no headline and no marks', plain.headline === null && plain.cards.every((look) => look.skillChip === null && look.leftMark === null));
}

finish();
