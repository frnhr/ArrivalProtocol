import type { Segment, HollowSegment } from '@/types/segment';
import type { BeamSeedPlan, BeamSeedSource, LinkNoise, SeedTargetPick } from '@/types/threat';
import type { Packet } from '@systems/carry';
import type { Rng } from '@systems/rng';
import { isInfectable } from '@state/selectors';
import { beamSeedsInMemory } from '@state/threat-selectors';
import { newSegId, freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { HOLLOW_DESC } from '@data/hollow-text';
import { SEED_WORDS_POOL } from '@data/threat-text';
import { SEED_BLOCKS, BEAM_SEED_ODDS, SEED_GAP_TO_TARGET_BLOCKS, WALL_MIN_BLOCKS } from '@data/tuning';

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
export function rollBeamSeeds(packet: Readonly<Packet>, source: BeamSeedSource, firstRun: boolean, rng: Rng): BeamSeedPlan[] {
  if (source.kind === 'none') return [];
  const pool = seedTargetsOf([...packet.rackE, ...packet.rackF]);
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
    plans.push({ targetId: target.id, targetName: target.name, words });
  }
  return plans;
}

// One beam seed as a segment (a phase-2 seed, beam-born): what layoutCarried places behind its target at the boot.
export function beamSeedSegment(plan: Readonly<BeamSeedPlan>, owner: string): HollowSegment {
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
  };
}

// ?debug's `__ap.seed(target)`: a beam seed laid out behind `targetId` in a live memory, as the unpack would have (the
// file, the GAP, the seed, the WALL). Its blocks come out of the first open free run after the target that has them, and
// the segments in between shift up by as many (the caller aborts every op first: no reservation may stand). Mutates
// `memory`; throws when no free run after the target is big enough.
export function plantBeamSeed(memory: Segment[], targetId: string, words: string, owner: string): HollowSegment {
  const at = memory.findIndex((seg) => seg.id === targetId);
  if (at < 0) throw new Error(`plantBeamSeed: ${targetId} is not in memory`);
  const blocks = SEED_GAP_TO_TARGET_BLOCKS + SEED_BLOCKS + WALL_MIN_BLOCKS;
  const freeAt = memory.findIndex((seg, index) => index > at && seg.type === 'free' && seg.reservedBy === undefined && seg.size >= blocks);
  if (freeAt < 0) throw new Error(`plantBeamSeed: no ${blocks} free blocks after ${memory[at]!.name}`);
  const run = memory[freeAt]!;
  if (run.size === blocks) memory.splice(freeAt, 1);
  else memory[freeAt] = freeSegment(run.size - blocks);
  const seed = beamSeedSegment({ targetId, targetName: memory[at]!.name, words }, owner);
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
