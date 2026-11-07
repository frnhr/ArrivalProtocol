// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): the FIREWALL card's usable.
// Others ask by message.
import type { RunStats } from '@state/schema';
import type { SkillId } from '@/types/skill';
import type { Rng } from '@systems/rng';
import {
  DRAFT_CARDS, DRAFT_BASE_WEIGHT, DRAFT_FIREWALL_BOOST, DRAFT_FIREWALL_LOST_MIN, DRAFT_REPAIR_V2_BOOST,
  DRAFT_REPAIR_V2_REPAIRS_MIN, DRAFT_THREAD_BOOST, DRAFT_THREAD_REFUSALS_MIN, DRAFT_CHARGE_BOOST, DRAFT_CHARGE_BELOW,
  DRAFT_FUEL_TRIM_BOOST, DRAFT_FUEL_TRIM_BELOW_PCT, DRAFT_MILD_BOOST, DRAFT_FIREWALL_BITTEN_MIN, DRAFT_REPAIR_V2_MILD_MIN,
  DRAFT_THREAD_MILD_MIN, DRAFT_CHARGE_MILD_BELOW, DRAFT_FUEL_TRIM_MILD_BELOW_PCT, FIREWALL_BLOCKS, FUEL_TRIM_BLOCKS,
  FIREWALL_MAX_OWNED, FUEL_TRIM_MAX_OWNED, REPAIR_V2_MAX_OWNED, THREAD_PLUS_MAX_OWNED, CHARGE_CARD_BLOCKS, MAX_LINE_CHARS,
  FUEL_TRIM_DV_BONUS_FRAC, BAND_DEGRADED_MIN, DRIVER_BLOCKS, REPAIR_CHARGE_PER_POINT_PER_BLOCK, INTEGRITY_MAX,
  CYCLES_CARD_CYCLES,
} from '@data/tuning';
import { PACKET_SKILL_TEXT } from '@data/training-text';

// The cards between ships (§6.9 `PICK ONE TO CARRY`, §9 WP8 items 1–2): what the unit can carry on to the
// next ship besides itself. The draft is pure: three distinct cards from this pool, drawn with the run's
// own seeded stream (childRng(seed, shipIndex, 'draft'), systems/draft.ts) and weighted by how the kid
// played (run.stats), so it reads as an answer to the trouble they had: a kid who lost a cluster to
// HOLLOW is offered FIREWALL.sys, one who repaired all the time REPAIR v2. Every card says what it does in
// one line and why it was offered (the lead's rule). Each boost has two steps: §6.9's for real trouble, and a
// milder one (DRAFT_MILD_BOOST) for a taste of it (a bite saved, two REPAIRs, half the FUEL burned), so even a
// clean tutorial's draft answers how that kid played. Only a card with no sign of either says
// `ARRIVAL CONTROL had a spare`. The kid-facing lines never say HOLLOW (WP6: a kid never reads that name):
// they name what is on the strip (DraftContext.hollowLabel: `???`, or the unit it said it was).
// A card the unit already owns as many of as it may (a non-stackable, or a stack that is full) is never
// offered. Owned is counted from what the unit really has (systems/draft.ts ownedUpgrades): a FIREWALL that
// was deleted, or a FUEL TRIM HOLLOW ate, can be drafted again.

export type UpgradeId = 'firewall' | 'repair-v2' | 'thread-plus' | 'charge' | 'fuel-trim' | 'cycles';

// What picking a card gives: a new file in the packet (FIREWALL.sys, FUEL TRIM), a version bump on files
// the unit carries (REPAIR v2 on every Repair copy), the Core's capacity (THREAD+), or REPAIR CHARGE on
// arrival (+12). File-backed effects can be infected and consumed, and go with their file. Slice 4: training cycles for the
// next desk (+2 CYCLES: a grant, systems/training.ts commitTraining).
export type UpgradeForm = 'file' | 'version' | 'core' | 'charge' | 'cycles';

