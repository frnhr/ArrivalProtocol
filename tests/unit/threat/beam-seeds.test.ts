// Phase 3 slice 2 (slice-2-plan §6.1, Track THREAT): beam seeds, pure, plus one store for the beam into KESTREL.
// • the roll by noise (04 §3.4's table) over many beams; the targets (never the Core, charge, a FIREWALL, 046.log, Engine
//   I/O or Nav Plotter); the scripted tutorial seed next to Telemetry, and a scripted file left behind;
// • the layout behind the target (file, GAP 1, seed, WALL 4), the charge floor before the seeds, the no-room rule (a stray
//   lands in the centre of the largest free region), ride-free (no link room);
// • the calm-only clock (it stands still at TACTICAL), rm in 2 s, the beam flag through bite → consume → pack, and the
//   TRACE tally (beam-born blocks, "a seed that ate reports twice");
// • one store: the beam into KESTREL lays the seed behind Telemetry, the boot's ECC line names it, the seed alert holds
//   SKIP and names its file, rm says the seed's words once a ship, a seed left behind reports home at the ship's end
//   (TRACE 1, 'trace-changed'), and once HOLLOW is aboard a seed left feeds its root instead.
import { check, finish } from '../wp1/harness';
import { createHarness7 } from '../wp7/harness7';
import { lockOn } from '../landing/harness-landing';
import {
  rollBeamSeeds, seedTargetsOf, seedCountFor, beamSeedSegment, tallyBeamBorn, plantBeamSeed, beamSeedTarget,
} from '@systems/beam-seeds';
import { packUnit, packedFiles, layoutCarried, BEAM_SEED_LAYOUT_BLOCKS } from '@systems/carry';
import { stepHollow, hollowReach, bitersOf, type HollowStepCtx } from '@systems/hollow';
import { endShip } from '@systems/run';
import { continueAfterReport as runContinueAfterReport } from '@systems/run';
import { setRequest } from '@systems/repository';
import { setCourseFromDesk } from '../support/desk';
import { WORKED_ROUTE } from '@systems/arm-fixture';
import { actionDelete, deleteSec } from '@state/actions';
import { getOps } from '@systems/ops-core';
import { skipBlockReason } from '@systems/pace';
import { getPrediction } from '@systems/predict';
import { createRng } from '@systems/rng';
import { createInitialState, createHollowState } from '@state/initial';
import { buildShipMemory, FRESH_UNIT_RACK_E, FRESH_UNIT_RACK_F, MEMORY_LAYOUTS } from '@data/memory';
import { assertMemoryInvariants, segmentStarts } from '@systems/memory-ops';
import { tallyPreview, beamSeedsInMemory } from '@state/threat-selectors';
import { integrityState } from '@state/selectors';
import { SEEDS_ONLY_DEF } from '@data/threats';
import { SEED_WORDS_POOL, THREAT_TEXT, eccSeedsLine } from '@data/threat-text';
import { SEED_ALERT_ID } from '@systems/alerts';
import { buildDirectorCtx } from '@systems/director';
import { THREAT_RULES } from '@data/threat-rules';
import {
  BEAM_SEED_ODDS, BEAM_SEED_FIRST_BITE_CALM_SEC, BEAM_SEED_BITE_EVERY_SEC, CHARGE_ARRIVAL_FLOOR, WALL_MIN_BLOCKS,
  SEED_GAP_TO_TARGET_BLOCKS,
} from '@data/tuning';
import type { Packet } from '@systems/carry';
import type { Segment, HollowSegment } from '@/types/segment';
import type { GameState, ArrivalReport } from '@state/schema';
import { bootLine, type LineVars } from '@data/script';
import { rackOf, layoutOf } from '@data/memory';
import { createInitialState as fixtureState } from '@state/initial';
import { currentShip } from '@systems/map-run';
import type { BeamSeedSource } from '@/types/threat';
import type { LinkNoise } from '@/types/threat';
import { fixtureVerdict } from '../support/arm-ship';

