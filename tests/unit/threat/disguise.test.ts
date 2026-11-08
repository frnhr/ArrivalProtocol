// Slice 4d (slice-4cde-plan §4.1–§4.2, §8.1; Track SENTRY): disguised beam seeds, without SENTRY.
// • the roll: the odds by depth over a seeded sample (none before depth 5, one in three from 5, one in two from 7); both
//   draws always taken; no two decoys alike on one beam; the beam's own seeds, targets and words untouched by it;
// • real sends on the arm (map/repo-fixture's desk-to-desk walk): disguises only from depth 5, never on a delivery's seed;
// • the layout: the decoy rides onto the segment (`seen: null`) and the arrival names it;
// • one store (KESTREL alone, a decoy planted behind Telemetry): every reader that tells HOLLOW from a file sees a file (no
//   reach marks, no amber bite, a file on the mini-strip, no seed lessons or alert, no MOVE label, its decoy's echo name),
//   while TRACE still counts it; every tool answers it as a healthy unit file (review B1: MOVE and COPY take it, REPAIR says
//   ALREADY 100%, the placement and the MOVE preview as for a file); its bite is the tell and the strip says
//   `SOMETHING NEXT TO TELEMETRY IS EATING IT — SCAN its neighbours`; SCAN unmasks it in 1.2 s (`NOT A FILE`); DELETE works
//   on another without a SCAN, after its decoy's own confirm, in 2.0 s (`IT WAS A SEED`); MOVE and COPY on others run their
//   own time, unmask them (`NOT A FILE`) and move or copy nothing;
// • the boot: the ECC seeds line leaves a decoy out, and it lands with no thunk.
import '../support/classic-world';
import { check, finish } from '../wp1/harness';
import { createHarness7 } from '../wp7/harness7';
import { lockOn } from '../landing/harness-landing';
import { continueAfterReport } from '../support/classic-flow';
import { armRun, send } from '../map/repo-fixture';
import { WORKED_ROUTE } from '../map/run1-fixture';
import { rollBeamSeeds, rollDisguises, disguiseChanceAt, plantBeamSeed } from '@systems/beam-seeds';
import { packUnit, layoutCarried } from '@systems/carry';
import { seedsInMemory, threateningSeeds } from '@systems/hollow';
import { reachMarks, miniStripRows, amberBite } from '@systems/hollow-hud';
import { movePreview } from '@systems/move-preview';
import { targetRefusal, deleteQuestion, computeMoveRegion } from '@systems/tool-targets';
import { requestDelete } from '@systems/fs-tools';
import { installTool } from '@systems/licences';
import { actionScan, actionMove, actionCopy, moveSec, copySec } from '@state/actions';
import { getOps } from '@systems/ops-core';
import { getPrediction } from '@systems/predict';
import { buildDirectorCtx } from '@systems/director';
import { reachableFrom } from '@systems/map-hop';
import { currentSlot } from '@systems/map-run';
import { createRng, type Rng } from '@systems/rng';
import { assertMemoryInvariants, requireAddr } from '@systems/memory-ops';
import { isDisguised, isVisibleHollow, decoyFileView, beamSeedsInMemory, tallyPreview } from '@state/threat-selectors';
import { THREAT_RULES, DISGUISE_RULES } from '@data/threat-rules';
import { SEED_ALERT_ID } from '@systems/alerts';
import { SEEDS_ONLY_DEF } from '@data/threats';
import { DISGUISE_POOL, SENTRY_TEXT, THREAT_TEXT, eccSeedsLine } from '@data/threat-text';
import { TOOL_REFUSAL, echoName } from '@data/tool-text';
import { FRESH_UNIT_RACK_E, FRESH_UNIT_RACK_F, rackOf, layoutOf } from '@data/memory';
import { classicShip, CLASSIC_HOPS } from '@data/classic-five';
import { nominalShipThreat } from '@systems/threat-plan';
import { DISGUISE_CHANCE_BY_DEPTH, SEED_BLOCKS } from '@data/tuning';
import type { BeamSeedPlan } from '@/types/threat';
import type { Segment, HollowSegment } from '@/types/segment';
import type { GameState } from '@state/schema';
import type { FsToolKind } from '@/types/fs-tool';

