// WP8 part 2, headless: the models behind this pass's screens (the DOM itself is checked in the browser,
// tests/unit/wp8/p2/two-runs.mjs and archive-banners.mjs).
// • TRANSMIT's cards (systems/transmit.ts): three cards with their form tag ([FILE · 2 BLOCKS] …), key 1–3,
//   effect and `because …`, boosted when they answer how the kid played; nothing picked at first; a file card
//   picked adds its new file as a chip (and its blocks to the packet line), a non-file card adds none; the
//   pick can change; the send stays refused without one.
// • The Skills window (systems/skills.ts): empty on a fresh unit; FIREWALL.sys IDLE in rack F, HOLDING once
//   MOVEd against the root, a GONE pip once deleted; FUEL TRIM `THIS SHIP: +15% FUEL` after it widened the
//   arrival, `FROM THE NEXT SHIP` for one that did not (yet), NO EFFECT below 50; REPAIR v2 per Repair copy;
//   THREAD+ 3 THREADS, one below 50; +12 CHARGE what arrived. Every status and pip line ≤ 70 characters.
// • A FIREWALL holding a bite fizzles like a WALL ('hollow-firewall'), and never counts as a structural change.
// • The title's RECEIVE TRANSMISSION plays through a CORRUPT archive without it (WP8 fix round 1, the lead's
//   note: the game continues without saving; the bad record is left as it was).
// • The header crumb carries the wave (UNIT-047 · WAVE 1; WAVE 2 on the next run).
import { check, finish } from '../../wp1/harness';
import { createHarness7 } from '../../wp7/harness7';
import { transmitModel } from '@systems/transmit';
import { pickCard } from '@systems/draft';
import { transmitNext } from '@systems/run';
import { continueAfterLoss } from '../../support/desk';
import { installTool } from '@systems/licences';
import { skillsModel, arrivalFuelTrimPct, type SkillRow } from '@systems/skills';
import { receiveTransmission } from '@systems/boot';
import { openRunArchive, closeArchive, playWithoutArchive, type MetaStorage } from '@systems/meta';
import { headerCrumbs } from '@systems/flight-hud';
import { getPrediction } from '@systems/predict';
import { actionMove, setIntegrity } from '@state/actions';
import type { HealthSegment } from '@state/selectors';
import { isFirewall, upgradeFiles, getAiCore } from '@state/selectors';
import { newSegId } from '@systems/memory-ops';
import { BASE_WHY, type UpgradeId } from '@data/upgrades';
import { DRAFT_TEXT, SKILLS_TEXT, ARCHIVE_TEXT } from '@data/script';
import { FIREWALL_BLOCKS, MAX_LINE_CHARS, FUEL_TRIM_BLOCKS, INTEGRITY_MAX, META_STORAGE_KEY } from '@data/tuning';
import type { FreeSegment, UpgradeSegment } from '@/types/segment';
import { plantHalcyonRoot } from '../../support/hollow-world';

const h = createHarness7(31, { soulsFound: true });
const state = () => h.store.getState();
const rowOf = (id: UpgradeId): SkillRow | undefined => skillsModel(state()).find((row) => row.id === id);
const lineOk = (line: string): boolean => line.length <= MAX_LINE_CHARS;
// A file's integrity set in the store (a bite or a transit hit would do the same), with the strip rebuilt.
const setHealth = (segId: string, integrity: number): void => {
  h.store.update((d) => {
    const seg = d.memory.find((candidate) => candidate.id === segId);
    if (!seg) throw new Error(`setHealth: ${segId} is not in memory`);
    setIntegrity(seg as HealthSegment, integrity);
    d.ui.memoryRev++;
  });
};