const KESTREL = 2;
// Track RETIRE: run 1's arm KESTREL (COMPACT: the unit's racks E–F from block 192), its link the worked route's hop from
// HALCYON; the classic one was FULL (the unit at 256) on a link of 112.
const KESTREL_WORLD = fixtureState({ seed: 1, shipIndex: KESTREL, carried: 'fresh' });
const kestrel = currentShip(KESTREL_WORLD);
const KESTREL_LINK = KESTREL_WORLD.run.map.route.at(-1)!.hop!.linkBlocks;
const KESTREL_LAYOUT = MEMORY_LAYOUTS[kestrel.memoryClass];
// The beam into a ship at the seeds act's depth (map-facts: the scripted first-run seed beside Telemetry, NOISY later).
const KESTREL_SEEDS: BeamSeedSource = { kind: 'scripted', firstRun: [{ role: 'telemetry' }], later: 2 };

// A fresh unit's files packed for KESTREL's link (the packet a beam carries).
function freshPacket(): Packet {
  const files = [...FRESH_UNIT_RACK_E, ...FRESH_UNIT_RACK_F]
    .filter((item): item is Exclude<typeof item, { free: number }> => !('free' in item))
    .map((item) => structuredClone(item) as Segment);
  return packUnit(files, KESTREL_LINK, []);
}

// --- The roll ---------------------------------------------------------------------------------------------------------
{
  const beams = 4000;
  const means = ([0, 1, 2, 3] as LinkNoise[]).map((noise) => {
    const rng = createRng(1000 + noise);
    let total = 0;
    for (let i = 0; i < beams; i++) total += seedCountFor(noise, rng);
    return total / beams;
  });
  const expected = ([0, 1, 2, 3] as LinkNoise[]).map((noise) => BEAM_SEED_ODDS[noise].reduce((sum, odds, count) => sum + odds * count, 0));
  check('the seeds per beam follow 04 §3.4 by noise (means 0, 0.45, 1.1, 1.85 over 4000 beams)',
    means.every((mean, index) => Math.abs(mean - expected[index]!) < 0.06), means.map((mean) => mean.toFixed(2)).join(' / '));
  check('…every row of BEAM_SEED_ODDS sums to 1', ([0, 1, 2, 3] as LinkNoise[]).every((noise) => Math.abs(BEAM_SEED_ODDS[noise].reduce((a, b) => a + b, 0) - 1) < 1e-9));

  const packet = freshPacket();
  const targets = seedTargetsOf(packedFiles(packet)).map((seg) => seg.name);
  check('targets: the packed infectable files, never the Core, Engine I/O, Nav Plotter, REPAIR CHARGE or 046.log',
    !targets.some((name) => ['AI Core', 'Engine I/O', 'Nav Plotter', 'REPAIR CHARGE', '???', '046.log'].includes(name)) && targets.includes('Telemetry'),
    targets.join(', '));
  const scripted = rollBeamSeeds(packet, KESTREL_SEEDS, true, createRng(7));
  check('the tutorial run\'s beam into KESTREL: one seed, next to Telemetry, with words from 05\'s pool',
    scripted.length === 1 && scripted[0]!.targetName === 'Telemetry' && SEED_WORDS_POOL.includes(scripted[0]!.words), JSON.stringify(scripted));
  const noTelemetry = { ...packet, rackE: packet.rackE.filter((seg) => seg.role !== 'telemetry') };
  const fallback = rollBeamSeeds(noTelemetry, KESTREL_SEEDS, true, createRng(7));
  check('…Telemetry left behind on the TRANSMIT screen: the seed rides behind a rolled target instead',
    fallback.length === 1 && targets.includes(fallback[0]!.targetName) && fallback[0]!.targetName !== 'Telemetry', JSON.stringify(fallback));
  let laterSeeds = 0;
  const distinct = Array.from({ length: 200 }, (_, i) => rollBeamSeeds(packet, KESTREL_SEEDS, false, createRng(i))).every((plans) => {
    laterSeeds += plans.length;
    return new Set(plans.map((plan) => plan.targetId)).size === plans.length;
  });
  check('a later run rolls KESTREL\'s beam at noise 2 (about 1.1 seeds a beam), each seed behind a different file',
    distinct && laterSeeds / 200 > 0.8 && laterSeeds / 200 < 1.4, `${(laterSeeds / 200).toFixed(2)} a beam`);
  check('a clean beam (noise 0) and no source carry nothing', rollBeamSeeds(packet, { kind: 'noise', noise: 0 }, false, createRng(3)).length === 0
    && rollBeamSeeds(packet, { kind: 'none' }, true, createRng(3)).length === 0);
}

