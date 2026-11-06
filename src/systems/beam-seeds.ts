// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): the disguise's odds (disguiseChanceAt),
// its roll (rollDisguises, on its own stream), the decoy copied onto the segment, and plantBeamSeed's option for
// `__ap.seed(target, { disguise })`.
import type { Segment, HollowSegment, SeedDisguise } from '@/types/segment';
import type { BeamSeedPlan, BeamSeedSource, LinkNoise, SeedTargetPick } from '@/types/threat';
import type { Packet } from '@systems/carry';
import type { DeliveryChip } from '@/types/repo';
import type { Rng } from '@systems/rng';
import { isInfectable } from '@state/selectors';
import { beamSeedsInMemory } from '@state/threat-selectors';
import { newSegId, freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { HOLLOW_DESC } from '@data/hollow-text';
import { SEED_WORDS_POOL, DISGUISE_POOL } from '@data/threat-text';
import { SEED_BLOCKS, BEAM_SEED_ODDS, SEED_GAP_TO_TARGET_BLOCKS, WALL_MIN_BLOCKS, DISGUISE_CHANCE_BY_DEPTH } from '@data/tuning';

// Beam seeds (docs/phase3/04-threats.md §3.4–§3.7; slice-2-plan §2.1), pure and DOM-free: what rides the beam into a
// ship besides the unit, where it lands, and what it reports home. systems/run.ts transmitNext rolls them
// (rollBeamSeeds, on childRng(seed, toShip, 'beam-seeds')), systems/carry.ts layoutCarried lays each one out behind its
// target, and endShip tallies what is left (state/threat-selectors.ts tallyPreview).
//
// Slice 3: `source` becomes { kind: 'noise', noise: hop.noise } for every hop. Slice 4d: seedTargetsOf weighs skills by
// size, and a disguised seed is a flag on the segment. Slice 7: a `finalShipSeedMods` hook here (PURGE's wipe, the extra
// seed on a final ship).

// The packed files a beam seed may ride behind (04 §3.4): the unit's infectable files (they have integrity to eat),
// never the Core, REPAIR CHARGE, a FIREWALL or 046.log (none of them is infectable), and never Engine I/O or Nav Plotter
// (slice-2-plan risk 4: a seed eating them strands the ship or kills the drop solution). Untried tools are a ship's,
// not the packet's: the boot has not licensed anything yet.
export function seedTargetsOf(files: readonly Segment[]): Segment[] {
  return files.filter((seg) => isInfectable(seg) && seg.type !== 'core' && seg.role !== 'engine-io' && seg.role !== 'navplot');
}

// How many seeds a beam of this noise carries (04 §3.4's table, BEAM_SEED_ODDS): one draw.
export function seedCountFor(noise: LinkNoise, rng: Rng): number {
  const odds = BEAM_SEED_ODDS[noise];
  const roll = rng();
  let acc = 0;
  for (let count = 0; count < odds.length; count++) {
    acc += odds[count]!;
    if (roll < acc) return count;
  }
  return odds.length - 1;
}

// One target among `pool`, weighted by size (04 §3.4: "a bigger skill gives a seed more to bite"), or null for an empty
// pool. Always one draw, so a beam's later draws never depend on how many targets were left.
function pickWeighted(pool: readonly Segment[], rng: Rng): Segment | null {
  const roll = rng() * pool.reduce((sum, seg) => sum + seg.size, 0);
  if (pool.length === 0) return null;
  let acc = 0;
  return pool.find((seg) => (acc += seg.size) > roll) ?? pool[pool.length - 1]!;
}

function matchesPick(seg: Readonly<Segment>, pick: Readonly<SeedTargetPick>): boolean {
  return 'role' in pick ? seg.role === pick.role : seg.type === 'fs-tool' && seg.fsTool === pick.fsTool;
}

// The seeds the beam into a ship carries, each behind a target among the packet's files (04 §3.4): by the source's noise
// and BEAM_SEED_ODDS, or, on the tutorial run, the scripted seeds (KESTREL's next to Telemetry, risk 4). Every seed
// rides behind a different file, so the ECC line's "NEXT TO" names one seed per file and each seed bites only the file
// it is named after; a beam that rolls more seeds than the packet has targets carries one per target. A scripted pick
// whose file is not in the packet (the kid left Telemetry behind on the TRANSMIT screen) rides behind a file rolled the
// usual way instead. Each seed's words come from 05 §3.5's pool. Uses `rng` only (childRng(seed, toShip, 'beam-seeds')
// at the caller), so a hop rolls the same seeds whatever route led to it.
// `excludeIds` (phase 3 slice 3b): the delivered files (Packet.deliveries) are never a beam seed's target. A delivery rolls
// its own seed (rollDeliverySeeds, behind the delivered file), and a first of kind none at all (its lesson), so a beam
// seed behind one would break both rules, and two seeds behind one file throw in layoutCarried.
export function rollBeamSeeds(
  packet: Readonly<Packet>, source: BeamSeedSource, firstRun: boolean, rng: Rng, excludeIds: readonly string[] = [],
): BeamSeedPlan[] {
  if (source.kind === 'none') return [];
  const pool = seedTargetsOf([...packet.rackE, ...packet.rackF]).filter((seg) => !excludeIds.includes(seg.id));
  const scripted = source.kind === 'scripted' && firstRun ? source.firstRun : null;
  const count = scripted !== null ? scripted.length : seedCountFor(source.kind === 'scripted' ? source.later : source.noise, rng);
  const plans: BeamSeedPlan[] = [];
  for (let index = 0; index < count; index++) {
    const pick = scripted?.[index];
    const named = pick === undefined ? undefined : pool.find((seg) => matchesPick(seg, pick));
    const target = named ?? pickWeighted(pool, rng);
    const words = SEED_WORDS_POOL[Math.floor(rng() * SEED_WORDS_POOL.length)]!;
    if (target === null) break;
    pool.splice(pool.indexOf(target), 1);
    plans.push({ targetId: target.id, targetName: target.name, words, disguise: null });
  }
  return plans;
}

// The seeds riding the deliveries on a hop (04 §3.4; slice-3b-plan §1.1 item 9, §2.3 step 4.3): per chip not sent on, in
// chip order, one chance draw against its seedChance (0 on a tool kind's first delivery, into a calm ship and on the patch;
// else DELIVERY_SEED_CHANCE by the hop's noise) and one words draw, each seed behind the delivered file it rode with (at
// most one per file). `packet` is the packet planPacket built (the delivered files' real ids); `rng` is the hop's own
// 'delivery-seeds' stream, so the beam's own seeds never shift. Both draws are taken for every chip packed, whatever its
// chance, so one chip's verdict never shifts the next one's numbers.
export function rollDeliverySeeds(chips: readonly DeliveryChip[], packet: Readonly<Packet>, rng: Rng): BeamSeedPlan[] {
  const files = [...packet.rackE, ...packet.rackF];
  const plans: BeamSeedPlan[] = [];
  for (const chip of chips) {
    if (chip.sendOn) continue;
    const packed = packet.deliveries.find((group) => group.key === chip.key);
    if (packed === undefined) throw new Error(`rollDeliverySeeds: chip ${chip.key} (${chip.file}) is not in the packet`);
    const roll = rng();
    const words = SEED_WORDS_POOL[Math.floor(rng() * SEED_WORDS_POOL.length)]!;
    if (!(roll < chip.seedChance)) continue;
    const target = files.find((seg) => seg.id === packed.segIds[0]);
    if (target === undefined || !isInfectable(target)) throw new Error(`rollDeliverySeeds: ${chip.file}'s file is not an infectable packed file`);
    plans.push({ targetId: target.id, targetName: target.name, words, disguise: null });
  }
  return plans;
}

// --- Slice 4d: disguised seeds (04 §3.6; slice-4cde-plan §4.1) ---------------------------------------------------------

// DISGUISE_CHANCE_BY_DEPTH's rows rise by depth, each a chance (checked at load, foundation review m10: disguiseChanceAt
// reads the last row that applies, so a re-ordered table would give wrong odds silently).
export function validateDisguiseOdds(rows: readonly Readonly<{ fromDepth: number; chance: number }>[] = DISGUISE_CHANCE_BY_DEPTH): void {
  rows.forEach((row, i) => {
    if (!(Number.isInteger(row.fromDepth) && row.fromDepth >= 1)) throw new Error(`DISGUISE_CHANCE_BY_DEPTH[${i}]: fromDepth ${row.fromDepth}`);
    if (i > 0 && !(row.fromDepth > rows[i - 1]!.fromDepth)) throw new Error(`DISGUISE_CHANCE_BY_DEPTH[${i}]: fromDepth must rise`);
    if (!(row.chance >= 0 && row.chance <= 1)) throw new Error(`DISGUISE_CHANCE_BY_DEPTH[${i}]: chance ${row.chance} is not in [0, 1]`);
  });
}
validateDisguiseOdds();

// The chance a beam seed lands disguised at `depth` (DISGUISE_CHANCE_BY_DEPTH: the last row whose fromDepth is at most the
// depth; 0 before the first). `__ap.disguiseOdds(depth)` reads it. BUILT.
export function disguiseChanceAt(depth: number): number {
  if (!(Number.isInteger(depth) && depth >= 1)) throw new Error(`disguiseChanceAt: depth ${depth}`);
  let chance = 0;
  for (const row of DISGUISE_CHANCE_BY_DEPTH) if (row.fromDepth <= depth) chance = row.chance;
  return chance;
}

// The beam's noise seeds with their disguises (04 §3.6; plan §4.1): per seed in plan order, one chance draw against
// disguiseChanceAt(depth) and one draw from DISGUISE_POOL, both always taken, so a seed's verdict never shifts the next
// seed's numbers. The caller passes the beam's own 'disguise' stream (hopRng(run, from, to, 'disguise')), so the beam's
// seeds, targets and words stay byte-identical with or without the roll. Only the beam's noise seeds come here, never a
// delivery's seed (its chip already names its risk) or the tutorial's scripted one (R9). Two seeds on one beam never wear
// the same decoy: a name already worn moves on to the pool's next one (no extra draw). A seed that came disguised already
// keeps its decoy. Pure: new plans, `plans` untouched.
export function rollDisguises(plans: readonly Readonly<BeamSeedPlan>[], depth: number, rng: Rng): BeamSeedPlan[] {
  const chance = disguiseChanceAt(depth);
  const worn = new Set(plans.flatMap((plan) => (plan.disguise === null ? [] : [plan.disguise.name])));
  return plans.map((plan) => {
    const roll = rng();
    let pick = Math.floor(rng() * DISGUISE_POOL.length);
    if (plan.disguise !== null) return { ...plan, disguise: { ...plan.disguise } };
    if (!(roll < chance)) return { ...plan, disguise: null };
    for (let tries = 0; tries < DISGUISE_POOL.length && worn.has(DISGUISE_POOL[pick]!.name); tries++) pick = (pick + 1) % DISGUISE_POOL.length;
    const decoy = DISGUISE_POOL[pick]!;
    worn.add(decoy.name);
    return { ...plan, disguise: { name: decoy.name, desc: decoy.desc } };
  });
}

// One beam seed as a segment (a phase-2 seed, beam-born): what layoutCarried places behind its target at the boot. A
// disguised plan's decoy rides on the segment, not yet seen (slice 4d).
export function beamSeedSegment(plan: Readonly<BeamSeedPlan>, owner: string): HollowSegment {
  const disguise: SeedDisguise | null = plan.disguise === null ? null : { ...plan.disguise, seen: null };
  return {
    id: newSegId('bseed'),
    name: owner,
    type: 'hollow',
    size: SEED_BLOCKS,
    root: false,
    locked: false,
    owner,
    seed: true,
    beam: true,
    words: plan.words,
    desc: HOLLOW_DESC.seed,
    ...(disguise === null ? {} : { disguise }),
  };
}

// ?debug's `__ap.seed(target)`: a beam seed laid out behind `targetId` in a live memory, as the unpack would have (the
// file, the GAP, the seed, the WALL). Its blocks come out of the first open free run after the target that has them, and
// the segments in between shift up by as many (the caller aborts every op first: no reservation may stand). Mutates
// `memory`; throws when no free run after the target is big enough.
// Slice 4d: `disguise` lands it as that decoy (`__ap.seed(target, { disguise: 'cache.tmp' })`), null plain.
export function plantBeamSeed(
  memory: Segment[], targetId: string, words: string, owner: string, disguise: Readonly<Pick<SeedDisguise, 'name' | 'desc'>> | null = null,
): HollowSegment {
  const at = memory.findIndex((seg) => seg.id === targetId);
  if (at < 0) throw new Error(`plantBeamSeed: ${targetId} is not in memory`);
  const blocks = SEED_GAP_TO_TARGET_BLOCKS + SEED_BLOCKS + WALL_MIN_BLOCKS;
  const freeAt = memory.findIndex((seg, index) => index > at && seg.type === 'free' && seg.reservedBy === undefined && seg.size >= blocks);
  if (freeAt < 0) throw new Error(`plantBeamSeed: no ${blocks} free blocks after ${memory[at]!.name}`);
  const run = memory[freeAt]!;
  if (run.size === blocks) memory.splice(freeAt, 1);
  else memory[freeAt] = freeSegment(run.size - blocks);
  const seed = beamSeedSegment({ targetId, targetName: memory[at]!.name, words, disguise: disguise === null ? null : { ...disguise } }, owner);
  memory.splice(at + 1, 0, freeSegment(SEED_GAP_TO_TARGET_BLOCKS), seed, freeSegment(WALL_MIN_BLOCKS));
  mergeAdjacentFree(memory);
  return seed;
}

// The file a beam seed was laid out behind (the nearest occupied segment on its left, across its GAP), or null when the
// seed is gone or nothing stands there: what the boot's 'seed-landed-beam' names as its target (systems/boot.ts).
export function beamSeedTarget(memory: readonly Segment[], segId: string): Segment | null {
  const index = memory.findIndex((seg) => seg.id === segId);
  for (let cursor = index - 1; index >= 0 && cursor >= 0; cursor--) {
    const seg = memory[cursor]!;
    if (seg.type !== 'free') return seg;
  }
  return null;
}

// TRACE's tally at a ship's end (04 §3.7): every beam-born hollow block still in memory adds 1 (a seed, or a block a
// beam-born block made by eating a file: "a seed that ate reports twice").
export function tallyBeamBorn(memory: readonly Segment[]): number {
  return beamSeedsInMemory(memory).length;
}