const KESTREL = 2;
const kestrel = classicShip(KESTREL);

function plan(index: number): BeamSeedPlan {
  return { targetId: `t${index}`, targetName: `File ${index}`, words: `words ${index}`, disguise: null };
}

// An rng that counts its draws.
function counting(seed: number): { rng: Rng; draws: () => number } {
  const inner = createRng(seed);
  let draws = 0;
  return { rng: () => { draws++; return inner(); }, draws: () => draws };
}

// --- The roll, pure ---------------------------------------------------------------------------------------------------
{
  const beams = 3000;
  const rows: string[] = [];
  let oddsOk = true;
  for (let depth = 1; depth <= 8; depth++) {
    let seeds = 0;
    let disguised = 0;
    for (let i = 0; i < beams; i++) {
      const rolled = rollDisguises([plan(0)], depth, createRng(depth * 10_000 + i));
      seeds++;
      if (rolled[0]!.disguise !== null) disguised++;
    }
    const share = disguised / seeds;
    const want = disguiseChanceAt(depth);
    rows.push(`d${depth} ${(100 * share).toFixed(1)}%`);
    if (Math.abs(share - want) > 0.03) oddsOk = false;
  }
  check('the odds by depth over 3000 beams each: none before 5, one in three from 5, one in two from 7', oddsOk
    && disguiseChanceAt(4) === 0 && disguiseChanceAt(5) === DISGUISE_CHANCE_BY_DEPTH[0]!.chance && disguiseChanceAt(7) === DISGUISE_CHANCE_BY_DEPTH[1]!.chance,
    rows.join(' '));

  const three = [plan(0), plan(1), plan(2)];
  const counter = counting(5);
  const rolled = rollDisguises(three, 7, counter.rng);
  const before = JSON.stringify(three);
  check('both draws are always taken: 2 per seed, disguised or not (the next seed never shifts)', counter.draws() === 6
    && counting(5).draws() === 0 && (() => { const c = counting(9); rollDisguises(three, 1, c.rng); return c.draws(); })() === 6);
  check('…the plans are untouched, and stripped of the decoy the result is the input (targets, names, words)',
    JSON.stringify(three) === before && JSON.stringify(rolled.map((p) => ({ ...p, disguise: null }))) === before);
  let unique = true;
  let decoys = 0;
  for (let i = 0; i < 400; i++) {
    const beam = rollDisguises(three, 7, createRng(77 + i)).flatMap((p) => (p.disguise === null ? [] : [p.disguise.name]));
    decoys += beam.length;
    if (new Set(beam).size !== beam.length) unique = false;
  }
  check('no two decoys alike on one beam, and every decoy is from DISGUISE_POOL', unique && decoys > 400
    && rolled.every((p) => p.disguise === null || DISGUISE_POOL.some((d) => d.name === p.disguise!.name && d.desc === p.disguise!.desc)), `${decoys} decoys`);

  // The beam's own roll (KESTREL's later-run noise) is the same with and without a disguise roll after it.
  const files = [...FRESH_UNIT_RACK_E, ...FRESH_UNIT_RACK_F]
    .filter((item): item is Exclude<typeof item, { free: number }> => !('free' in item)).map((item) => structuredClone(item) as Segment);
  const packet = packUnit(files, CLASSIC_HOPS[kestrel.slot]!.linkBlocks, []);
  const source = { kind: 'noise', noise: 3 } as const;
  const alone = rollBeamSeeds(packet, source, false, createRng(41));
  const withRoll = rollBeamSeeds(packet, source, false, createRng(41));
  rollDisguises(withRoll, 7, createRng(42));
  check('rollBeamSeeds is byte-identical whether or not a disguise roll follows (its own stream)', alone.length > 0
    && JSON.stringify(alone) === JSON.stringify(withRoll), JSON.stringify(alone.map((p) => p.targetName)));

  // The layout: the decoy rides onto the segment, and the arrival names it.
  packet.seeds = rollDisguises(rollBeamSeeds(packet, source, false, createRng(3)), 7, createRng(1));
  for (let s = 4; s < 60 && !packet.seeds.some((p) => p.disguise !== null); s++) packet.seeds = rollDisguises(rollBeamSeeds(packet, source, false, createRng(3)), 7, createRng(s));
  const layout = layoutCarried(packet, packet.chargeCarried, kestrel, nominalShipThreat(KESTREL), '???');
  const decoyPlan = packet.seeds.find((p) => p.disguise !== null)!;
  const arrived = layout.seeds.find((seed) => seed.disguise !== null);
  const segment = [...layout.racks.segs, ...(layout.racks.strays ?? [])].find((seg) => seg.id === arrived?.segId) as HollowSegment | undefined;
  check('the layout: the decoy rides onto its seed (`seen: null`) and ArrivalSeed.disguise names it; plain seeds carry null',
    arrived?.disguise === decoyPlan.disguise!.name && segment?.disguise?.name === decoyPlan.disguise!.name && segment.disguise.seen === null
    && layout.seeds.filter((seed) => seed.disguise === null).length === packet.seeds.filter((p) => p.disguise === null).length,
    JSON.stringify(layout.seeds));
}

