import type { Segment, HollowSegment } from '@/types/segment';
import type { BeamSeedPlan, BeamSeedSource } from '@/types/threat';
import type { Packet } from '@systems/carry';
import type { Rng } from '@systems/rng';
import { isHollow, isInfectable } from '@state/selectors';
import { newSegId } from '@systems/memory-ops';
import { HOLLOW_DESC } from '@data/hollow-text';
import { SEED_BLOCKS } from '@data/tuning';

// Beam seeds (docs/phase3/04-threats.md §3.4–§3.7; slice-2-plan §2.1), pure and DOM-free: what rides the beam into a
// ship besides the unit, where it lands, and what it reports home. Track THREAT owns this file and fills in the stubs;
// the foundation fixes the signatures.
//
// Slice 3: `source` becomes { kind: 'noise', noise: hop.noise } for every hop. Slice 4d: seedTargetsOf weighs skills by
// size, and a disguised seed is a flag on the segment. Slice 7: a `finalShipSeedMods` hook here (PURGE's wipe, the extra
// seed on a final ship).

// The packed files a beam seed may ride behind (04 §3.4): the unit's infectable files (they have integrity to eat),
// never the Core, REPAIR CHARGE, a FIREWALL or 046.log (none of them is infectable), and never Engine I/O or Nav Plotter
// (slice-2-plan risk 4: a seed eating them strands the ship or kills the drop solution). Untried tools are a ship's,
// not the packet's: the boot has not licensed anything yet. Weighting by size is rollBeamSeeds' (THREAT).
export function seedTargetsOf(files: readonly Segment[]): Segment[] {
  return files.filter((seg) => isInfectable(seg) && seg.type !== 'core' && seg.role !== 'engine-io' && seg.role !== 'navplot');
}

// The seeds the beam into a ship carries, each behind a target among the packet's files (04 §3.4: by the source's
// noise and BEAM_SEED_ODDS, or the scripted first-run seeds), each with its words (05 §3.5's pool, threat-text.ts).
// Uses `rng` only (childRng(seed, toShip, 'beam-seeds') at the caller), so a hop rolls the same seeds whatever route led
// to it. STUB (foundation): no seeds yet; Track THREAT rolls them.
export function rollBeamSeeds(packet: Readonly<Packet>, source: BeamSeedSource, firstRun: boolean, rng: Rng): BeamSeedPlan[] {
  void packet; void source; void firstRun; void rng;
  return [];
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

// TRACE's tally at a ship's end (04 §3.7): every beam-born hollow block still in memory adds 1 (a seed, or a block a
// beam-born block made by eating a file: "a seed that ate reports twice").
export function tallyBeamBorn(memory: readonly Segment[]): number {
  return memory.filter((seg) => isHollow(seg) && seg.beam === true).length;
}