// --- The layout -------------------------------------------------------------------------------------------------------
{
  const packet = freshPacket();
  const filesBefore = packet.filesBlocks;
  const chargeBefore = packet.chargeCarried;
  packet.seeds = rollBeamSeeds(packet, KESTREL_SEEDS, true, createRng(7));
  check('seeds ride free: neither the files\' blocks nor the charge that crosses change', packet.filesBlocks === filesBefore && packet.chargeCarried === chargeBefore);
  const layout = layoutCarried(packet, packet.chargeCarried, kestrel, fixtureVerdict(KESTREL), '???');
  const segs = layout.racks.segs;
  const at = segs.findIndex((seg) => seg.name === 'Telemetry');
  const [gap, seed, wall] = [segs[at + 1], segs[at + 2], segs[at + 3]];
  check(`laid out behind its target: Telemetry, GAP ${SEED_GAP_TO_TARGET_BLOCKS}, the seed, WALL ${WALL_MIN_BLOCKS}`,
    gap?.type === 'free' && gap.size === SEED_GAP_TO_TARGET_BLOCKS && seed?.type === 'hollow' && seed.seed === true && seed.beam === true
    && wall?.type === 'free' && wall.size === WALL_MIN_BLOCKS, segs.slice(at, at + 5).map((s) => `${s.name}:${s.size}`).join(' '));
  check('…the arrival names it (ArrivalReport.seeds) and the charge laid out is all that crossed',
    layout.seeds.length === 1 && layout.seeds[0]!.segId === seed?.id && layout.seeds[0]!.targetName === 'Telemetry' && layout.chargeBlocks === packet.chargeCarried);
  const memory = buildShipMemory(kestrel, layout.racks, createRng(1), true, '???', null, []);
  assertMemoryInvariants(memory, KESTREL_LAYOUT.totalBlocks);
  const reach = hollowReach(memory, 0).filter((r) => r.hollowId === seed!.id);
  check('…so it bites only Telemetry: a bite on its left, a WALL on its right',
    reach.find((r) => r.side === 'left')?.verdict === 'bite' && memory.find((s) => s.id === reach.find((r) => r.side === 'left')?.neighbourId)?.name === 'Telemetry'
    && reach.find((r) => r.side === 'right')?.verdict === 'wall', reach.map((r) => `${r.side}:${r.verdict}`).join(' '));
  check('beamSeedTarget finds the file a seed rides behind', beamSeedTarget(memory, seed!.id)?.name === 'Telemetry');

  // The no-room rule: a receiver with no room left after the files and the charge floor.
  const room = KESTREL_LAYOUT.totalBlocks - KESTREL_LAYOUT.unitStart + 24;
  const crowded: Packet = { ...packet, seeds: [...packet.seeds, { targetId: packet.rackE.find((s) => s.role === 'autopilot')!.id, targetName: 'Autopilot', words: 'x', disguise: null }] };
  const filler: Segment = { id: 'big-skill', name: 'Filler', type: 'skill', size: room - packet.filesBlocks - CHARGE_ARRIVAL_FLOOR - BEAM_SEED_LAYOUT_BLOCKS - 2, integrity: 100 } as unknown as Segment;
  crowded.rackE = [...crowded.rackE, filler];
  const tight = layoutCarried(crowded, 40, kestrel, fixtureVerdict(KESTREL), '???');
  check('the charge floor comes before the seeds: the first seed fits, the charge above the floor gets what is left',
    tight.chargeBlocks >= CHARGE_ARRIVAL_FLOOR && tight.racks.segs.filter((s) => s.type === 'hollow').length === 1, `charge ${tight.chargeBlocks}`);
  check('…the seed with no room is a stray (the no-room rule)', tight.racks.strays?.length === 1 && tight.seeds.length === 2);
  const tightMemory = buildShipMemory(kestrel, tight.racks, createRng(1), true, '???', null, []);
  assertMemoryInvariants(tightMemory, KESTREL_LAYOUT.totalBlocks);
  const stray = tightMemory.find((s) => s.id === tight.racks.strays![0]!.id)!;
  const starts = segmentStarts(tightMemory);
  const strayAt = starts[tightMemory.indexOf(stray)]!;
  const left = tightMemory[tightMemory.indexOf(stray) - 1]!;
  const right = tightMemory[tightMemory.indexOf(stray) + 1]!;
  check('…which lands in the centre of the largest free region of the whole memory (the pod racks)',
    strayAt < KESTREL_LAYOUT.unitStart && left.type === 'free' && right.type === 'free' && Math.abs(left.size - right.size) <= 1, `at ${strayAt}, ${left.size} | ${right.size}`);
  // The review's minor 4: a stray is next to nothing, so it is reported loose, by the rack it landed in.
  check('…and the arrival reports it loose, not next to the file it was rolled for', tight.seeds[1]!.loose === true && tight.seeds[0]!.loose === undefined);
  const strayState = createInitialState({ seed: 5, shipIndex: KESTREL, carried: tight.racks });
  const withArrival = { ...strayState, run: { ...strayState.run, arrival: { seeds: tight.seeds } as unknown as ArrivalReport } } as GameState;
  const strayLine = bootLine('seeds', withArrival, {} as LineVars);
  check(`…the ECC line: \`${strayLine}\``, strayLine === `> ECC: 2 FOREIGN BLOCKS · NEXT TO TELEMETRY · 1 LOOSE IN RACK ${rackOf(strayAt, KESTREL_LAYOUT)}`, strayLine);
  check('…a stray alone: `> ECC: 1 FOREIGN BLOCK · LOOSE IN RACK D`', eccSeedsLine([], ['D']) === '> ECC: 1 FOREIGN BLOCK · LOOSE IN RACK D'
    && eccSeedsLine(['Telemetry']) === '> ECC: 1 FOREIGN BLOCK IN PACKET · NEXT TO TELEMETRY');
}

