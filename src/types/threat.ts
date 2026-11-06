// Slices 4c–4e: the lead owns this file (slice-4cde-plan.md §7.2); tracks ask by message.
// The threat ladder's types (docs/phase3/04-threats.md §3.1–§3.10, slice-2-plan §2.2): which act a ship plays, whether
// HOLLOW boards on the beam into it, which of HOLLOW's stages it plays, and what the run remembers between ships.
// Types only: the numbers live in src/data/threats.ts and tuning.ts, the rule in src/systems/threat-plan.ts.
//
// HollowDef and its parts live here rather than in data/ships.ts (where phase 2 kept them, keyed by ship): since slice 2
// a HollowDef is keyed by stage (data/threats.ts HOLLOW_STAGES) and chosen by the ladder, and ships.ts, threats.ts and
// threat-plan.ts all name it, so the type sits below all three and no data module has to import another for a type.
// Owned like state/schema.ts: written by the slice 2 foundation; additions after it go through the lead (slice-2-plan §5.4).

import type { SegmentRole, SeedDisguise } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';

// --- HOLLOW on one ship (§4.2, §6.6; 04 §3.9) ------------------------------------------------------------------------
// All in AI seconds and integrity points per AI second.
// • wake: 'loop-closed-once' (the ARRIVAL stage: one scripted bite on the driver next to the root, the first time the
//   loop closes, then it goes dormant; with 'arrives' it keeps biting on spreadEverySec after the fight), 'never' (a calm
//   ship's CALM_DEF: nothing aboard to wake; an infection carried in still drains), or { afterAiSec, coastLeadSec }
//   (wakes this long into the flight, bites at once, then every spreadEverySec). With coastLeadSec it wakes sooner if the
//   coast begins first: that many AI seconds after the strip first says WAIT (WP7), so the fight is the coast's, and a
//   kid who SKIPs at once does not meet it mid-capture instead. With calmOnly (the seeds-only config, 04 §3.5) the clock
//   counts only AI seconds of calm flight (it stands still at TACTICAL, HollowState.calmAiSec), like phase 2's first seed.
// • spreadEverySec: the one global bite timer (NEXT BITE m:ss); null: it never spreads (ARRIVAL).
// • drainPerSec: what an infected file loses, × the larger of burnMult while the engine delivers thrust (P1) and
//   landMult while the landing is active: an in-band window open with a launchable pod (01-landing §5: that condition
//   is the definition; it gets desperate as its food leaves).
// • seed: HOLLOW's own seeds (WP9, §6.6): every everySec a 2-block seed is telegraphed, then lands; the first one
//   firstAfterSec after the wake (so the first lands on the coast, between two bites). 'walls' aims at the walls that
//   guard the colonists (systems/hollow.ts seedSpot); 'near-tools' (the HUNT stage) at your filesystem tools. Beam seeds
//   (04 §3.4) are not this: they arrive with the packet (systems/beam-seeds.ts).
// • deal: THE DEAL (WP10, §6.6, systems/hollow-deal.ts): once a run, HOLLOW offers to leave the others alone for the pod
//   whose driver is at its front. The HUNT stage's; folded into the FINALE when the run reaches it without one.
// • verbs: the FINALE's verbs (WP11, §6.6, systems/hollow-verbs.ts): every everySec of calm (the clock stands still while
//   the flight is at TACTICAL) HOLLOW picks MV or RM (`unlink` on screen), counts it down telegraphSec in your TERMINAL
//   (the ship's first one firstTelegraphSec), and does it unless an op touched its target meanwhile (BLOCKED); while the
//   root's DELETE runs, every duelEverySec instead.
// • story: what HOLLOW says on this ship (systems/hollow.ts, data/hollow-text.ts). 'notices-you': after the first fight
//   (`> ...047?`). 'arrives': a folded ARRIVAL + WALLS ship (04 §3.9): it notices you after the first fight, then names
//   itself on the same ship. 'names-itself': at the wake (`> hello 047…`, `> i was 046…`, CONTROL, and in landing
//   `> i ran out…`). 'wants-charge': the last line of its boot (`> keep 20 charge for me, 047. you'll see.`, WP10: MERGE's
//   price, foreshadowed). 'last-ship': the last line of the final ship's boot (`> last ship, 047. i'm so tired.`, WP11).
//   'none': nothing beyond its echoes.
export type HollowWake =
  | 'loop-closed-once'
  | 'never'
  | { afterAiSec: number; coastLeadSec: number | null; calmOnly?: true };