// Ship 1, run 1, the simulation already used: a crash goes to EMERGENCY TRANSMIT (TRANSMIT in a few ticks).
function toTransmit(seed: number, prepare: () => void = () => {}): void {
  h.newRun(seed);
  h.store.update((d) => { d.run.phase = 'flight'; d.run.simulationRetryUsed = true; d.ui.mode = 'tools'; });
  prepare();
  const radius = state().level.planet.R + 20;
  h.store.mutate((d) => { d.orbit.x = radius; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
  h.stepUntil(() => h.status() !== 'approaching', 10);
  continueAfterLoss(h.store);
  if (state().run.phase !== 'transmit') throw new Error(`toTransmit: phase ${state().run.phase}`);
}

// Deals exactly `ids` on this TRANSMIT (the offer is data) and picks `pick` when given.
function deal(ids: UpgradeId[], pick?: UpgradeId): void {
  h.store.update((d) => { d.run.transit!.offer = ids.map((id) => ({ id, title: id, effect: '', why: BASE_WHY, boosted: false })); });
  if (pick !== undefined) {
    const refusal = pickCard(h.store, pick);
    if (refusal !== null) throw new Error(`pick ${pick}: ${refusal}`);
  }
}

// --- TRANSMIT's cards ------------------------------------------------------------------------------------
{
  toTransmit(5, () => { h.store.update((d) => { d.run.stats.driversLost = 1; }); });
  const model = transmitModel(state());
  check('TRANSMIT shows the 3 cards dealt, keyed 1, 2, 3, none picked yet', model.cards.length === 3
    && model.cards.map((card) => card.key).join() === '1,2,3' && model.pick === null && model.cards.every((card) => !card.picked));
  const tags: Record<UpgradeId, string> = {
    firewall: `FILE · ${FIREWALL_BLOCKS} BLOCKS`, 'fuel-trim': `FILE · ${FUEL_TRIM_BLOCKS} BLOCKS`, 'repair-v2': 'UPGRADE', 'thread-plus': 'AI CORE', charge: 'ON ARRIVAL', cycles: 'TRAINING',
  };
  check('each card says what kind of thing it is (FILE · 2 BLOCKS, UPGRADE, AI CORE, ON ARRIVAL)', model.cards.every((card) => card.id !== 'skill' && card.tag === tags[card.id]),
    model.cards.map((card) => `${card.id}=${card.tag}`).join(' '));
  const firewall = model.cards.find((card) => card.id === 'firewall');
  check('after a driver lost to HOLLOW, FIREWALL.sys is boosted and says why, naming it as the strip does (`because you lost a driver to ???`)',
    firewall !== undefined && firewall.boosted && DRAFT_TEXT.why(firewall.why) === 'because you lost a driver to ???',
    model.cards.map((card) => `${card.id}: ${card.why}`).join(' | '));
  check('every card line on the screen is ≤ 70 characters', model.cards.every((card) => [card.title, card.effect, DRAFT_TEXT.why(card.why), card.tag].every(lineOk)));
  check('…and no file card is shown in the packet before a pick', model.cardFile === null);

  deal(['firewall', 'repair-v2', 'charge'], 'firewall');
  const picked = transmitModel(state());
  check('picking FIREWALL.sys: it is the picked card, and its new file joins the packet as a chip (Firewall.sys, 2 blocks)',
    picked.pick === 'firewall' && picked.cards.find((card) => card.picked)?.id === 'firewall' && picked.cardFile?.name === 'Firewall.sys'
      && picked.cardFile.blocks === FIREWALL_BLOCKS, JSON.stringify(picked.cardFile));
  check('…the packet line counts it (FILES +2)', picked.files === model.files + FIREWALL_BLOCKS, `${model.files} → ${picked.files}`);
  const switched = pickCard(h.store, 'charge');
  const charge = transmitModel(state());
  check('the pick can change before the send: +12 REPAIR CHARGE now, no file chip, the arrival line counts the card',
    switched === null && charge.pick === 'charge' && charge.cardFile === null && charge.files === model.files && /\+ 12 \(CARD\)/.test(charge.arrivalLine), charge.arrivalLine);
  h.store.update((d) => { d.run.transit!.pick = null; });
  let threw = '';
  try { transmitNext(h.store); } catch (error) { threw = (error as Error).message; }
  check('without a pick the send is still refused (the screen says PICK A CARD FIRST)', /no card picked/.test(threw) && state().run.phase === 'transmit');
}

// --- The Skills window -----------------------------------------------------------------------------------------
{
  h.newRun(7);
  check('a fresh unit carries no cards: the Skills window is empty', skillsModel(state()).length === 0);
}
// FIREWALL.sys: IDLE in rack F, HOLDING against the root, GONE once deleted.
{
  toTransmit(5);
  deal(['firewall'], 'firewall');
  h.transmit();
  h.stepUntil(() => state().run.phase === 'flight', 15);
  let row = rowOf('firewall');
  check('FIREWALL.sys arrives IDLE: one ■ pip, `MOVE IT INTO A GAP NEXT TO ???`', row !== undefined && row.pips.length === 1
    && row.pips[0]!.look === 'idle' && row.status === SKILLS_TEXT.status.idle('???') && row.tone === 'hint' && row.title === 'FIREWALL.sys', JSON.stringify(row));
  // Slice 2: HALCYON is calm; phase 2's root geometry is planted for the FIREWALL to hold against.
  h.store.update(plantHalcyonRoot);
  installTool(h.store, 'move');
  const memory = state().memory;
  const rootIndex = memory.findIndex((seg) => seg.type === 'hollow' && seg.root);
  const gap = memory[rootIndex - 1] as FreeSegment;
  const firewall = memory.find(isFirewall)!;
  actionMove(h.store, firewall, { regionSegIds: [gap.id], col: 0 });
  h.stepUntil(() => !state().memory.some((seg) => seg.operating), 10);
  row = rowOf('firewall');
  check('MOVEd against the root: HOLDING, `HOLDING ??? BACK` in the good tone', row?.pips[0]?.look === 'holding'
    && row.status === SKILLS_TEXT.status.holding(1, '???') && row.tone === 'good', JSON.stringify(row));
  // HOLLOW wakes now and bites: the FIREWALL side fizzles (a 'hollow-firewall' event, no structural change).
  const eventsBefore = h.events.length;
  h.store.update((d) => { d.hollow.cfg.wake = { afterAiSec: d.clock.aiSec + 1, coastLeadSec: null }; });
  h.stepUntil(() => state().hollow.phase === 'awake', 5);
  h.stepFor(1);
  const held = h.events.slice(eventsBefore).filter((event) => event.name === 'hollow-firewall');
  const holder = state().memory.find(isFirewall)!;
  check('HOLLOW\'s bite fizzles on the FIREWALL: a hollow-firewall event naming it, on the side it holds',
    held.length >= 1 && (held[0]!.payload as { firewallId: string; side: string }).firewallId === holder.id
      && (held[0]!.payload as { side: string }).side === 'left', JSON.stringify(held.map((event) => event.payload)));
  // The kid DELETEs it (as the DELETE op ends: the file's blocks become free space; here between the
  // root and POD 04, so no free neighbour to merge with).
  const index = state().memory.findIndex(isFirewall);
  h.store.update((d) => {
    const free: FreeSegment = { id: newSegId('free'), name: 'free', type: 'free', size: FIREWALL_BLOCKS };
    d.memory.splice(index, 1, free);
    d.ui.memoryRev++;
  });
  h.checkMemory();
  row = rowOf('firewall');
  check('deleted: the card stays listed with a ✕ GONE pip and `ITS FILE IS GONE`', row !== undefined && row.pips.length === 1
    && row.pips[0]!.look === 'missing' && row.pips[0]!.segId === null && row.status === SKILLS_TEXT.status.gone && row.tone === 'warn', JSON.stringify(row));
}
// FUEL TRIM: this ship's +15%, then a file that did not widen this arrival (yet), then below 50.
{
  toTransmit(5);
  deal(['fuel-trim'], 'fuel-trim');
  h.transmit();
  const trim = upgradeFiles(state().memory, 'fuel-trim')[0];
  const widened = arrivalFuelTrimPct(state());
  let row = rowOf('fuel-trim');
  // A transit hit can leave a fresh FUEL TRIM below 50 (PROGRESS question 4): this seed's must arrive working.
  check('FUEL TRIM arrives and widens HALCYON\'s tank: `THIS SHIP: +15% FUEL`, its health pip', trim !== undefined && widened === 15
    && row?.status === SKILLS_TEXT.status.trimThisShip(15) && row.tone === 'good' && row.pips.length === 1 && row.pips[0]!.segId === trim.id,
    `${widened} ${JSON.stringify(row)}`);
  setHealth(trim!.id, 30);
  row = rowOf('fuel-trim');
  check('…eaten below 50 mid-ship it keeps this ship\'s bonus (still THIS SHIP), its pip turns failing', row?.status === SKILLS_TEXT.status.trimThisShip(15)
    && row.pips[0]!.look === 'failing', JSON.stringify(row));
}
{
  // A FUEL TRIM that arrives on a ship whose tank it did not widen (here: put in rack F on ship 1).
  h.newRun(9);
  h.store.update((d) => { d.run.phase = 'flight'; });
  const trim: UpgradeSegment = {
    id: newSegId('trim'), name: 'Fuel Trim', type: 'upgrade', upgrade: 'fuel-trim', size: FUEL_TRIM_BLOCKS,
    integrity: INTEGRITY_MAX, state: 'intact', scanned: true, desc: '',
  };
  // Into the front of the biggest free space (the free rest keeps the strip whole).
  h.store.update((d) => {
    const free = d.memory.filter((seg): seg is FreeSegment => seg.type === 'free').sort((a, b) => b.size - a.size)[0]!;
    d.memory.splice(d.memory.indexOf(free), 1, trim, { ...free, size: free.size - FUEL_TRIM_BLOCKS });
    d.ui.memoryRev++;
  });
  h.checkMemory();
  let row = rowOf('fuel-trim');
  check('a working FUEL TRIM that did not widen this ship: `+15% FUEL FROM THE NEXT SHIP`', arrivalFuelTrimPct(state()) === 0
    && row?.status === SKILLS_TEXT.status.trimNextShip(15) && row.tone === 'hint', JSON.stringify(row));
  setHealth(trim.id, 40);
  row = rowOf('fuel-trim');
  check('…below 50: `NO EFFECT — REPAIR IT TO 50% OR MORE`', row?.status === SKILLS_TEXT.status.trimNoEffect && row.tone === 'warn', JSON.stringify(row));
}
// REPAIR v2, THREAD+, +12 CHARGE.
{
  toTransmit(5, () => { installTool(h.store, 'repair'); });
  deal(['repair-v2'], 'repair-v2');
  h.transmit();
  const row = rowOf('repair-v2');
  check('REPAIR v2: a pip per Repair copy with its version (v2 100%), `YOUR REPAIRS HEAL ×2`', row?.pips.length === 2
    && row.pips.every((pip) => pip.reading.startsWith('v2 ')) && row.status === SKILLS_TEXT.status.repairV2, JSON.stringify(row));
}
{
  toTransmit(5);
  deal(['thread-plus'], 'thread-plus');
  h.transmit();
  // The crash's emergency transmission took the Core down (−25 and transit hits): a healthy Core first.
  setHealth(getAiCore(state())!.id, 100);
  let row = rowOf('thread-plus');
  check('THREAD+: the AI Core\'s pip and `3 THREADS`', row?.pips.length === 1 && row.pips[0]!.label === 'AI CORE' && row.status === SKILLS_TEXT.status.threads(3),
    JSON.stringify(row));
  setHealth(getAiCore(state())!.id, 40);
  row = rowOf('thread-plus');
  check('…a Core below 50 gives one thread whatever its capacity: `AI CORE BELOW 50% — 1 THREAD NOW`', row?.status === SKILLS_TEXT.status.threadsLow(1)
    && row.tone === 'warn', JSON.stringify(row));
}
{
  toTransmit(5);
  deal(['charge'], 'charge');
  h.transmit();
  const row = rowOf('charge');
  check('+12 REPAIR CHARGE: no pips, `+12 REPAIR CHARGE ARRIVED WITH YOU`', row?.pips.length === 0 && row.status === SKILLS_TEXT.status.charge(12), JSON.stringify(row));
  const longest = [
    SKILLS_TEXT.empty, SKILLS_TEXT.emptyHint, SKILLS_TEXT.status.holding(2, 'UNIT-998·999'), SKILLS_TEXT.status.idle('UNIT-998·999'), SKILLS_TEXT.status.trimThisShip(30),
    SKILLS_TEXT.status.trimNextShip(30), SKILLS_TEXT.status.trimNoEffect, SKILLS_TEXT.status.repairV2, SKILLS_TEXT.status.noRepairV2,
    SKILLS_TEXT.status.threadsLow(1), SKILLS_TEXT.status.charge(999), SKILLS_TEXT.status.gone, SKILLS_TEXT.pipTitle.gone('FIREWALL.sys'),
    SKILLS_TEXT.pipTitle.file('Repair.bak'), ...Object.values(ARCHIVE_TEXT.runEnd), ...Object.values(ARCHIVE_TEXT.footer), ARCHIVE_TEXT.footerTitle,
    ARCHIVE_TEXT.offline, ARCHIVE_TEXT.offlineDetail, ARCHIVE_TEXT.corruptDetail, ARCHIVE_TEXT.wipeHint, ARCHIVE_TEXT.withoutHint,
    ARCHIVE_TEXT.without, ARCHIVE_TEXT.wiped, DRAFT_TEXT.keys(3),
  ];
  check('every Skills and archive line is ≤ 70 characters', longest.every(lineOk), longest.filter((line) => !lineOk(line)).join(' | '));
}

// --- The title: CORRUPT plays on without the archive; the crumb's wave -------------------------------------------
{
  h.newRun(11);
  check('a NEW RUN is on its title', state().run.phase === 'title');
  // A page whose archive holds JSON that does not read (a stub localStorage).
  const stored = new Map<string, string>([[META_STORAGE_KEY, '{ not an archive']]);
  const storage: MetaStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => { stored.set(key, value); },
    removeItem: (key) => { stored.delete(key); },
  };
  const opened = openRunArchive(() => storage);
  h.store.update((d) => { d.archive = { status: opened }; });
  const received = receiveTransmission(h.store);
  check('ARCHIVE CORRUPT: RECEIVE TRANSMISSION starts the run without the archive (status "without", the bad record left as it was)',
    opened === 'corrupt' && received && state().run.phase === 'boot' && state().archive.status === 'without'
    && stored.get(META_STORAGE_KEY) === '{ not an archive');
  closeArchive();
  // PLAY WITHOUT ARCHIVE, the box's own answer, is the same thing before RECEIVE.
  h.newRun(11);
  openRunArchive(() => storage);
  h.store.update((d) => { d.archive = { status: 'corrupt' }; });
  playWithoutArchive(h.store);
  check('…PLAY WITHOUT ARCHIVE answered first: the run starts the same way', state().archive.status === 'without'
    && receiveTransmission(h.store) && state().run.phase === 'boot' && stored.get(META_STORAGE_KEY) === '{ not an archive');
  closeArchive();
  const crumbs = headerCrumbs(state(), getPrediction());
  check('the header crumb: UNIT-047 · WAVE 1 (the unit unchanged, the wave beside it)', crumbs.unit === 'UNIT-047' && crumbs.wave === 'WAVE 1', JSON.stringify(crumbs));
  h.store.update((d) => { d.mission.wave = 2; });
  check('…WAVE 2 on the next run', headerCrumbs(state(), getPrediction()).wave === 'WAVE 2');
}

finish();
