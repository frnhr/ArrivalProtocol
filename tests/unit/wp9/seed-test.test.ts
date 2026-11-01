// WP9 acceptance 4 (§6.6, §9 WP9 items 3–4): HOLLOW's seeds and DELETE.
// • The 'walls' targeting (systems/hollow.ts seedSpot): the centre of the smallest free gap of ≥ 4 blocks next to
//   a cluster (of equal ones a WALL between colonists and HOLLOW first, then the lower address); with no such gap,
//   the centre of the largest free region (§9's edge case "a seed with no wall anywhere"). Space an op reserved is
//   never used. (WP9 deviation: smallest, not §6.6's largest; see PROGRESS.md.)
// • The live seed: the first one comes seed.firstAfterSec after the wake, its outline telegraphed for 2 AI s before
//   it lands; DELETE is licensed at that telegraph, HOLLOW says `> sorry. i'm so hungry.` (once a run), and the
//   strip says `RM THE SEED — pick up DELETE, click the seed`. The seed splits the wall into GAPs and bites across
//   one; deleting it restores the WALL.
// • A telegraph on a spot a MOVE then takes: the seed is re-aimed at the landing, and never onto reserved space.
// • A seed next to a FIREWALL (the WP8 note): it bites the cluster on its open side; the FIREWALL is untouched.
// • INSPECT's text for every hollow block: the root (LOCKED / UNLOCKED), an eaten block (ATE …), a seed (SEED ·
//   DELETE IT); anything else fails loudly (the lead's note).
// • ShipDef validation: seeds need a spreading HOLLOW with a timed wake; 'near-tools' is VESPER's (built in WP10).
// • WP11 (the lead's TODO): no seed lands within bite of a tool licensed on this ship and not used yet; the pure calls
//   above it pass `[]` (every tool tried).
// Slice 1a: KESTREL's racks are phase 2's with `C` → `P`; the old cluster codes below name the pods where those
// clusters sat (`C08` is POD 08, tests/unit/support/pod-code.ts). Bay Ctrl took Printer Uplink's 6 blocks.
import { check, finish } from '../wp1/harness';
import { isPodCode } from '../support/pod-code';
import { createHarness9, KESTREL } from './harness9';
import { seedSpot, hollowReach, seedsInMemory, threateningSeeds } from '@systems/hollow';
import { actionDelete, actionMove } from '@state/actions';
import { installTool } from '@systems/licences';
import { deleteQuestion, targetRefusal } from '@systems/tool-targets';
import { mergeAdjacentFree, freeSegment, segmentStarts, assertMemoryInvariants } from '@systems/memory-ops';
import { freshUnitRacks } from '@systems/carry';
import { getShip, validateHollowDef, type HollowDef } from '@data/ships';
import { hollowInspectState, HOLLOW_INSPECT, HOLLOW_STORY } from '@data/hollow-text';
import { MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { SEED_BLOCKS, SEED_TELEGRAPH_SEC, WALL_MIN_BLOCKS, WAKE_AFTER_DODGE_SEC, ROOT_BLOCKS } from '@data/tuning';
import { createToolFiles } from '@data/fs-tools';
import type { Segment, DriverSegment, HollowSegment } from '@/types/segment';
import { phase2HollowOf, phase2ShipDef } from '../support/hollow-world';
import { buildShipMemory } from '@data/memory';
import { createRng } from '@systems/rng';

const h = createHarness9(3);
const state = () => h.store.getState();

// The IN correction, held until the strip says RELEASE (it takes the path off the debris cloud).
const correctIn = (): void => {
  h.keyDown('Space');
  h.stepUntil(() => /^RELEASE/.test(h.objective()?.text ?? ''), 30);
  h.keyUp('Space');
  h.step();
};

// Phase 3 slice 2: KESTREL as phase 2 had it (its root between POD 09 and POD 10), where these seeds were tuned.
function kestrelMemory(): Segment[] {
  return buildShipMemory(phase2ShipDef(KESTREL), freshUnitRacks(getShip(KESTREL)), createRng(3), false, '???', { blocks: ROOT_BLOCKS }, []);
}

// Takes clusters out of a memory (as a MOVE away would), leaving free space, merged.
function without(memory: Segment[], clusters: readonly string[]): Segment[] {
  const out = memory.map((seg) => (seg.type === 'driver' && clusters.some((code) => isPodCode(seg.pod, code)) ? freeSegment(seg.size) : structuredClone(seg)));
  mergeAdjacentFree(out);
  assertMemoryInvariants(out, MEMORY_TOTAL_BLOCKS);
  return out;
}

const addrOf = (memory: readonly Segment[], seg: Segment): number => segmentStarts(memory)[memory.indexOf(seg)]!;
const soul = (memory: readonly Segment[], code: string): DriverSegment =>
  memory.find((seg): seg is DriverSegment => seg.type === 'driver' && isPodCode(seg.pod, code))!;

// --- The targeting, pure -------------------------------------------------------------------------------------------
{
  const memory = kestrelMemory();
  const spot = seedSpot(memory, [])!;
  const c06 = soul(memory, 'C06');
  const gapStart = addrOf(memory, c06) + c06.size;
  check('KESTREL as it arrives: no WALL guards a cluster from HOLLOW yet (its GAPs are 1 and 2), so the seed aims at the smallest gap between clusters (16, C06|C07), at its centre',
    spot.startAddr === gapStart + Math.floor((16 - SEED_BLOCKS) / 2), JSON.stringify(spot));

  const walled = without(memory, ['C09', 'C10']);
  const c08 = soul(walled, 'C08');
  const wallStart = addrOf(walled, c08) + c08.size;
  const wallSize = walled[walled.indexOf(c08) + 1]!.size;
  const walledSpot = seedSpot(walled, [])!;
  check('with C09 and C10 moved away, the WALLs next to the root guard C08 (9 blocks) and C11 (10): the seed aims at the smaller, the 9',
    wallSize === 9 && walledSpot.startAddr === wallStart + Math.floor((9 - SEED_BLOCKS) / 2), `${wallSize} → ${JSON.stringify(walledSpot)}`);

  // Two equal gaps between clusters: the lower address.
  const twin = without(memory, ['C02', 'C04']);
  const twinSpot = seedSpot(twin, [])!;
  const c01 = soul(twin, 'C01');
  check('…of equal gaps (C02 and C04 gone: two 8-block gaps in rack B), the lower address', twinSpot.startAddr === addrOf(twin, c01) + c01.size + 3, JSON.stringify(twinSpot));

  // No wall anywhere: no cluster in memory at all.
  const empty = memory.map((seg) => (seg.type === 'driver' ? freeSegment(seg.size) : structuredClone(seg)));
  mergeAdjacentFree(empty);
  const largest = empty.filter((seg) => seg.type === 'free').sort((a, b) => b.size - a.size)[0]!;
  const emptySpot = seedSpot(empty, [])!;
  check('with no gap next to any cluster, the centre of the largest free region (§9 edge case)',
    emptySpot.startAddr === addrOf(empty, largest) + Math.floor((largest.size - SEED_BLOCKS) / 2) && emptySpot.gapId === largest.id, JSON.stringify(emptySpot));

  // Reserved space: the smallest wall reserved by a running op is skipped.
  const reserved = without(memory, ['C09', 'C10']);
  const nine = reserved[reserved.indexOf(soul(reserved, 'C08')) + 1]!;
  if (nine.type !== 'free') throw new Error('setup: no free gap after C08');
  nine.reservedBy = 99;
  const reservedSpot = seedSpot(reserved, [])!;
  check('a gap an op reserved is never used (the 9-block WALL reserved: the seed goes to the 10)',
    reservedSpot.gapId !== nine.id && reserved.find((seg) => seg.id === reservedSpot.gapId)?.size === 10, JSON.stringify(reservedSpot));

  // WP11: a 5-block wall between a cluster and Swap: the seed in its middle would have Swap two blocks away (a GAP).
  const cluster = structuredClone(soul(memory, 'C06'));
  const swapFiles = createToolFiles('swap');
  const filler = { id: 'filler-ship', name: 'Filler', type: 'ship', size: 4, integrity: 100, scanned: true } as Segment;
  const swapSize = swapFiles.reduce((sum, seg) => sum + seg.size, 0);
  const beside: Segment[] = [cluster, freeSegment(5), ...swapFiles, filler, freeSegment(MEMORY_TOTAL_BLOCKS - cluster.size - 5 - swapSize - filler.size)];
  const triedSpot = seedSpot(beside, [])!;
  const sparedSpot = seedSpot(beside, ['swap'])!;
  check('WP11: a wall beside an untried Swap is not seeded (Swap would be within the seed\'s bite); with Swap used, it is',
    triedSpot.gapId === beside[1]!.id && sparedSpot.gapId !== beside[1]!.id, `tried ${triedSpot.gapId}, spared ${sparedSpot.gapId}`);
}

// --- The live seed: telegraph, DELETE, the line, the WALL --------------------------------------------------------
{
  h.kestrel(3, { phase2Hollow: true, sensorHealed: true });
  // The IN correction first, as every real KESTREL kid makes it before HOLLOW wakes (WP9 fix round 1: the debris
  // dodge's countdown is an urgent line until then; since round 2 a timed wake also waits while the dodge is open).
  correctIn();
  // Walls first (the kid's MOVEs), then HOLLOW wakes now: the first seed comes seed.firstAfterSec after the wake.
  h.store.update((d) => {
    d.memory = without(d.memory, ['C09', 'C10']);
    d.hollow.cfg.wake = { afterAiSec: 0, coastLeadSec: null };
    d.ui.memoryRev++;
  });
  const firstAfter = phase2HollowOf(KESTREL).seed!.firstAfterSec;
  // WP9 review round 2: a timed wake also waits WAKE_AFTER_DODGE_SEC after the debris dodge closed (here: when the
  // correction took the path off the cloud).
  h.stepUntil(() => state().hollow.phase === 'awake', WAKE_AFTER_DODGE_SEC + 2);
  check('KESTREL\'s HOLLOW wakes, and its first seed is due firstAfterSec later', state().hollow.seedInSec !== null
    && Math.abs(state().hollow.seedInSec! - firstAfter) < 0.2, String(state().hollow.seedInSec));
  // Phase 3 slice 2: DELETE comes at KESTREL's start now (the beam's seeds are in memory from the first tick).
  check('…DELETE is already licensed (at the ship\'s start)', state().run.licences.includes('delete'));
  const wakeAt = state().clock.aiSec;
  h.stepUntil(() => state().hollow.seedTelegraph !== null, firstAfter + 2);
  const telegraph = state().hollow.seedTelegraph;
  check('the first seed is telegraphed firstAfterSec after the wake', telegraph !== null && Math.abs(state().clock.aiSec - wakeAt - firstAfter) < 0.2,
    `${(state().clock.aiSec - wakeAt).toFixed(2)} s`);
  h.step();
  check('…DELETE is licensed at the telegraph (its files in memory), and CONTROL says so', state().run.licences.includes('delete')
    && state().memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === 'delete'));
  check('…HOLLOW: `> sorry. i\'m so hungry.`', state().log.entries.some((entry) => entry.speaker === 'hollow' && entry.text === HOLLOW_STORY.sorry));
  const telegraphedAt = telegraph!.startAddr;
  const landedBefore = h.events.filter((event) => event.name === 'seed-landed').length;
  h.stepFor(SEED_TELEGRAPH_SEC - 0.3);
  check('…the outline blinks for 2 AI s: nothing has landed yet', h.events.filter((event) => event.name === 'seed-landed').length === landedBefore
    && state().hollow.seedTelegraph !== null);
  h.stepFor(0.5);
  const seeds = seedsInMemory(state().memory);
  check('…then the seed lands where it blinked: a 2-block hollow block, in the 9-block WALL next to C08', seeds.length === 1
    && addrOf(state().memory, seeds[0]!) === telegraphedAt && seeds[0]!.size === SEED_BLOCKS && state().hollow.seedsLanded === 1, String(seeds.length));
  const seedSeg = seeds[0]!;
  const reach = hollowReach(state().memory, state().clock.aiSec).filter((entry) => entry.hollowId === seedSeg.id);
  const toC08 = reach.find((entry) => entry.side === 'left')!;
  check('…it splits the WALL into GAPs: 3 to C08 (it bites), 4 to the root', toC08.gapBlocks === 3 && toC08.verdict === 'bite'
    && reach.find((entry) => entry.side === 'right')!.gapBlocks === 4, JSON.stringify(reach.map((entry) => `${entry.side}:${entry.gapBlocks}:${entry.verdict}`)));
  check('…a seed that can bite holds SKIP (the alert)', threateningSeeds(state().memory, state().clock.aiSec).length === 1
    && state().alerts.list.some((alert) => alert.id === 'hollow-seed' && alert.inhibitsSkip));
  h.stepFor(0.3);
  const strip = h.shown()?.text ?? '';
  check('the strip: `[TAB], RM THE SEED — pick up DELETE, click the seed` (amber)', strip === '[TAB], RM THE SEED — pick up DELETE, click the seed', strip);
  h.press('Tab');
  h.stepFor(0.5);
  check('…in the MIND: `RM THE SEED — pick up DELETE, click the seed`, lighting the DELETE chip', h.shown()?.text === 'RM THE SEED — pick up DELETE, click the seed'
    && h.shown()?.highlight === 'chip-delete', `${h.shown()?.text} → ${h.shown()?.highlight}`);
  check('INSPECT on the seed: its own text (SEED · DELETE IT), no throw', hollowInspectState(seedSeg) === HOLLOW_INSPECT.seed);
  const refusal = actionDelete(h.store, seedSeg);
  check('DELETE works on the seed', refusal === null, String(refusal));
  h.runOps(5);
  const c08 = soul(state().memory, 'C08');
  const after = state().memory[state().memory.indexOf(c08) + 1]!;
  check('deleting the seed restores the WALL: 9 free blocks between C08 and the root again', after.type === 'free' && after.size === 9
    && seedsInMemory(state().memory).length === 0, `${after.type} ${after.size}`);
  const wallReach = hollowReach(state().memory, state().clock.aiSec).find((entry) => entry.neighbourId === c08.id);
  check('…HOLLOW\'s reach toward C08 is a WALL again', wallReach?.verdict === 'wall' && wallReach.gapBlocks === 9, JSON.stringify(wallReach));
  check('…the run counted a DELETE', state().run.stats.deletes >= 1);
  h.stepFor(0.5);
  check('…and the strip no longer asks (the first-seed lesson is done)', !/RM THE SEED/.test(h.shown()?.text ?? '')
    && state().director.done.includes('hollow-seed-first'), h.shown()?.text);
  const sorry = state().log.entries.filter((entry) => entry.text === HOLLOW_STORY.sorry).length;
  // The next seed: no second sorry.
  h.store.mutate((d) => { d.hollow.seedInSec = 0.01; });
  h.stepFor(SEED_TELEGRAPH_SEC + 0.5);
  check('the next seed lands too, with no second `sorry` (once a run)', state().hollow.seedsLanded === 2
    && state().log.entries.filter((entry) => entry.text === HOLLOW_STORY.sorry).length === sorry);
}