// --- The calm-only clock, the bite, consume, pack, the tally ----------------------------------------------------------
{
  const state = createInitialState({ seed: 5, shipIndex: KESTREL, carried: 'fresh' });
  const memory = state.memory;
  const telemetry = memory.find((seg) => seg.role === 'telemetry')!;
  const seed = plantBeamSeed(memory, telemetry.id, 'hungry. sorry.', '???');
  assertMemoryInvariants(memory, KESTREL_LAYOUT.totalBlocks);
  const hollow = createHollowState(SEEDS_ONLY_DEF);
  const ctx = (aiNow: number, tactical: boolean): HollowStepCtx => ({
    thrustDelivered: false, landingActive: false, aiNow, rng: createRng(1), hollow, loopClosed: false, coastAtAi: 0, owner: '???',
    wakeHeld: false, firstSeedHeld: tactical,
  });
  let ai = 0;
  const dt = 0.05;
  // 40 AI s at TACTICAL, then calm.
  let wakeAt: number | null = null;
  for (; ai < 40 + BEAM_SEED_FIRST_BITE_CALM_SEC + 1; ai += dt) {
    stepHollow(memory, dt, SEEDS_ONLY_DEF, ctx(ai, ai < 40));
    if (wakeAt === null && hollow.phase === 'awake') wakeAt = ai;
  }
  check(`the seeds-only clock counts only calm AI s: 40 s at TACTICAL, then the first bite ${BEAM_SEED_FIRST_BITE_CALM_SEC} calm s later`,
    wakeAt !== null && Math.abs(wakeAt - (40 + BEAM_SEED_FIRST_BITE_CALM_SEC)) < 0.11, `wake ${wakeAt?.toFixed(2)}`);
  const bitten = memory.find((seg) => seg.id === telemetry.id);
  check('…it bites Telemetry, and the infection carries the beam flag', bitten?.type === 'tool' && bitten.infected?.beam === true && hollow.biteInSec !== null
    && Math.abs(hollow.biteInSec - BEAM_SEED_BITE_EVERY_SEC) < 1.2, JSON.stringify(bitten && 'infected' in bitten ? bitten.infected : null));
  const packedInfected = packedFiles(packUnit(memory, 200, [])).find((seg) => seg.id === telemetry.id);
  check('…a packed copy keeps it (an infection carried to the next ship stays the beam\'s)', packedInfected !== undefined && 'infected' in packedInfected && packedInfected.infected?.beam === true);
  for (let i = 0; i < 2000 && memory.some((seg) => seg.id === telemetry.id); i++, ai += dt) stepHollow(memory, dt, SEEDS_ONLY_DEF, ctx(ai, false));
  const eaten = memory.find((seg) => seg.type === 'hollow' && seg.ate === 'Telemetry') as HollowSegment | undefined;
  check('…eaten, Telemetry turns into a beam-born block', eaten?.beam === true && eaten.seed === undefined);
  check('the tally: the seed and the block it made, 2 ("a seed that ate reports twice")', tallyBeamBorn(memory) === 2 && beamSeedsInMemory(memory).some((s) => s.id === seed.id));
  // The review's M1: left alone, the seed's meal used to bite on (Telemetry → Nav Plotter → Sensor Interp → Autopilot →
  // Engine I/O → the Core infected at 280 s). In the seeds act only seeds bite: the eaten block is inert.
  const navId = memory.find((seg) => seg.role === 'navplot')!.id;
  const engineId = memory.find((seg) => seg.role === 'engine-io')!.id;
  const intact = (id: string): boolean => {
    const seg = memory.find((candidate) => candidate.id === id);
    return seg !== undefined && seg.type !== 'hollow' && !('infected' in seg && seg.infected);
  };
  const aiFiles = memory.filter((seg) => seg.type === 'core' || seg.type === 'tool').map((seg) => seg.id);
  for (const end = ai + 400; ai < end; ai += dt) stepHollow(memory, dt, SEEDS_ONLY_DEF, ctx(ai, false));
  check('M1: 400 more AI s with the seed ignored: Nav Plotter, Engine I/O and the Core are intact (the eaten block never bites)',
    intact(navId) && intact(engineId) && aiFiles.filter((id) => id !== telemetry.id).every(intact) && tallyBeamBorn(memory) === 2,
    memory.filter((seg) => seg.type === 'hollow').map((seg) => (seg as HollowSegment).ate ?? 'seed').join(', '));
  check('…the HUD draws no reach from it (bitersOf: the seeds alone)', hollowReach(memory, ai, bitersOf(memory, SEEDS_ONLY_DEF)).every((r) => r.hollowId === seed.id)
    && hollowReach(memory, ai).some((r) => r.hollowId === eaten?.id));
  const seedAt = memory.findIndex((seg) => seg.id === seed.id);
  memory.splice(seedAt, 1, { id: 'freed', name: 'Free', type: 'free', size: seed.size } as Segment);
  for (const end = ai + 100; ai < end; ai += dt) stepHollow(memory, dt, SEEDS_ONLY_DEF, ctx(ai, false));
  check('…and after the seed is rm\'d the eaten block still bites nothing, and still reports home (tally 1)',
    aiFiles.filter((id) => id !== telemetry.id).every(intact) && tallyBeamBorn(memory) === 1);
  check(`rm takes 2 s on a seed (1.0 + 0.5 per block)`, Math.abs(deleteSec(beamSeedSegment({ targetId: 'x', targetName: 'x', words: 'x', disguise: null }, '???')) - 2) < 1e-9);
}