// --- Real sends on the arm --------------------------------------------------------------------------------------------
{
  const perDepth = new Map<number, { seeds: number; disguised: number }>();
  let deliverySeedsDisguised = 0;
  for (let wave = 1; wave <= 2; wave++) {
    for (let seed = 1; seed <= 20; seed++) {
      const store = armRun(seed, wave);
      const pick = createRng(seed * 31 + wave);
      for (let guard = 0; guard < 12; guard++) {
        const state = store.getState();
        const next = reachableFrom(state.run.map, currentSlot(state.run));
        if (next.length === 0) break;
        send(store, next[Math.floor(pick() * next.length)]!);
        const after = store.getState();
        const row = perDepth.get(after.run.shipIndex + 1) ?? { seeds: 0, disguised: 0 };
        row.seeds += after.run.arrival!.seeds.length;
        row.disguised += after.run.arrival!.seeds.filter((s) => s.disguise !== null).length;
        perDepth.set(after.run.shipIndex + 1, row);
        // A delivery's seed (its chip already names the risk) is never disguised: one per seeded delivery stays plain.
        const seededDeliveries = after.run.arrival!.deliveries.filter((d) => d.seeded).length;
        if (after.run.arrival!.seeds.filter((s) => s.disguise === null).length < seededDeliveries) deliverySeedsDisguised++;
        store.update((draft) => { draft.run.phase = 'report'; });
      }
    }
  }
  const early = [...perDepth.entries()].filter(([depth]) => depth < 5).reduce((sum, [, row]) => sum + row.disguised, 0);
  const late = [...perDepth.entries()].filter(([depth]) => depth >= 5).reduce((sum, [, row]) => sum + row.disguised, 0);
  const table = [...perDepth.entries()].sort((a, b) => a[0] - b[0]).map(([depth, row]) => `d${depth} ${row.disguised}/${row.seeds}`).join(' ');
  check('40 runs sent desk to desk on the arm: no decoy before depth 5, decoys from depth 5, none on a delivery\'s seed',
    early === 0 && late > 0 && deliverySeedsDisguised === 0, table);
  // The worked route's beam into KESTREL-like depth 3 (scripted on run 1) is never disguised.
  const worked = armRun(3, 1);
  for (let i = 1; i < 3; i++) send(worked, WORKED_ROUTE[i]!);
  check('…run 1\'s scripted seed at depth 3 is plain', worked.getState().run.arrival!.seeds.length > 0
    && worked.getState().run.arrival!.seeds.every((s) => s.disguise === null));
}

// --- One store: a decoy in KESTREL's memory ---------------------------------------------------------------------------
const h = createHarness7(3, { soulsFound: true });
const s = (): Readonly<GameState> => h.store.getState();
const ctxNow = () => buildDirectorCtx(s(), getPrediction(), { events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null });
const decoyDef = DISGUISE_POOL[0]!;