export type SeedTarget = 'walls' | 'near-tools';
export type HollowStoryKind = 'notices-you' | 'arrives' | 'names-itself' | 'wants-charge' | 'last-ship' | 'none';

export interface VerbDef {
  everySec: number;
  telegraphSec: number;
  firstTelegraphSec: number;
  duelEverySec: number;
}

export interface SeedDef {
  everySec: number;
  firstAfterSec: number;
  target: SeedTarget;
}

export interface HollowDef {
  wake: HollowWake;
  spreadEverySec: number | null;
  drainPerSec: number;
  burnMult: number;
  landMult: number;
  seed: SeedDef | null;
  verbs: VerbDef | null;
  deal: boolean;
  story: HollowStoryKind;
  // Only seeds bite (the seeds act: beam seeds before HOLLOW boards, SEEDS_ONLY_DEF). A file a seed eats becomes an inert
  // hollow block: it still counts for TRACE, but it never bites in turn, so a seed eats the one file the ECC line names
  // and the chain stops there (slice-2-plan risk 4: no seed ever walks on to Nav Plotter, Engine I/O or the Core).
  onlySeedsBite?: true;
}

// --- The ladder (04 §3.1, §3.8, §3.9) ---------------------------------------------------------------------------------

// What kind of ship this is for the MIND: no adversary; beam seeds only; HOLLOW aboard; the final ship's duel.
export type ThreatAct = 'calm' | 'seeds' | 'hollow' | 'finale';
// HOLLOW's stage on a ship (04 §3.9): its age picks one of the first four, the final ship always plays 'finale'.
export type HollowStage = 'arrival' | 'walls' | 'seeds' | 'hunt' | 'finale';
// A hop's link noise (02-map: the noise clouds its line crosses, 0–3): how many seeds ride the beam (BEAM_SEED_ODDS).
export type LinkNoise = 0 | 1 | 2 | 3;
// A scripted beam seed's target: the packed file with this role, or this filesystem tool.
export type SeedTargetPick = { role: SegmentRole } | { fsTool: FsToolKind };

// What the beam INTO a ship carries. Slice 3 replaces every source with { kind: 'noise', noise: hopNoise }: the fixed
// five ships write theirs in data/classic-five.ts CLASSIC_FACTS; the arm's come from the hop's noise (systems/map-facts.ts).
export type BeamSeedSource =
  | { kind: 'none' }
  // KESTREL: the RM lesson's seed. firstRun: the seeds the tutorial run always meets (risk 4: next to Telemetry, which
  // garbles but never strands); later: the noise every later run rolls with.
  | { kind: 'scripted'; firstRun: readonly SeedTargetPick[]; later: LinkNoise }
  | { kind: 'noise'; noise: LinkNoise };

// A classic ship's threat facts (data/classic-five.ts CLASSIC_FACTS; phase 2's ShipDef.threat).
export interface ShipThreatDef {
  beamSeeds: BeamSeedSource;
  oneHopFromFinal: boolean;     // the stand-in for 02-map M3 (VESPER: true)
}

// Everything planThreat reads (systems/threat-plan.ts). Flat and JSON-safe, so a test can run 04 §3.16's routes as
// plain sequences and slice 3 can feed it from the map without touching the rule. The ship's own facts (depth, final,
// M3, the beam's seeds) come from threat-plan.ts fixedShipFacts on the fixed five; slice 3 replaces only that function.
export interface ThreatInput {
  depth: number;              // the ship's depth on the route (the ship index + 1 on the fixed five)
  isFinal: boolean;           // a final ship (ShipDef.final)
  oneHopFromFinal: boolean;   // 02-map M3: a final ship is one hop from this destination
  beamSeeds: BeamSeedSource;  // what the beam into this ship carries (CLASSIC_FACTS on the classic world; the arm: the hop's noise)
  trace: number;              // TRACE before this ship (RunThreatState.trace)
  aboard: boolean;            // HOLLOW was aboard the ship before this one
  age: number;                // ships HOLLOW has been aboard BEFORE this one
  dealDone: boolean;          // THE DEAL happened this run (run.stats.deal !== null)
  // Beam-born blocks HOLLOW was fed since it boarded, CUMULATIVE across its ships (RunThreatState.fed): a root is its
  // stage's plus every block it was ever fed, capped (rootBlocksFor). Not "since the last ship": the PACKET's `+n` reads
  // the last ship's own share from RunThreatState.lastTally.left.
  fed: number;
}