// --- One store: the beam into KESTREL ---------------------------------------------------------------------------------
const h = createHarness7(3, { soulsFound: true });
const s = (): Readonly<GameState> => h.store.getState();

// Track RETIRE: run 1's arm HALCYON, on to KESTREL along the worked route, Rm requested at its desk (the arm's tools come
// by request; the classic schedule licensed DELETE at KESTREL's start).
function toKestrel(seed: number): void {
  h.shipAlone(1, seed);
  lockOn(h);
  if (!h.untilPhase('report', 120)) throw new Error(`HALCYON never reached its report (${s().run.phase})`);
  runContinueAfterReport(h.store);
  setRequest(h.store, 'rm');
  setCourseFromDesk(h.store, WORKED_ROUTE[s().run.map.route.length]!);
  h.transmit();
}

toKestrel(3);
const arrival = s().run.arrival!;
const beamSeed = s().memory.find((seg) => seg.type === 'hollow' && seg.beam === true) as HollowSegment | undefined;
check('the beam into KESTREL (tutorial run): its seed is in memory behind Telemetry, and the arrival names it',
  beamSeed !== undefined && arrival.seeds.length === 1 && arrival.seeds[0]!.segId === beamSeed.id && arrival.seeds[0]!.targetName === 'Telemetry'
  && beamSeedTarget(s().memory, beamSeed.id)?.name === 'Telemetry', JSON.stringify(arrival.seeds));
