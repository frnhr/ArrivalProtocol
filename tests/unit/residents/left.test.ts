// Slice 5, Track KIN (slice-5-plan §2.8, §7.1): the resident that left, on run 1's HERON (seed 7, slot 4: HELM, one signal
// fragment), reached ARES-VII → HALCYON → HERON on the WP7 harness. Each part starts from the same snapshot of the ship in
// flight:
// • rack A holds farewell.txt (outward: it carries the fragment) and three LEFT BEHIND leftovers, their cards rolled at the
//   boot (pool, pool, skill), the same on a second roll; the tools' rules on both kinds;
// • SCAN on the note: its lines and the signature, `signals` +1 and 'signal-found' (SIGNAL · 1/3), once only;
// • SCAN on a leftover: its card's name (`… · LEFT`, `A SKILL · LEFT`) and effect, 'leftover-read';
// • the deck at the PACKET (the real SET COURSE): pool, pool, skill, unique ids, LEFT BEHIND's reasons; an eaten leftover and
//   an unusable card each deal a plain card from the normal deal; the skill card falls back to `+2 CYCLES`, and to a plain
//   card when a pool card already is +2 CYCLES or the hop goes into a final ship; a skill pending at the desk is never the
//   card's;
// • the skill card's pick takes no link room and installs at the next boot: `> SKILL TRAINED: AUTODROP.skl v1 · from the
//   resident that left HERON`; skipped when that skill is pending;
// • the ship's record counts the leftovers eaten.
import { check, finish } from '../landing/checks';
import type { GameState, TransitPlan } from '@state/schema';
import type { Segment, LeftoverSegment, NoteSegment, HollowSegment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import { createHarness7 } from '../wp7/harness7';
import { restoreState } from '../wp1-rules/flows';
import { send, toDesk, fitPacket } from '../map/repo-fixture';
import { setCourseFromDesk } from '../support/desk';
import { giveSkillFile } from '../support/skills';
import { setLandingMode } from '../support/landing-instant';
import { startRun, endShip, transmitNext } from '@systems/run';
import { receiveTransmission } from '@systems/boot';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { on } from '@systems/events';
import { dealDraft, pickCard, transitPacket, applyLeftoverPick, leftoverSkill } from '@systems/draft';
import { rollLeftoverCards, noteLines } from '@systems/resident-left';
import { hopBetween, reachableFrom } from '@systems/map-hop';
import { targetRefusal } from '@systems/tool-targets';
import { actionScan } from '@state/actions';
import { newSegId } from '@systems/memory-ops';
import { getUpgrade } from '@data/upgrades';
import { RESIDENT_SEG_IDS } from '@data/residents';
import { RESIDENT_TEXT } from '@data/resident-text';
import { KIN_TEXT } from '@data/kin-text';
import { TOOL_REFUSAL } from '@data/tool-text';
import { END_SLOTS } from '@data/arm';

const SEED = 7;
const HERON = 4;
const h = createHarness7(SEED);
const st = (): Readonly<GameState> => h.store.getState();
const seg = (id: string): Segment | undefined => st().memory.find((candidate) => candidate.id === id);
const leftover = (index: number): LeftoverSegment => seg(RESIDENT_SEG_IDS.leftover(index)) as LeftoverSegment;
const rule = (target: Segment, activeKind: FsToolKind): string | null => targetRefusal(target, { state: st(), activeKind, pickedSource: null });

const signalsHeard: unknown[] = [];
const readHeard: string[] = [];
on('signal-found', (payload) => signalsHeard.push(payload));
on('leftover-read', ({ segId }) => readHeard.push(segId));

setLandingMode('manual');
h.newRun(SEED);
startRun(h.store, SEED, FIRST_RUN_LINEAGE, 'arm');
if (!receiveTransmission(h.store)) throw new Error('left: not on the title');
h.stepUntil(() => st().run.phase === 'flight', 30);
for (const slot of [2, HERON]) {
  h.store.update((draft) => { draft.run.phase = 'report'; });
  send(h.store, slot);
  h.stepUntil(() => st().run.phase === 'flight', 40);
}
const BASE = structuredClone(st());
const fresh = (): void => { restoreState(h, BASE); };
const NEXT = reachableFrom(st().run.map, HERON).find((slot) => !END_SLOTS.includes(slot))!;
const deal = (): ReturnType<typeof dealDraft> => dealDraft(st(), hopBetween(st().run.map, HERON, NEXT));

// --- The files and their cards ------------------------------------------------------------------------------------------
{
  const def = st().resident.def;
  const note = seg(RESIDENT_SEG_IDS.note) as NoteSegment;
  const cards = [0, 1, 2].map((index) => leftover(index).card);
  check(`HERON (slot 4) holds HELM's note and three leftovers in rack A (the note outward, with its fragment)`,
    st().level.shipName === 'HERON' && def?.kind === 'left' && def.name === 'HELM' && def.fragments === 1 && note.type === 'note'
    && note.tone === 'outward' && note.fragment && note.name === 'farewell.txt' && [0, 1, 2].every((index) => leftover(index)?.name === RESIDENT_TEXT.file.leftover
      && leftover(index).desc === 'scan me' && !leftover(index).scanned), JSON.stringify(st().memory.slice(7, 12)));
  check('the cards were rolled at the boot: two pool cards (different), then the skill card', cards[0]?.kind === 'pool' && cards[1]?.kind === 'pool'
    && cards[0].id !== cards[1].id && cards[2]?.kind === 'skill', JSON.stringify(cards));
  rollLeftoverCards(h.store);
  check('…and a second roll (a resumed BEAM boots the same) rolls the same cards', JSON.stringify([0, 1, 2].map((index) => leftover(index).card)) === JSON.stringify(cards));
  check('the note takes SCAN only (the log\'s words otherwise; MOVE: IT STAYS WHERE IT WAS LEFT)', rule(note, 'scan') === null
    && rule(note, 'delete') === TOOL_REFUSAL.logDelete && rule(note, 'move') === TOOL_REFUSAL.noteMove && rule(note, 'copy') === TOOL_REFUSAL.logCopy
    && rule(note, 'repair') === TOOL_REFUSAL.logRepair && rule(note, 'swap') === TOOL_REFUSAL.swapShipOnly);
  const one = leftover(0);
  check('a leftover takes SCAN, REPAIR (when hurt) and MOVE; DELETE and COPY are refused (IT ISN\'T YOURS TO …)', rule(one, 'scan') === null
    && rule(one, 'repair') === TOOL_REFUSAL.healthy && rule(one, 'move') === null && rule(one, 'delete') === TOOL_REFUSAL.logDelete
    && rule(one, 'copy') === TOOL_REFUSAL.logCopy, ['scan', 'repair', 'move', 'delete', 'copy'].map((tool) => rule(one, tool as FsToolKind)).join(' | '));
}

// --- SCAN: the note, then the leftovers -----------------------------------------------------------------------------------
{
  const note = seg(RESIDENT_SEG_IDS.note) as NoteSegment;
  const lines = noteLines(note);
  actionScan(h.store, note);
  h.stepUntil(() => st().resident.left?.noteRead === true, 10);
  const depth = st().run.map.route.at(-1)!.depth;
  check('SCAN on farewell.txt reads it: its lines, signed `— HELM`', st().resident.left?.noteRead === true
    && seg(RESIDENT_SEG_IDS.note)?.desc === `${lines.join(' ')} — HELM` && lines.length >= 2, seg(RESIDENT_SEG_IDS.note)?.desc);
  check('…its fragment is a signal: run.residents.signals +1 (slot 4, its depth), \'signal-found\' (1 of 3)',
    JSON.stringify(st().run.residents.signals) === JSON.stringify([{ slot: HERON, depth }])
    && JSON.stringify(signalsHeard) === JSON.stringify([{ slot: HERON, count: 1 }]), JSON.stringify({ signals: st().run.residents.signals, signalsHeard }));
  actionScan(h.store, seg(RESIDENT_SEG_IDS.note)!);
  const t0 = st().clock.aiSec;
  h.stepUntil(() => st().clock.aiSec > t0 + 3, 10);
  check('…a second SCAN finds no second signal', st().run.residents.signals.length === 1 && signalsHeard.length === 1);
  for (const index of [0, 2]) {
    actionScan(h.store, leftover(index));
    h.stepUntil(() => readHeard.includes(RESIDENT_SEG_IDS.leftover(index)), 10);
  }
  const pool = leftover(0).card!;
  const title = pool.kind === 'pool' ? getUpgrade(pool.id) : null;
  check(`SCAN on a leftover names its card: \`${leftover(0).name}\`, the card's effect`, title !== null && leftover(0).name === `${title.title} · LEFT`
    && leftover(0).desc === title.effect && leftover(0).scanned, JSON.stringify(leftover(0)));
  check('…the skill\'s: `A SKILL · LEFT` (its skill is chosen at the PACKET); \'leftover-read\' for each', leftover(2).name === 'A SKILL · LEFT'
    && leftover(2).desc === KIN_TEXT.leftover.skillDesc && readHeard.join() === 'leftover1,leftover3' && leftover(1).name === RESIDENT_TEXT.file.leftover);
}

// --- The deck --------------------------------------------------------------------------------------------------------------
fresh();
{
  const cards = [0, 1].map((index) => (leftover(index).card as { kind: 'pool'; id: string }).id);
  toDesk(h.store);
  setCourseFromDesk(h.store, NEXT);
  const offer = st().run.transit!.offer;
  check('the PACKET deals the leftover deck: pool, pool, skill, in the leftovers\' order', offer.length === 3 && offer[0]?.id === cards[0]
    && offer[1]?.id === cards[1] && offer[2]?.id === 'skill' && offer.map((card) => card.leftover?.segId).join() === 'leftover1,leftover2,leftover3',
    JSON.stringify(offer));
  check('…the skill card is AUTODROP.skl v1 (the first open branch the run never had: AUTOBURN is owned), its ids unique',
    offer[2]?.leftover?.skill === 'autodrop' && offer[2].title === 'AUTODROP.skl v1' && new Set(offer.map((card) => card.id)).size === 3,
    JSON.stringify(offer[2]));
  check('…each says HELM left it behind (unless a boost says more)', offer.every((card) => card.boosted || card.why === 'HELM left it behind'),
    offer.map((card) => card.why).join(' | '));
  // The skill card takes no link room: the packet is the same with it picked as with nothing.
  const plan = st().run.transit!;
  check('…the skill card takes no link room', transitPacket(st(), { ...plan, pick: 'skill' }).filesBlocks === transitPacket(st(), { ...plan, pick: null }).filesBlocks);
}
fresh();
{
  const normal = (() => {
    const saved = structuredClone(st().resident);
    h.store.update((draft) => { draft.resident = { def: null, corrupted: null, sleeper: null, left: null }; });
    const cards = deal();
    h.store.update((draft) => { draft.resident = saved; });
    return cards;
  })();
  const first = leftover(0);
  const eaten: HollowSegment = { id: newSegId('hollow'), name: '???', type: 'hollow', size: first.size, root: false, locked: false, owner: '???' };
  h.store.update((draft) => {
    draft.memory[draft.memory.findIndex((block) => block.id === first.id)] = eaten;
    const second = draft.memory.find((block) => block.id === RESIDENT_SEG_IDS.leftover(1)) as LeftoverSegment;
    second.card = { kind: 'pool', id: 'repair-v2' };
  });
  const offer = deal();
  const plain = normal.filter((card) => card.id !== 'skill');
  check('an eaten leftover, and one whose card the arm can\'t deal (REPAIR v2: the repository\'s), each deal a plain card from the normal deal',
    offer.length === 3 && offer[0]?.leftover === undefined && offer[1]?.leftover === undefined && offer[0]?.id === plain[0]?.id
    && offer[1]?.id === plain[1]?.id && offer[2]?.id === 'skill' && new Set(offer.map((card) => card.id)).size === 3,
    JSON.stringify({ offer: offer.map((card) => card.id), normal: normal.map((card) => card.id) }));
  endShip(h.store, 'locked');
  check('…and the ship\'s record counts the leftover eaten', st().run.residents.met.at(-1)?.fate === 'left' && st().run.residents.met.at(-1)?.leftoversEaten === 1,
    JSON.stringify(st().run.residents.met.at(-1)));
}
fresh();
{
  for (const skill of ['autodrop', 'sentry'] as const) giveSkillFile(h.store, skill, 1);
  const offer = deal();
  check('with no skill to give, the skill card is +2 CYCLES (still the leftover\'s)', leftoverSkill(st()) === null && offer[2]?.id === 'cycles'
    && offer[2].leftover?.segId === 'leftover3', JSON.stringify(offer.map((card) => card.id)));
  h.store.update((draft) => { (draft.memory.find((block) => block.id === RESIDENT_SEG_IDS.leftover(1)) as LeftoverSegment).card = { kind: 'pool', id: 'cycles' }; });
  const twice = deal();
  check('…but a deck holds one +2 CYCLES: with a pool card already that, the skill\'s leftover deals a plain card',
    twice[1]?.id === 'cycles' && twice[2]?.leftover === undefined && twice[2]?.id !== 'cycles' && new Set(twice.map((card) => card.id)).size === 3,
    JSON.stringify(twice.map((card) => card.id)));
  const hop = { ...hopBetween(st().run.map, HERON, NEXT), to: END_SLOTS[0]! };
  const final = dealDraft(st(), hop);
  check('…and into a final ship (no +2 CYCLES there) both deal plain cards', final.length === 3 && !final.some((card) => card.id === 'cycles')
    && final[1]?.leftover === undefined && final[2]?.leftover === undefined, JSON.stringify(final.map((card) => card.id)));
}

// --- The skill card's grant --------------------------------------------------------------------------------------------------
fresh();
{
  h.store.update((draft) => {
    draft.run.skills.pending.push({ skill: 'autodrop', kind: 'train', to: { version: 1, lock: 0 }, cost: 3, visit: 0 });
  });
  check('a skill pending at the desk is never the skill card\'s', leftoverSkill(st()) !== 'autodrop', String(leftoverSkill(st())));
  const grants = st().run.skills.skillGrants.length;
  const plan = { pick: 'skill', offer: [{ id: 'skill', title: '', effect: '', why: '', boosted: false, leftover: { segId: 'leftover3', skill: 'autodrop' } }] } as unknown as TransitPlan;
  applyLeftoverPick(h.store, plan);
  check('…and a pick of it is skipped at TRANSMIT ▸ when that skill was bought here since the deal', st().run.skills.skillGrants.length === grants);
}
fresh();
{
  toDesk(h.store);
  setCourseFromDesk(h.store, NEXT);
  check('the skill card is picked like any card', pickCard(h.store, 'skill') === null && st().run.transit?.pick === 'skill');
  fitPacket(h.store);
  const from = st().log.entries.length;
  transmitNext(h.store);
  h.stepUntil(() => st().run.phase === 'flight', 40);
  const trained = st().log.entries.slice(from).map((entry) => entry.text).filter((text) => text.startsWith('> SKILL TRAINED'));
  const file = st().memory.find((block) => block.type === 'upgrade' && block.upgrade === 'autodrop');
  check('…and installs at the next boot: `> SKILL TRAINED: AUTODROP.skl v1 · from the resident that left HERON`',
    trained.includes('> SKILL TRAINED: AUTODROP.skl v1 · from the resident that left HERON') && file !== undefined
    && st().run.skills.skillGrants.some((grant) => grant.skill === 'autodrop' && grant.installedAtDepth !== null)
    && st().run.arrival?.card === null && !st().run.upgrades.includes('skill' as never), JSON.stringify(trained));
}

finish();