function plantDecoy(targetRole: Segment['role'], decoy: { name: string; desc: string }, words: string): HollowSegment {
  let planted: HollowSegment | null = null;
  h.store.update((draft) => {
    const target = draft.memory.find((seg) => seg.role === targetRole)!;
    planted = plantBeamSeed(draft.memory, target.id, words, '???', decoy);
    assertMemoryInvariants(draft.memory, layoutOf(draft).totalBlocks);
    if (draft.hollow.cfg.wake === 'never') draft.hollow.cfg = structuredClone(SEEDS_ONLY_DEF);
    if (!draft.run.licences.includes('delete')) draft.run.licences.push('delete');
    if (!draft.run.licences.includes('scan')) draft.run.licences.push('scan');
    draft.ui.memoryRev++;
  });
  return s().memory.find((seg) => seg.id === planted!.id) as HollowSegment;
}

function runOps(maxTicks = 400): number {
  const startAi = s().clock.aiSec;
  for (let i = 0; i < maxTicks && getOps().length > 0; i++) h.step();
  return s().clock.aiSec - startAi;
}

// A healthy unit file of the decoy's kind (decoyFileView draws a `tool`), to answer the tools beside the decoy.
function healthyUnitTool(state: Readonly<GameState>): Segment {
  const found = state.memory.find((seg) => seg.type === 'tool' && seg.integrity === 100 && seg.infected === undefined && !seg.operating);
  if (found === undefined) throw new Error('disguise.test: no healthy unit tool in KESTREL\'s memory');
  return found;
}

// A free run that is part of the source's own MOVE footprint answers by the slide rule (the source's size and its neighbours),
// which is the decoy's own; only the other runs are compared with a stand-in.
function computeRegionHas(state: Readonly<GameState>, source: Segment, seg: Segment): boolean {
  return computeMoveRegion(state.memory, source)?.segs.includes(seg) === true;
}