// --- A telegraph on a spot a MOVE then takes ---------------------------------------------------------------------
{
  h.kestrel(3, { phase2Hollow: true, sensorHealed: true });
  // WP9 review round 2: HOLLOW never wakes while the debris dodge is open, so the IN correction first (as above).
  correctIn();
  h.store.update((d) => {
    d.memory = without(d.memory, ['C09', 'C10']);
    d.hollow.cfg.wake = { afterAiSec: 0, coastLeadSec: null };
    d.ui.memoryRev++;
  });
  // MOVE's tool file, as the licence installs it (KESTREL hands earlier ships' licences over in its first seconds:
  // after the IN correction it may already be in).
  if (!state().run.licences.includes('move')) installTool(h.store, 'move');
  h.stepUntil(() => state().hollow.phase === 'awake', WAKE_AFTER_DODGE_SEC + 2);
  h.store.mutate((d) => { d.hollow.seedInSec = 0.01; });
  h.stepUntil(() => state().hollow.seedTelegraph !== null, 2);
  const telegraph = state().hollow.seedTelegraph!;
  // The kid MOVEs C01 into the 9-block WALL the outline blinks in (its first block on the outline).
  const memory = state().memory;
  const c08 = soul(memory, 'C08');
  const gap = memory[memory.indexOf(c08) + 1]!;
  const gapStart = addrOf(memory, gap);
  const c01 = soul(memory, 'C01');
  const moved = actionMove(h.store, c01, { regionSegIds: [gap.id], col: 0 });
  check('setup: C01 placed at the gap\'s start covers the outline', gapStart + c01.size > telegraph.startAddr + telegraph.size && gapStart <= telegraph.startAddr);
  check('setup: the MOVE into the telegraphed spot starts (its blocks reserved for the move)', moved === null, String(moved));
  h.stepFor(SEED_TELEGRAPH_SEC + 0.2);
  const seeds = seedsInMemory(state().memory);
  const landed = seeds[0];
  check('the seed is re-aimed at the landing: it lands, but not on the spot the MOVE took', seeds.length === 1 && landed !== undefined
    && addrOf(state().memory, landed) !== telegraph.startAddr, landed ? String(addrOf(state().memory, landed)) : 'none');
  h.checkMemory();
  const landedAt = addrOf(state().memory, landed!);
  const onReserved = state().memory.some((seg, index) => seg.type === 'free' && seg.reservedBy !== undefined
    && segmentStarts(state().memory)[index]! <= landedAt && segmentStarts(state().memory)[index]! + seg.size > landedAt);
  check('…never on space the MOVE reserved, and memory stays valid', !onReserved);
  h.runOps(10);
  h.checkMemory();
}