check('…KESTREL runs the seeds-only config, with no root', JSON.stringify(s().hollow.cfg) === JSON.stringify(SEEDS_ONLY_DEF) && !s().memory.some((seg) => seg.type === 'hollow' && seg.root));
h.untilPhase('flight', 60);
const ecc = eccSeedsLine(['Telemetry']);
check(`the boot's ECC line names the seed and its target: ${ecc}`, s().log.entries.some((entry) => entry.text === ecc), ecc);
const landed = h.events.filter((event) => event.name === 'seed-landed-beam').map((event) => event.payload as { segId: string; targetId: string });
check('…and \'seed-landed-beam\' fires once for it, as that line is said, naming Telemetry', landed.length === 1 && landed[0]!.segId === beamSeed?.id
  && s().memory.find((seg) => seg.id === landed[0]!.targetId)?.role === 'telemetry', JSON.stringify(landed));
for (let i = 0; i < 20; i++) h.step();
const seedAlert = s().alerts.list.find((alert) => alert.id === SEED_ALERT_ID);
// Track RETIRE: on run 1's arm the Rm delivery's files land at the boot in the WALL to the seed's right (the classic five's
// DELETE licence did not), so the seed bites there too: the alert names a file the seed bites.
const bitten = hollowReach(s().memory, s().clock.aiSec).filter((r) => r.hollowId === beamSeed?.id && r.verdict === 'bite')
  .map((r) => s().memory.find((seg) => seg.id === r.neighbourId)?.name ?? '');
check('the seeds-only alert names a file the seed bites and holds SKIP', bitten.some((name) => seedAlert?.text === THREAT_TEXT.seedNextTo(name))
  && seedAlert!.inhibitsSkip === true
  && skipBlockReason(s(), getPrediction()) === seedAlert!.text, `${seedAlert?.text} / ${skipBlockReason(s(), getPrediction())}`);
check('DELETE arrives at KESTREL\'s boot (Rm requested at HALCYON\'s desk)', s().run.licences.includes('delete'));
const refusal = actionDelete(h.store, beamSeed!);
const startedAi = s().clock.aiSec;
let doneAi: number | null = null;
for (let i = 0; i < 200 && doneAi === null; i++) {
  h.step();
  if (getOps().length === 0) doneAi = s().clock.aiSec;
}
const words = beamSeed!.words!;
check('rm the seed: 2 AI s, then `> rm seed ... OK · it said: "…"`', refusal === null && doneAi !== null && Math.abs(doneAi - startedAi - 2) < 0.15
  && s().log.entries.some((entry) => entry.text === THREAT_TEXT.seedSaid(words)), `${refusal} ${doneAi !== null ? (doneAi - startedAi).toFixed(2) : 'never'}`);