h.shipAlone(KESTREL, 7);
h.store.update((draft) => {
  // KESTREL's PATH UNCERTAIN (its Sensor Interp) is fixed first, as a kid would, so the strip is the mind's.
  const sensor = draft.memory.find((seg) => seg.role === 'sensor');
  if (sensor && 'integrity' in sensor) { sensor.integrity = 100; sensor.state = 'intact'; }
});
for (let i = 0; i < 10; i++) h.step();
const decoy = plantDecoy('telemetry', decoyDef, 'hungry. sorry.');
{
  const state = s();
  const view = isDisguised(decoy) ? decoyFileView(decoy) : null;
  check(`a decoy planted behind Telemetry is disguised: \`${decoyDef.name}\` (${SEED_BLOCKS} blocks), a unit file to draw`,
    view !== null && view.name === decoyDef.name && view.type === 'tool' && view.integrity === 100
    && view.id === decoy.id && decoy.size === SEED_BLOCKS && !isVisibleHollow(decoy));
  check('…no seed to the strip\'s seed lines (seedsInMemory, threateningSeeds), but TRACE counts it (beamSeedsInMemory, the tally)',
    seedsInMemory(state.memory).length === 0 && threateningSeeds(state.memory, state.clock.aiSec).length === 0
    && beamSeedsInMemory(state.memory).some((seg) => seg.id === decoy.id) && tallyPreview(state).left === 1);
  const marks = reachMarks(state);
  const markIds = [...marks.bites.flatMap((b) => [b.hollowId, b.targetId]), ...marks.gaps.flatMap((g) => g.segIds), ...marks.shields.map((m) => m.hollowId)];
  check('…the painter draws no reach from it (no mouth, no arrow, no GAP or WALL beside it), and no amber BITE slot',
    !marks.bites.some((b) => b.hollowId === decoy.id) && !marks.gaps.some((g) => g.segIds.some((id) => {
      const index = state.memory.findIndex((seg) => seg.id === id);
      return Math.abs(index - state.memory.findIndex((seg) => seg.id === decoy.id)) === 1;
    })) && amberBite(state) === null, markIds.join(','));
  const cell = miniStripRows(state).flat().find((c) => c.segId === decoy.id);
  check('…a file on the amber mini-strip, its echo name the decoy\'s', cell?.kind === 'file' && echoName(decoy) === decoyDef.name);
  const ctx = ctxNow();
  check('…the RM lesson, the no-rm line and the seeds alert stay quiet', THREAT_RULES.every((rule) => !rule.activeWhen(ctx))
    && !s().alerts.list.some((alert) => alert.id === SEED_ALERT_ID));
  const telemetry = state.memory.find((seg) => seg.role === 'telemetry')!;
  const free = state.memory.filter((seg) => seg.type === 'free').sort((a, b) => b.size - a.size)[0]!;
  const preview = movePreview(state, telemetry, { regionSegIds: [free.id], col: 0 }, []);
  check('…the MOVE preview turns on no label for it (Telemetry leaves no WALL / GAP beside a decoy)', preview !== null && preview.source === null
    && !state.memory.some(isVisibleHollow));
  // Review B1: every tool answers a decoy as a healthy unit file of its kind (`tool`, 100%: decoyFileView) is answered, so the
  // strip's valid/invalid classes (fs-tools paintTargetClasses reads targetRefusal) and the hover words never tell them apart.
  const real = healthyUnitTool(state);
  const answers = (seg: Segment): string => (['move', 'copy', 'repair', 'swap', 'scan', 'delete'] as FsToolKind[])
    .map((kind) => `${kind}:${targetRefusal(seg, { state, activeKind: kind, pickedSource: null }) ?? 'ok'}`).join(' ');
  check(`…every tool answers it as a healthy unit file (${real.name}): MOVE and COPY take it, REPAIR says \`${TOOL_REFUSAL.healthy}\``,
    answers(decoy) === answers(real) && answers(decoy) === `move:ok copy:ok repair:${TOOL_REFUSAL.healthy} swap:${TOOL_REFUSAL.swapShipOnly} scan:ok delete:ok`,
    `decoy ${answers(decoy)} | real ${answers(real)}`);
  // ...and once picked as a MOVE or COPY source, every place on the strip answers as for a real file of its size.
  const sameSize = { ...structuredClone(real), size: decoy.size } as Segment;
  const placeDiffers = (['move', 'copy'] as FsToolKind[]).flatMap((kind) => state.memory
    .filter((seg) => seg.type === 'free')
    .filter((seg) => (kind === 'copy' || !computeRegionHas(state, decoy, seg))
      && targetRefusal(seg, { state, activeKind: kind, pickedSource: decoy }) !== targetRefusal(seg, { state, activeKind: kind, pickedSource: sameSize }))
    .map((seg) => `${kind}@${seg.id}`));
  check('…picked as a MOVE or COPY source, each free run answers as for a real file of its size', placeDiffers.length === 0, placeDiffers.join(','));
  const zone = rackOf(requireAddr(state.memory, free), layoutOf(state));
  const hazards = [{ rack: zone, kind: 'debris' as const }];
  check(`…the MOVE preview judges it as a file too (a hazard in rack ${zone} is named for it, as for ${real.name})`,
    movePreview(state, decoy, { regionSegIds: [free.id], col: 0 }, hazards)?.hazard?.rack === zone
    && movePreview(state, real, { regionSegIds: [free.id], col: 0 }, hazards)?.hazard?.rack === zone);
  const question = deleteQuestion(state, decoy);
  check(`…DELETE asks its decoy's own confirm: \`${question?.question}\``, question?.question === `DELETE ${decoyDef.name.toUpperCase()}?`
    && question.detail.startsWith(decoyDef.desc), question?.detail);
}