// What the draft reads (systems/draft.ts builds it at TRANSMIT).
export interface DraftContext {
  stats: Readonly<RunStats>;
  chargeHeld: number;                                  // REPAIR CHARGE the unit holds at TRANSMIT
  lastShip: { name: string; fuelLeftPct: number } | null;  // the ship just left
  owned: Readonly<Record<UpgradeId, number>>;
  hasRepair: boolean;                                  // a Repair copy is packed (what REPAIR v2 upgrades)
  linkRoom: number;                                    // link blocks the unit's files leave free
  hollowLabel: string;                                 // what the strip calls HOLLOW now (say.ts hollowLabel)
  // Phase 3 slice 3b: deal only the salvage pool's cards (UpgradeDef.salvage), on the arm. Left out (the classic world,
  // phase 2's suites): every card, as before.
  salvageOnly?: boolean;
  // Slice 4: the unit has a skill tree (the arm; left out: none, the classic world) and the hop goes into a final ship
  // (left out: not), where no desk follows: the +2 CYCLES card is dealt only with a tree and never into a final ship.
  tree?: boolean;
  toFinal?: boolean;
  // Slice 4d (03 §3.10, plan §4.5): SENTRY works as v3 as the PACKET opens, so a FIREWALL.sys is compiled at every boot and
  // the salvage's FIREWALL card is not dealt. Left out (or false): dealt as before, so a deal without SENTRY v3 is unchanged.
  firewallCompiler?: boolean;
}

// A boost: the weight multiplier and the reason, in the kid's own terms.
export interface DraftBoost {
  mult: number;
  why: string;
}

export interface UpgradeDef {
  id: UpgradeId;
  title: string;      // the card's name, as the Skills window lists it too
  effect: string;     // what it does, in one line
  form: UpgradeForm;
  blocks: number;     // the file a 'file' card adds to the packet (link room), else 0
  maxOwned: number;   // Infinity: stackable without limit
  // In the arm's salvage pool (02 §3.10): REPAIR v2 moved to the repository (its patch, data/repository.ts), so the arm
  // never deals it; the classic world deals every card but the tree's `+2 CYCLES` (usable only with a tree).
  salvage: boolean;
  // Whether the card can do anything for this unit now (REPAIR v2 needs a Repair to upgrade); a card that
  // could not is never offered. Every card also needs link room for its file (draftEntries).
  usable?(ctx: DraftContext): boolean;
  boost(ctx: DraftContext): DraftBoost | null;
}

// A card's id on the PACKET (slice 5, review B1): one of the salvage pool's, or a departed resident's skill card ('skill':
// its skill is DraftCard.leftover.skill, granted through skill-tree.ts grantSkill at TRANSMIT ▸, draft.ts
// applyLeftoverPick). A deck holds at most one 'skill', and its ids are unique.
export type DraftCardId = UpgradeId | 'skill';

export interface DraftCard {
  id: DraftCardId;
  title: string;
  effect: string;
  why: string;        // why it was offered (a boost's reason, or BASE_WHY)
  boosted: boolean;
  // Slice 5 (04 §3.13, plan §2.8; the FOUNDATION's field, Track KIN deals it, Track FACE paints it): a card of a departed
  // resident's leftover deck, naming its leftover's segment, and the skill a skill card grants (null: a pool card). Absent
  // on the normal deal. Never saved (a save point holds no transit).
  leftover?: { segId: string; skill: SkillId | null };
}

// A card of the salvage pool (draftCards): always one of the pool's ids.
export interface PoolCard extends DraftCard {
  id: UpgradeId;
}

// The reason a card at its base weight was offered: honest, and in ARRIVAL CONTROL's world.
export const BASE_WHY = 'ARRIVAL CONTROL had a spare';

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : `${count} ${many}`);
const times = (count: number): string => (count === 1 ? 'once' : count === 2 ? 'twice' : `${count} times`);

// The strong boost when its trouble was real, else the mild one when there was a taste of it, else none.
function boostOf(strong: false | DraftBoost, mild: false | DraftBoost): DraftBoost | null {
  return strong || mild || null;
}

// What +12 REPAIR CHARGE buys, in the kid's terms: the integrity points it heals on one driver (§6.5's cost:
// REPAIR_CHARGE_PER_POINT_PER_BLOCK per point per block), as `from 25% to 100%`.
const CHARGE_CARD_HEAL_FROM_PCT = Math.max(0, INTEGRITY_MAX - Math.floor(CHARGE_CARD_BLOCKS / (DRIVER_BLOCKS * REPAIR_CHARGE_PER_POINT_PER_BLOCK) + 1e-9));