// --- A seed next to a FIREWALL ----------------------------------------------------------------------------------
{
  h.kestrel(3, { phase2Hollow: true, sensorHealed: true });
  correctIn();
  // A FIREWALL at the far end of the 9-block wall, against the root (where a kid MOVEs it): [C08][7 free][FW][R].
  h.store.update((d) => {
    d.memory = without(d.memory, ['C09', 'C10']);
    const c08 = d.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 8)!;
    const index = d.memory.indexOf(c08) + 1;
    const gap = d.memory[index]!;
    d.memory.splice(index, 1, freeSegment(gap.size - 2), { id: 'fw-test', name: 'Firewall.sys', type: 'firewall', size: 2 });
    d.hollow.cfg.wake = { afterAiSec: 0, coastLeadSec: null };
    d.ui.memoryRev++;
  });
  h.checkMemory();
  h.stepUntil(() => state().hollow.phase === 'awake', WAKE_AFTER_DODGE_SEC + 2);
  h.store.mutate((d) => { d.hollow.seedInSec = 0.01; });
  h.stepFor(SEED_TELEGRAPH_SEC + 0.3);
  const seedSeg = seedsInMemory(state().memory)[0];
  const c08 = soul(state().memory, 'C08');
  const next = state().memory[state().memory.indexOf(c08) + 1];
  check('with a FIREWALL against the root, the 7-block gap between it and C08 is the smallest wall a cluster has: the seed lands there',
    seedSeg !== undefined && state().memory.indexOf(seedSeg) === state().memory.indexOf(c08) + 2 && next?.type === 'free', seedSeg?.id);
  // The next bite: the seed bites C08 across its GAP; the FIREWALL holds and is not eaten.
  h.store.mutate((d) => { d.hollow.biteInSec = 0.01; });
  h.stepFor(0.3);
  check('…the seed bites C08 across its GAP at the next bite; the FIREWALL is untouched', soul(state().memory, 'C08').infected !== undefined
    && state().memory.some((seg) => seg.id === 'fw-test' && seg.type === 'firewall'));
}