// Its bite is the tell: Telemetry's red crawl comes from the decoy's side, and the strip never names the culprit.
for (let i = 0; i < 2400 && !(s().memory.find((seg) => seg.role === 'telemetry') as { infected?: unknown } | undefined)?.infected; i++) h.step();
{
  const telemetry = s().memory.find((seg) => seg.role === 'telemetry') as Segment & { infected?: { side: string } };
  const ctx = ctxNow();
  const line = DISGUISE_RULES.find((rule) => rule.activeWhen(ctx));
  check(`the decoy bites Telemetry (infected from its right), and the strip says \`${line?.text(ctx)}\``,
    telemetry.infected?.side === 'right' && line !== undefined
    && [SENTRY_TEXT.somethingNextTo('Telemetry'), SENTRY_TEXT.somethingNextToTab('Telemetry')].includes(line.text(ctx)), JSON.stringify(telemetry.infected));
  check('…and no SEED NEXT TO alert, nor any mark from the decoy, while it eats', !s().alerts.list.some((alert) => alert.id === SEED_ALERT_ID)
    && !reachMarks(s()).bites.some((b) => b.hollowId === decoy.id));
}

// SCAN unmasks it: the normal scan op on a 2-block file (1.2 s), `NOT A FILE`, its words on their own line.
{
  h.events.length = 0;
  const refusal = actionScan(h.store, s().memory.find((seg) => seg.id === decoy.id)!);
  const took = runOps();
  const seg = s().memory.find((candidate) => candidate.id === decoy.id) as HollowSegment;
  const unmasked = h.events.filter((event) => event.name === 'seed-unmasked').map((event) => event.payload as { segId: string; by: string });
  check(`SCAN unmasks it in ${took.toFixed(2)} AI s (1.2 s): \`${SENTRY_TEXT.scanEcho(decoyDef.name)}\`, 'seed-unmasked' by scan`,
    refusal === null && Math.abs(took - 1.2) < 0.1 && seg.disguise?.seen === 'scan' && !isDisguised(seg)
    && unmasked.length === 1 && unmasked[0]!.by === 'scan' && s().log.entries.some((entry) => entry.text === SENTRY_TEXT.scanEcho(decoyDef.name)));
  check('…its words are said once (`> it says: "…"`), and from now on it is a seed to every reader',
    s().log.entries.some((entry) => entry.text === SENTRY_TEXT.seedSays('hungry. sorry.')) && seedsInMemory(s().memory).some((candidate) => candidate.id === decoy.id)
    && THREAT_RULES.some((rule) => rule.lesson === 'seed-first' && rule.activeWhen(ctxNow())));
}

// DELETE works on another decoy without a SCAN: its own confirm, rm on a seed (2.0 s), `IT WAS A SEED`.
{
  const second = plantDecoy('autopilot', DISGUISE_POOL[3]!, 'tell them we tried.');
  h.events.length = 0;
  let asked: string | null = null;
  const refusal = requestDelete(h.store, second, { ask: (request) => { asked = request.text.question; request.onYes(); } });
  const took = runOps();
  const unmasked = h.events.filter((event) => event.name === 'seed-unmasked').map((event) => event.payload as { by: string });
  const deleted = h.events.filter((event) => event.name === 'seed-deleted');
  const echo = SENTRY_TEXT.deleteEcho(DISGUISE_POOL[3]!.name, SEED_BLOCKS);
  check(`DELETE on a decoy without a SCAN: \`${asked}\`, rm in ${took.toFixed(2)} AI s (2.0), \`${echo}\``,
    refusal === null && asked === `DELETE ${DISGUISE_POOL[3]!.name.toUpperCase()}?` && Math.abs(took - 2.0) < 0.1
    && !s().memory.some((seg) => seg.id === second.id) && unmasked.length === 1 && unmasked[0]!.by === 'delete' && deleted.length === 1
    && s().log.entries.some((entry) => entry.text === echo), `${s().log.entries.slice(-2).map((e) => e.text).join(' | ')}`);
}