// The pool, in a fixed order (the draft walks it in this order, so a seed always deals the same cards).
export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'firewall',
    title: 'FIREWALL.sys',
    effect: "Nothing can eat it or bite past it — MOVE it into place",
    form: 'file',
    blocks: FIREWALL_BLOCKS,
    maxOwned: FIREWALL_MAX_OWNED,
    salvage: true,
    // SENTRY v3 compiles one at each boot instead (filtered before the draws, as '+2 CYCLES' is without a tree).
    usable: (ctx) => ctx.firewallCompiler !== true,
    boost: (ctx) => {
      const { driversLost: lost, driversBitten: bitten } = ctx.stats;
      return boostOf(
        lost >= DRAFT_FIREWALL_LOST_MIN && { mult: DRAFT_FIREWALL_BOOST, why: `you lost ${plural(lost, 'a driver', 'drivers')} to ${ctx.hollowLabel}` },
        bitten >= DRAFT_FIREWALL_BITTEN_MIN
          && { mult: DRAFT_MILD_BOOST, why: `${ctx.hollowLabel} bit ${bitten === 1 ? 'a driver' : `your drivers ${bitten} times`}` },
      );
    },
  },
  {
    id: 'repair-v2',
    title: 'REPAIR v2',
    effect: 'Your REPAIRs heal twice as fast',
    form: 'version',
    blocks: 0,
    maxOwned: REPAIR_V2_MAX_OWNED,
    salvage: false,
    // A unit that crashed before REPAIR was licensed has no Repair file to bump (its licence comes later).
    usable: (ctx) => ctx.hasRepair,
    boost: (ctx) => {
      const why = `you ran ${ctx.stats.repairs} REPAIRs`;
      return boostOf(
        ctx.stats.repairs >= DRAFT_REPAIR_V2_REPAIRS_MIN && { mult: DRAFT_REPAIR_V2_BOOST, why },
        ctx.stats.repairs >= DRAFT_REPAIR_V2_MILD_MIN && { mult: DRAFT_MILD_BOOST, why },
      );
    },
  },
  {
    id: 'thread-plus',
    title: 'THREAD+',
    effect: 'One more THREAD: three ops at once',
    form: 'core',
    blocks: 0,
    maxOwned: THREAD_PLUS_MAX_OWNED,
    salvage: true,
    boost: (ctx) => {
      const why = `your THREADS were all busy ${times(ctx.stats.capRefusals)}`;
      return boostOf(
        ctx.stats.capRefusals >= DRAFT_THREAD_REFUSALS_MIN && { mult: DRAFT_THREAD_BOOST, why },
        ctx.stats.capRefusals >= DRAFT_THREAD_MILD_MIN && { mult: DRAFT_MILD_BOOST, why },
      );
    },
  },
  {
    id: 'charge',
    title: `+${CHARGE_CARD_BLOCKS} REPAIR CHARGE`,
    effect: `Arrives with you: enough to heal a driver from ${CHARGE_CARD_HEAL_FROM_PCT}% to 100%`,
    form: 'charge',
    blocks: 0,
    maxOwned: Infinity,
    salvage: true,
    boost: (ctx) => {
      const why = `you are down to ${ctx.chargeHeld} REPAIR CHARGE`;
      return boostOf(
        ctx.chargeHeld < DRAFT_CHARGE_BELOW && { mult: DRAFT_CHARGE_BOOST, why },
        ctx.chargeHeld < DRAFT_CHARGE_MILD_BELOW && { mult: DRAFT_MILD_BOOST, why },
      );
    },
  },
  {
    id: 'fuel-trim',
    title: 'FUEL TRIM',
    effect: `+${Math.round(FUEL_TRIM_DV_BONUS_FRAC * 100)}% FUEL on every arrival while it is healthy`,
    form: 'file',
    blocks: FUEL_TRIM_BLOCKS,
    maxOwned: FUEL_TRIM_MAX_OWNED,
    salvage: true,
    boost: (ctx) => {
      const last = ctx.lastShip;
      if (last === null) return null;
      return boostOf(
        last.fuelLeftPct < DRAFT_FUEL_TRIM_BELOW_PCT
          && { mult: DRAFT_FUEL_TRIM_BOOST, why: `${last.name} ended with FUEL ${Math.floor(last.fuelLeftPct)}%` },
        last.fuelLeftPct < DRAFT_FUEL_TRIM_MILD_BELOW_PCT
          && { mult: DRAFT_MILD_BOOST, why: `${last.name} burned ${Math.round(100 - last.fuelLeftPct)}% of your FUEL` },
      );
    },
  },
  // Slice 4 (02 §3.10; plan §2.6): cycles for the next desk's TRAINING. Last in the pool, and filtered before the draws
  // where it can't be used (no tree, a hop into a final ship), so the classic world's deals stay byte-identical.
  {
    id: 'cycles',
    title: PACKET_SKILL_TEXT.cyclesCard(CYCLES_CARD_CYCLES),
    effect: PACKET_SKILL_TEXT.cyclesEffect(CYCLES_CARD_CYCLES),
    form: 'cycles',
    blocks: 0,
    maxOwned: Infinity,
    salvage: true,
    usable: (ctx) => ctx.tree === true && ctx.toFinal !== true,
    boost: () => null,
  },
];