check('…the seed is gone, and so are its alert and SKIP\'s hold', beamSeedsInMemory(s().memory).length === 0 && !s().alerts.list.some((alert) => alert.id === SEED_ALERT_ID));
check('…\'seed-deleted\' carries the words', h.events.some((event) => event.name === 'seed-deleted' && (event.payload as { words: string | null }).words === words));
// A second seed this ship goes quietly (one voice a ship).
// (beside the unit's file with the most free room after it: on run 1's arm the Rm delivery filled Telemetry's WALL)
const roomy = s().memory.reduce<{ id: string; free: number }>((best, seg, i, all) => {
  const next = all[i + 1];
  const free = next?.type === 'free' ? next.size : 0;
  return seg.type !== 'free' && seg.type !== 'hollow' && free > best.free ? { id: seg.id, free } : best;
}, { id: '', free: 0 });
plantBeamSeed(s().memory, roomy.id, 'tell them we tried.', '???');
const second = s().memory.find((seg) => seg.type === 'hollow' && seg.beam === true)!;
actionDelete(h.store, second);
for (let i = 0; i < 80; i++) h.step();
check('…a second seed on the same ship goes with the plain delete echo (at most one voice a ship)',
  !s().log.entries.some((entry) => entry.text === THREAT_TEXT.seedSaid('tell them we tried.')) && beamSeedsInMemory(s().memory).length === 0);

// M1: a file a seed ate, left in memory: the strip asks for a DELETE of it too (it reports home), lighting it.
{
  h.store.update((draft) => {
    const at = draft.memory.findIndex((seg) => seg.role === 'telemetry');
    const was = draft.memory[at]!;
    draft.memory[at] = { id: 'eaten-telem', name: '???', type: 'hollow', size: was.size, root: false, locked: false, owner: '???', ate: 'Telemetry', beam: true, desc: '' } as HollowSegment;
    draft.ui.memoryRev++;
  });
  const eatenCtx = buildDirectorCtx(s(), getPrediction(), { events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null });
  const eatenRule = THREAT_RULES.find((rule) => rule.id === (s().ui.mode === 'tools' ? 'beam-eaten-tab' : 'beam-eaten'))!;
  check(`M1: a seed's meal left in memory: \`${THREAT_TEXT.eatenReportsHome}\``, eatenRule.activeWhen(eatenCtx)
    && [THREAT_TEXT.eatenReportsHome, THREAT_TEXT.eatenReportsHomeTab].includes(eatenRule.text(eatenCtx) as never) && !eatenRule.doneWhen!(eatenCtx));
  actionDelete(h.store, s().memory.find((seg) => seg.id === 'eaten-telem')!);
  for (let i = 0; i < 120 && s().memory.some((seg) => seg.id === 'eaten-telem'); i++) h.step();
  const goneCtx = buildDirectorCtx(s(), getPrediction(), { events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null });
  check('…DELETE clears it, and the line is done', !s().memory.some((seg) => seg.id === 'eaten-telem') && eatenRule.doneWhen!(goneCtx) && !eatenRule.activeWhen(goneCtx));
}

// The last rm deleted: the loud line, as information; then the seed's no-rm line on the strip.
toKestrel(5);
h.untilPhase('flight', 60);
for (let i = 0; i < 20; i++) h.step();
h.events.length = 0;
// KESTREL's PATH UNCERTAIN (its Sensor Interp at 45) outranks every mind line: fixed first, as a kid would.
h.store.update((draft) => {
  const sensor = draft.memory.find((seg) => seg.role === 'sensor');
  if (sensor && 'integrity' in sensor) { sensor.integrity = 100; sensor.state = integrityState(100); }
  draft.ui.memoryRev++;
});
const rmFile = s().memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'delete')!;
actionDelete(h.store, rmFile);
const texts = new Set<string>();
for (let i = 0; i < 200; i++) {
  h.step();
  const shown = h.shown();
  if (shown) texts.add(shown.text);
}
check(`the last rm deleted: 'last-rm-lost' and the TERMINAL's \`${THREAT_TEXT.lastRmEcho}\``,
  h.events.filter((event) => event.name === 'last-rm-lost').length === 1 && s().log.entries.some((entry) => entry.text === THREAT_TEXT.lastRmEcho));