// The ladder's verdict for one ship. Copied into the world when the ship is built: hollow into HollowState.cfg, the root
// into the bay's root slot. It echoes the ship's facts it was planned from (depth, final, M3, the beam's seeds), so
// TransitPlan.threat carries everything the beam does: transmitNext's seed roll and hollow.ts's keepCharge trigger read
// them here, never the map's facts again.
export interface ShipThreat {
  depth: number;
  isFinal: boolean;
  oneHopFromFinal: boolean;
  beamSeeds: BeamSeedSource;
  act: ThreatAct;
  boards: 'trace' | 'forced' | null;     // HOLLOW boards on the beam into this ship
  stage: HollowStage | null;             // null: HOLLOW is not aboard (calm, seeds-only)
  folded: readonly HollowStage[];        // ['walls'] on a folded arrival; ['hunt'] when THE DEAL folds into the finale
  hollow: HollowDef;                     // copied into HollowState.cfg
  rootBlocks: number | null;             // null: no root (calm, seeds-only)
}

// One beam seed as the beam into a ship carries it (systems/beam-seeds.ts rollBeamSeeds): the packed file it rides
// behind, that file's name for the ECC line, and its words (05 §3.5's pool) for when it is deleted.
export interface BeamSeedPlan {
  targetId: string;
  targetName: string;
  words: string;
  // Slice 4d (slice-4cde-plan §4.1): the decoy it lands as (beam-seeds.ts rollDisguises, on its own stream), null: plain.
  disguise: Pick<SeedDisguise, 'name' | 'desc'> | null;
}

// The record of one driver HOLLOW ate (slice 7's MERGE restores them; cheap to fill now).
export interface EatenDriver {
  shipId: string;
  pod: number;
  family: string;
}

// What a ship's end does with the beam-born blocks it leaves. state/threat-selectors.ts tallyPreview computes it from the
// live state: the LANDING REPORT shows the preview (its TRACE line), because endShip runs on the report's CONTINUE; Track
// THREAT's endShip applies the same tally and stores it as RunThreatState.lastTally (the next PACKET's FED chip, `+left`).
export interface ThreatTally {
  left: number;          // beam-born hollow blocks still in memory at the ship's end
  traceBefore: number;
  traceAfter: number;
  fed: boolean;          // HOLLOW was aboard: they fed its next root instead of TRACE
}

// run.threat: the ladder's memory across ships, DURING the current ship (its plan already applied: `age` counts this
// ship). Flat and JSON-safe (slice 3's save, 04 M6).
export interface RunThreatState {
  trace: number;
  aboard: boolean;
  age: number;                            // ships aboard, this one included
  boardedAtDepth: number | null;
  boardCause: 'trace' | 'forced' | null;
  // Beam-born blocks left at the ends of HOLLOW's ships since it boarded, CUMULATIVE (never reset when a root takes them):
  // each root is its stage's plus all of them, capped (rootBlocksFor, cap 14). The PACKET's `+n` is lastTally.left.
  fed: number;
  // The stages HOLLOW has played this run, in order. A stage folded in counts once it is played: WALLS with its ARRIVAL,
  // THE DEAL's HUNT on a final ship only once the deal is offered (hollow-deal.ts), not when the ladder folds it in.
  stagesPlayed: HollowStage[];
  told: { noticed: boolean; keepCharge: boolean };   // the naming stays run.hollowNamed
  // Filled by Track THREAT in slice 2 (hollow.ts, where a driver is consumed), so the save schema changes once.
  eatenDrivers: EatenDriver[];
  lastTally: ThreatTally | null;
  // The current ship's verdict, the facts the world reads during it (applyThreat sets it as the ship starts; null before
  // the first ship): hollow.ts keys `keepCharge` on aboard && oneHopFromFinal, the PACKET and INSPECT read isFinal.
  // Slice 3's map sets the same fields from the route; slice 5's resident hook can read them too.
  current: ShipThreatNow | null;
  // Slice 4d (slice-4cde-plan R11): the depth of the first ship that met a seed, written once by run.ts endShip and never
  // cleared, so SENTRY's 'after-seeds' opening reads a lasting record, not evidence that fades (TRACE, the last tally).
  seedsMetAtDepth: number | null;
}

// The facts of the current ship's verdict that the world reads during it (RunThreatState.current).
export type ShipThreatNow = Pick<ShipThreat, 'oneHopFromFinal' | 'isFinal' | 'stage' | 'boards'>;