// The files the file cards install (systems/draft.ts cardFiles): their names on the strip and INSPECT's line.
// `short` is the name a 2-block chip has room for (data/type-labels.ts stripName); `chip` is what a
// FIREWALL's chip says where a file shows its health (it has none: it blocks), `chipGlyph` on a small chip.
export const UPGRADE_FILE_TEXT = {
  firewall: {
    name: 'Firewall.sys',
    short: 'FW',
    chip: 'BLOCKS',
    chipGlyph: '■',
    desc: "Nothing can eat it or bite past it. MOVE it into a GAP next to the black blocks and that side is sealed. DELETE removes it.",
  },
  fuelTrim: {
    name: 'Fuel Trim',
    short: 'FT',
    desc: `Tunes the engine on arrival: +${Math.round(FUEL_TRIM_DV_BONUS_FRAC * 100)}% FUEL budget while it is healthy (${BAND_DEGRADED_MIN}% or more). It can be eaten.`,
  },
} as const;

export function getUpgrade(id: UpgradeId): UpgradeDef {
  const def = UPGRADES.find((upgrade) => upgrade.id === id);
  if (!def) throw new Error(`upgrades: no card '${id}'`);
  return def;
}

// Every card the unit may still be offered, with its weight and reason (the draft's input, for tests).
export interface DraftEntry {
  def: UpgradeDef;
  weight: number;
  why: string;
  boosted: boolean;
}

export function draftEntries(ctx: DraftContext): DraftEntry[] {
  const offerable = (def: UpgradeDef): boolean => ctx.owned[def.id] < def.maxOwned && def.blocks <= ctx.linkRoom
    && (def.usable?.(ctx) ?? true) && (def.salvage || ctx.salvageOnly !== true);
  return UPGRADES.filter(offerable).map((def) => {
    const boost = def.boost(ctx);
    return { def, weight: DRAFT_BASE_WEIGHT * (boost?.mult ?? 1), why: boost?.why ?? BASE_WHY, boosted: boost !== null };
  });
}

// The draft (§6.9): DRAFT_CARDS distinct cards, each drawn by weight from the cards not yet dealt. The
// charge card stacks without limit, so the pool never runs dry; by stacks alone, within a five-ship run
// (four drafts, at most three picks before the last) at least three cards are always eligible. Fewer is
// possible only when cards can't be used (REPAIR v2 with no Repair, a file with no link room) on top of
// owned ones, or in a hand-built state (?debug): the draft then deals every card it can, never a duplicate.
export function draftCards(ctx: DraftContext, rng: Rng): PoolCard[] {
  const left = draftEntries(ctx);
  const dealt: PoolCard[] = [];
  while (dealt.length < DRAFT_CARDS && left.length > 0) {
    const total = left.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = rng() * total;
    let index = left.findIndex((entry) => (roll -= entry.weight) < 0);
    if (index < 0) index = left.length - 1;  // rng() * total landed on total within float error
    const [entry] = left.splice(index, 1);
    if (!entry) throw new Error('draftCards: drew past the end of the pool');
    dealt.push({ id: entry.def.id, title: entry.def.title, effect: entry.def.effect, why: entry.why, boosted: entry.boosted });
  }
  return dealt;
}

// The pool is checked once at load: every id once, sane weights and stacks, every line short enough for a
// card and the strip. A bad entry fails the page instead of a card that reads cut off between ships.
function validateUpgrades(): void {
  const fail = (why: string): never => { throw new Error(`data/upgrades.ts: ${why}`); };
  const ids = new Set<UpgradeId>();
  for (const def of UPGRADES) {
    if (ids.has(def.id)) fail(`duplicate card '${def.id}'`);
    ids.add(def.id);
    if (!(def.maxOwned >= 1)) fail(`${def.id}: maxOwned must be at least 1`);
    if ((def.form === 'file') !== (def.blocks > 0)) fail(`${def.id}: a file card, and only a file card, has blocks`);
    for (const line of [def.title, def.effect]) if (line.length > MAX_LINE_CHARS) fail(`${def.id}: '${line}' is over ${MAX_LINE_CHARS} chars`);
  }
  if (!UPGRADES.some((def) => def.maxOwned === Infinity)) fail('one card must stack without limit, or a late draft could run dry');
  if (UPGRADES.length < DRAFT_CARDS) fail(`the pool has ${UPGRADES.length} cards for a draft of ${DRAFT_CARDS}`);
  if (!UPGRADES.some((def) => def.salvage && def.maxOwned === Infinity)) fail('the salvage pool needs a card that stacks without limit');
}
validateUpgrades();