// The flight's own lines (KESTREL's debris dodge) outrank a mind line on the strip now, so the rule is read directly.
const ctx = buildDirectorCtx(s(), getPrediction(), { events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null });
const noRm = THREAT_RULES.find((rule) => rule.id === (s().ui.mode === 'tools' ? 'beam-seed-no-rm-tab' : 'beam-seed-no-rm'))!;
const rmLesson = THREAT_RULES.filter((rule) => rule.lesson === 'seed-first');
check(`…with the seed still aboard the strip's line is \`${THREAT_TEXT.seedNoRm}\`, and the RM lesson stands down`,
  noRm.activeWhen(ctx) && [THREAT_TEXT.seedNoRm, THREAT_TEXT.seedNoRmTab].some((line) => line === noRm.text(ctx)) && rmLesson.every((rule) => !rule.activeWhen(ctx)), [...texts].slice(-1).join(''));

// A seed left behind reports home.
toKestrel(4);
const traceBefore = s().run.threat.trace;
h.events.length = 0;
lockOn(h);
h.untilPhase('report', 120);
const preview = tallyPreview(s());
runContinueAfterReport(h.store);
check('a seed left at KESTREL\'s end reports home: TRACE 0 → 1, as the report previewed, and \'trace-changed\'',
  traceBefore === 0 && preview.left === 1 && s().run.threat.trace === 1 && JSON.stringify(s().run.threat.lastTally) === JSON.stringify(preview)
  && h.events.some((event) => event.name === 'trace-changed'), `${traceBefore} → ${s().run.threat.trace}, preview ${JSON.stringify(preview)}`);
// Track RETIRE: on run 1's arm HOLLOW is forced aboard one hop from New Haven, at CORMORANT (the classic five's VESPER): the
// beam into VESPER reads TRACE 1 and does not board; VESPER flown to its report, the beam into CORMORANT does.
setCourseFromDesk(h.store, WORKED_ROUTE[s().run.map.route.length]!);
check('…the next ship\'s plan reads it (VESPER: TRACE 1, not aboard yet)', s().run.transit?.threat.boards === null
  && s().run.transit?.threat.act !== 'hollow', JSON.stringify(s().run.transit?.threat.boards));
h.transmit();
h.untilPhase('flight', 60);
lockOn(h);
h.untilPhase('report', 120);
runContinueAfterReport(h.store);
setCourseFromDesk(h.store, WORKED_ROUTE[s().run.map.route.length]!);
check('…and the beam into CORMORANT boards it, forced (M3), with its root', s().run.transit?.threat.boards === 'forced'
  && (s().run.transit?.threat.rootBlocks ?? 0) > 0, JSON.stringify(s().run.transit?.threat.rootBlocks));

// Once HOLLOW is aboard, a seed left feeds its next root.
h.transmit();
h.untilPhase('flight', 60);
{
  // A beam-born block left anywhere (the receiver is full on VESPER: it goes into the largest free region).
  const memory = s().memory;
  const region = memory.reduce((best, seg, index) => (seg.type === 'free' && seg.size > (memory[best]?.size ?? 0) ? index : best), -1);
  const free = memory[region]!;
  const block = beamSeedSegment({ targetId: 'x', targetName: 'x', words: 'x', disguise: null }, memory.find((seg) => seg.type === 'hollow')!.name);
  memory.splice(region, 1, { ...free, size: free.size - block.size }, block);
  assertMemoryInvariants(memory, layoutOf(s()).totalBlocks);
}
const fedPreview = tallyPreview(s());
endShip(h.store, 'locked');
check('on CORMORANT (HOLLOW aboard) the seed left feeds it instead: TRACE stands, run.threat.fed +1',
  fedPreview.fed && fedPreview.left === 1 && s().run.threat.trace === 1 && s().run.threat.fed === 1, JSON.stringify(s().run.threat));

finish();