// --- INSPECT's text for every hollow block -----------------------------------------------------------------------
{
  const base: HollowSegment = { id: 'x', name: '???', type: 'hollow', size: 8, root: false, locked: false, owner: '???', desc: 'd' };
  let threw = false;
  try { hollowInspectState(base); } catch { threw = true; }
  // WP11 (the lead's item 1): the root LAST LIGHT's duel opens has its own words (`OPEN · DELETE IT`, HOLLOW_INSPECT.unlocked).
  check('INSPECT: the locked root LOCKED, an unlocked root its duel\'s words, an eaten block ATE …, a seed SEED · DELETE IT',
    hollowInspectState({ ...base, root: true, locked: true }) === 'LOCKED' && hollowInspectState({ ...base, root: true }) === HOLLOW_INSPECT.unlocked
    && hollowInspectState({ ...base, ate: 'C12 · OKAFOR' }) === 'ATE C12 · OKAFOR' && hollowInspectState({ ...base, size: 2, seed: true }) === HOLLOW_INSPECT.seed);
  check('…a hollow block that is none of them fails loudly', threw);
}

// --- DELETE on ship files: the inline confirm with its consequence (§9 WP9 item 4) ---------------------------------
{
  h.kestrel(3, { phase2Hollow: true, sensorHealed: true });
  const named = (name: string): Segment => state().memory.find((seg) => seg.name === name)!;
  const cargo = deleteQuestion(state(), named('Cargo Ctrl'));
  const thrust = deleteQuestion(state(), named('Thrust Controller'));
  const bay = deleteQuestion(state(), named('Bay Ctrl'));
  check('DELETE on a ship file asks first, with its consequence: `DELETE CARGO CTRL? No flight effect. Leaves a 6-block gap.`',
    cargo?.question === 'DELETE CARGO CTRL?' && cargo.detail === 'No flight effect. Leaves a 6-block gap.', JSON.stringify(cargo));
  // WP10 review fix round 1: a ship file whose backup is still in memory says what a SWAP undoes (the healthy backup
  // can now be put into service after its primary is gone), so DELETE never reads as the cure.
  // Bay Ctrl's damage effect comes with slice 1b (slice-1a-plan §1.3: honest about 1a).
  check('…Thrust Controller: the engine stops till a SWAP; Bay Ctrl: no effect yet',
    thrust?.detail === 'The engine stops till you SWAP in Thrust.alt. Leaves an 8-block gap.'
    && bay?.question === 'DELETE BAY CTRL?' && bay.detail === 'No pod can launch. Leaves a 6-block gap.', `${thrust?.detail} | ${bay?.detail}`);
  const seedSeg: HollowSegment = { id: 'seed-x', name: '???', type: 'hollow', size: 2, root: false, locked: false, owner: '???', seed: true, desc: 'd' };
  check('…a seed needs no question (it is HOLLOW, nothing of yours), and DELETE may target it', deleteQuestion(state(), seedSeg) === null
    && targetRefusal(seedSeg, { state: state(), activeKind: 'delete', pickedSource: null }) === null);
}

// --- ShipDef validation -----------------------------------------------------------------------------------------
{
  const kestrel = phase2HollowOf(KESTREL);
  const throws = (def: HollowDef): boolean => { try { validateHollowDef('test', def); return false; } catch { return true; } };
  check('KESTREL\'s HOLLOW validates (seeds every 50 s at the walls, the first 30 s after the wake)', !throws(kestrel)
    && kestrel.seed?.everySec === 50 && kestrel.seed.target === 'walls' && kestrel.spreadEverySec === 20 && kestrel.drainPerSec === 4);
  // WP10 built 'near-tools' (VESPER): it validates now; the other two still fail loudly.
  check('…seeds on a HOLLOW that never bites, or a zero interval fail loudly; near-tools validates since WP10',
    throws({ ...kestrel, spreadEverySec: null }) && !throws({ ...kestrel, seed: { ...kestrel.seed!, target: 'near-tools' } })
    && throws({ ...kestrel, seed: { ...kestrel.seed!, everySec: 0 } }));
  check('WALL_MIN_BLOCKS is the wall a seed aims at', WALL_MIN_BLOCKS === 4);
}

finish();