// MOVE and COPY take a decoy as a source (review B1): the op runs its own time on the seed, unmasks it as it completes, as a
// SCAN does (`NOT A FILE`), and moves and copies nothing.
for (const kind of ['move', 'copy'] as const) {
  const role: Segment['role'] = kind === 'move' ? 'engine-io' : 'navplot';
  const planted = plantDecoy(role, DISGUISE_POOL[kind === 'move' ? 1 : 2]!, `${kind} words`);
  const name = DISGUISE_POOL[kind === 'move' ? 1 : 2]!.name;
  if (!s().run.licences.includes(kind)) installTool(h.store, kind);
  const before = s().memory.map((seg) => `${seg.type}:${seg.size}`).join(',');
  const addr = requireAddr(s().memory, s().memory.find((seg) => seg.id === planted.id)!);
  const target = s().memory.filter((seg) => seg.type === 'free' && seg.reservedBy === undefined && seg.size >= planted.size
    && !computeRegionHas(s(), planted, seg)).sort((a, b) => b.size - a.size)[0]!;
  h.events.length = 0;
  const live = s().memory.find((seg) => seg.id === planted.id)!;
  const refusal = kind === 'move' ? actionMove(h.store, live, { regionSegIds: [target.id], col: 0 }) : actionCopy(h.store, live, { regionSegIds: [target.id], col: 0 });
  const took = runOps();
  const seg = s().memory.find((candidate) => candidate.id === planted.id) as HollowSegment | undefined;
  const unmasked = h.events.filter((event) => event.name === 'seed-unmasked').map((event) => event.payload as { by: string });
  const want = kind === 'move' ? moveSec(planted.size) : copySec(planted.size);
  const echo = SENTRY_TEXT.opEcho(kind, name);
  check(`${kind.toUpperCase()} of a decoy runs ${took.toFixed(2)} AI s (${want.toFixed(1)}), unmasks it \`${echo}\` (NOT A FILE, by scan)`,
    refusal === null && Math.abs(took - want) < 0.1 && seg !== undefined && seg.disguise?.seen === 'scan' && !isDisguised(seg)
    && unmasked.length === 1 && unmasked[0]!.by === 'scan' && s().log.entries.some((entry) => entry.text === echo),
    `${refusal ?? 'started'} · ${s().log.entries.slice(-2).map((e) => e.text).join(' | ')}`);
  check(`…and ${kind === 'move' ? 'moves' : 'copies'} nothing: the seed stays at its address, memory keeps its shape, no ${kind} counted`,
    seg !== undefined && requireAddr(s().memory, seg) === addr && s().memory.map((m) => `${m.type}:${m.size}`).join(',') === before
    && !h.events.some((event) => event.name === 'op-done' && (event.payload as { kind: string }).kind === kind));
}

// --- The boot: the ECC seeds line leaves a decoy out, and it lands with no thunk -----------------------------------------
{
  h.shipAlone(1, 3);
  lockOn(h);
  if (!h.untilPhase('report', 120)) throw new Error(`HALCYON never reached its report (${s().run.phase})`);
  continueAfterReport(h.store);
  h.transmit();
  // The tutorial run's KESTREL seed, dressed as a decoy before the boot plans its lines (its first tick).
  h.store.update((draft) => {
    const arrived = draft.run.arrival!.seeds[0]!;
    arrived.disguise = decoyDef.name;
    const seg = draft.memory.find((candidate) => candidate.id === arrived.segId) as HollowSegment;
    seg.disguise = { name: decoyDef.name, desc: decoyDef.desc, seen: null };
  });
  h.events.length = 0;
  h.untilPhase('flight', 60);
  const ecc = eccSeedsLine(['Telemetry']);
  check('the boot with only a decoy on the beam says no ECC seeds line, and no \'seed-landed-beam\' thunk',
    !s().log.entries.some((entry) => entry.text === ecc || entry.text.includes('FOREIGN BLOCK')) && !h.events.some((event) => event.name === 'seed-landed-beam')
    && isDisguised(s().memory.find((seg) => seg.id === s().run.arrival!.seeds[0]!.segId)!));
  check('…the classic beam into KESTREL is still the scripted plain seed (its stream untouched)', s().run.arrival!.seeds.length === 1
    && s().run.arrival!.seeds[0]!.targetName === 'Telemetry' && THREAT_TEXT.seedNextTo('Telemetry').length > 0);
}

finish();
