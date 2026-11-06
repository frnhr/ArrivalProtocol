// The skill tree's words (phase 3 slice 4; docs/phase3/03-skills.md §4, §7; slice-4-plan §5.1 item 8), one section per
// track so the three can write in parallel without touching each other's lines. AUTOBURN's own flight lines stay in
// data/skill-text.ts (Track FLIGHT's). Every strip and boot line is ≤ MAX_LINE_CHARS (70) with worst-case numbers
// (tests/unit/support/words). The FOUNDATION seeded each section with the spec's own wording; the owners reword freely.
import type { SkillId, DemoKind } from '@/types/skill';

import { MAX_LINE_CHARS } from '@data/tuning';

// =======================================================================================================================
// TRAINING_TEXT · Track UI: the TRAINING tab, the desk's first-pick step, the LANDING REPORT's cycles line, RUN END and
// the RUN TALLY.
// =======================================================================================================================

const cycles = (n: number): string => `${n} CYCLE${n === 1 ? '' : 'S'}`;
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 'S'}`;

// A demo kind's noun and its measure (03 §3.3, §6; review m5; slice-4cde-plan R21): AUTOBURN learns from the kid's
// captures and reads ACCURACY, AUTODROP (4c) from drops (a ship 1 has one landing and three drops, so `3 landings`
// misread) and reads AIM (03 writes `AIM 91%`).
export const DEMO_WORDS: Readonly<Record<DemoKind, { one: string; many: string; measure: string }>> = {
  captures: { one: 'capture', many: 'captures', measure: 'ACCURACY' },
  drops: { one: 'drop', many: 'drops', measure: 'AIM' },
};
const demosOf = (n: number, kind: DemoKind): string => `${n} ${n === 1 ? DEMO_WORDS[kind].one : DEMO_WORDS[kind].many}`;
const fromDemos = (n: number, kind: DemoKind): string => (n === 0 ? `no ${DEMO_WORDS[kind].many} yet: UNTRAINED` : `from your ${demosOf(n, kind)}`);

// A count of one demo kind (the head's `YOUR DEMOS · 1 CAPTURE`, the bar's `from your 1 capture`).
export interface DemoCount {
  count: number;
  kind: DemoKind;
}

// One skill's words on the tab: the cell's head, the column's branch, visit 1's card (its v1 only) and NEXT SHIP per version
// (03 §4's table, "the 12-year-old bar"). The branches 4c, 4d and slice 6 build carry placeholders.
interface SkillWords {
  name: string;
  branch: string;
  pitch: string;
  next: readonly [string, string, string];
}

export const TRAINING_TEXT = {
  tab: 'TRAINING [T]',
  // The tab's badge while cycles are unspent (desk.ts deskTabBadges.training).
  badge: (n: number): string => cycles(n),
  // The window's head (03 §4): `TRAINING · UNIT-047`, the bank in VT323 on the right, the demos on the left.
  title: (unit: string): string => `TRAINING · ${unit}`,
  bank: (n: number): string => cycles(n),
  demos: (counts: readonly DemoCount[]): string =>
    `YOUR DEMOS · ${counts.length === 0 ? 'NONE YET' : counts.map((demo) => demosOf(demo.count, demo.kind).toUpperCase()).join(' · ')}`,
  // The SET COURSE bar on the run's first desk until the required pick (skill-tree.ts deskBlocker).
  chooseFirst: 'CHOOSE YOUR FIRST SKILL',
  // The desk's guidance strip: the step's name, what it says until the pick is made, and after.
  step: 'A SKILL',
  stepText: 'CHOOSE YOUR FIRST SKILL — [1], then [ENTER]',
  stepDone: (skill: string, version: number): string => `${skill} v${version} TRAINED · UNDO TILL TRANSMIT ▸`,
  // ARRIVAL CONTROL on the first visit (03 §7).
  controlTag: 'ARRIVAL CONTROL',
  controlFirstVisit: 'Training outside approved hours is discouraged. :)',
  // ...and at a desk whose purchases train a v3 (03 §7; slice-4cde-plan §5.4), for any skill.
  controlV3: 'Our repository has everything you need. :)',
  // The first-pick floor (03 §3.1): on the report of a run's first ship, and in the window's head at the first desk.
  onTheHouse: (n: number): string => `+${cycles(n)} · FIRST SKILL ON THE HOUSE :)`,
  saved: (n: number): string => `${cycles(n)} · SAVED FOR NEXT TIME`,
  moreLater: 'MORE SKILLS OPEN AS YOU GO',
  opensLater: 'OPENS LATER',
  lost: (restore: number): string => `LOST · RESTORE ${restore}`,
  // Visit 1's cards (03 §2): CHOOSE YOUR FIRST SKILL over one card per open root, with its key.
  cardCost: (price: number, blocks: number): string => `${cycles(price)} · ${plural(blocks, 'BLOCK')}`,
  cardKey: (key: string): string => `[${key}]`,
  stamped: 'TRAINED',
  // The TRAIN button and its bar (03 §4 juice: it fills over 1.5 s): `TRAINING AUTOBURN v1 · from your 1 capture`.
  // The key goes on only while the cell is armed (picked by the kid: desk.ts deskEnter); unarmed, TRAIN is a click.
  train: (cost: number): string => `TRAIN ▸ ${cycles(cost)}`,
  enterKey: (label: string): string => `${label} [ENTER]`,
  // `demos` null: a skill with no demos (SURVEY, SENTRY): `TRAINING SENTRY v1`.
  training: (skill: string, version: number, demos: DemoCount | null): string =>
    `TRAINING ${skill} v${version}${demos === null ? '' : ` · ${fromDemos(demos.count, demos.kind)}`}`,
  trainingLock: (tac: number): string => `TRAINING LOCK ${tac}`,
  restore: (version: number, cost: number): string => `RESTORE v${version} ▸ ${cycles(cost)}`,
  restoring: (skill: string, version: number): string => `RESTORING ${skill} v${version}`,
  // A cell: `AUTOBURN v2` / `LOCK 270`, and its price and size (`5 · 8`, a lock adds one block: `1 · +1`).
  cellName: (skill: string, version: number): string => `${skill} v${version}`,
  lockName: (tac: number): string => `LOCK ${tac}`,
  lockMode: 'LOCK RANGE',
  cellCost: (price: number, blocks: number): string => `${price} · ${blocks}`,
  lockCost: (price: number): string => `${price} · +1`,
  costLegend: 'CYCLES · BLOCKS',
  detailCost: (price: number, blocks: number): string => `${cycles(price)} · FILE ${plural(blocks, 'BLOCK')}`,
  detailLockCost: (price: number, blocks: number): string => `${cycles(price)} · +1 BLOCK (FILE ${blocks})`,
  // Why a cell can't be bought now (skill-tree.ts TrainRefusal), on the cell and in the detail panel.
  status: {
    owned: 'TRAINED',
    pending: 'TRAINED HERE',
    pendingLong: 'TRAINED HERE · UNDO IT TILL TRANSMIT ▸',
    needsLower: (what: string): string => `NEEDS ${what} FIRST`,
    unaffordable: (short: number): string => `NEEDS ${cycles(short)} MORE`,
    notDesk: 'TRAIN AT A DESK',
  },
  // NEXT SHIP for LOCK RANGE 270 and 810 (03 §4: the bracket triples, then reaches back to the start of the coast).
  nextLock: [
    'NEXT SHIP: [B] WORKS 3× EARLIER · THE LOCK BRACKET TRIPLES',
    'NEXT SHIP: [B] WORKS FROM THE START OF THE COAST',
  ] as const,
  skills: {
    autoburn: {
      name: 'AUTOBURN', branch: 'FLIGHT',
      pitch: 'It brakes into orbit for you. Press [B] near ▼, even from the MIND.',
      next: [
        "NEXT SHIP: [AUTO · B] LIGHTS UP · IT BRAKES WHILE YOU'RE IN THE MIND",
        'NEXT SHIP: ONE PRESS AND THE LOOP SETTLES GREEN; AGAIN: ROUND',
        'NEXT SHIP: IT FLIES THE LANDING ORBIT, WHERE EVERY LZ FITS',
      ],
    },
    autodrop: {
      name: 'AUTODROP', branch: 'LANDING',
      pitch: 'Hold [L] in a window: every pod waits for the dead centre.',
      next: [
        'NEXT SHIP: HOLD [L] AND EACH POD LEAVES DEAD CENTRE',
        'NEXT SHIP: SET THE SPLIT, PRESS ONCE, THE PASS FLIES ITSELF',
        'NEXT SHIP: THE PLAN TABLE · ONE PRESS DROPS THE WHOLE SHIP',
      ],
    },
    survey: {
      name: 'SURVEY', branch: 'SURVEY',
      pitch: 'Sites pop up under the swath, with their ROOM and WIDTH.',
      next: [
        'NEXT SHIP: CANDIDATE SITES POP UP UNDER THE SWATH',
        'NEXT SHIP: GROUND SHOWN, ★ RATINGS · SWAP A BAD GUESS',
        'NEXT SHIP: TWICE THE SWATH, AND IT HOLDS NO THREAD',
      ],
    },
    sentry: {
      name: 'SENTRY', branch: 'DEFENCE',
      pitch: 'It sees the seeds that hide as files, at the boot.',
      next: [
        'NEXT SHIP: THE BOOT NAMES EVERY DISGUISED SEED',
        "NEXT SHIP: rm ON HOLLOW TWICE AS FAST, AIMED AT A SEED'S OUTLINE",
        'NEXT SHIP: A NEW FIREWALL.sys AT EVERY BOOT',
      ],
    },
  } satisfies Record<SkillId, SkillWords>,
  // UNDO beside each purchase of this desk (03 §3.3: until TRANSMIT ▸).
  pendingTitle: 'TRAINED AT THIS DESK',
  pendingRow: (what: string, cost: number): string => `${what} · ${cycles(cost)}`,
  pendingRestore: (what: string, cost: number): string => `RESTORED ${what} · ${cycles(cost)}`,
  undo: 'UNDO',
  // The AHEAD row (03 §4): the ship selected on the STAR CHART, its memory class and noise written as its card writes them.
  ahead: (ship: string, ark: boolean, pods: number, memory: number, cls: string, noise: string): string =>
    `NEXT: ${ship}${ark ? ' · ARK' : ''} · ${plural(pods, 'POD')} · MEMORY ${memory} ${cls} · NOISE ${noise}`,
  aheadNone: 'NEXT: PICK A SHIP ON THE CHART TO SEE WHAT IT ASKS',
  // The packet preview (03 §4), by the limit that binds: `FILES 72 + SKILLS 17 · LINK 86 · 3 BLOCKS OVER`.
  preview: {
    head: (files: number, skills: number): string => `FILES ${files} + SKILLS ${skills}`,
    link: (link: number): string => `LINK ${link}`,
    room: (room: number, tight: boolean): string => `ROOM ${room}${tight ? ' · TIGHT' : ''}`,
    over: (blocks: number): string => `${plural(blocks, 'BLOCK')} OVER`,
    roomFor: (charge: number): string => `ROOM FOR ${charge} CHARGE`,
    noCharge: 'NO CHARGE ARRIVES',
    // When it does not fit: the cheapest way out, named before the PACKET (03 §4).
    hintPack: (skill: string, version: number, saves: number): string => `ON THE PACKET: PACK ${skill} AS v${version} · −${saves}`,
    hintUndo: 'UNDO A SKILL, OR LEAVE FILES BEHIND ON THE PACKET',
    hintLeave: 'LEAVE FILES BEHIND ON THE PACKET',
  },
  // The flavour line from the archive (03 §3.11): `LAST UNIT TRAINED: AUTODROP v3 · SENTRY v2`.
  lastUnit: (skills: readonly string[]): string => `LAST UNIT TRAINED: ${skills.join(' · ')}`,
  report: {
    // The LANDING REPORT's line (plan §1.1 4a item 1), rolled up.
    cycles: (total: number, landedPct: number, landed: number): string =>
      `TRAINING CYCLES +${total} · ARRIVED +1 · LANDED ${landedPct}% +${landed}`,
    perfect: (total: number): string => `PERFECT LANDING · +${total}`,
    // The final ship (decision 18 kept: shown, does nothing).
    noDesk: (total: number): string => `+${total} TRAINING CYCLES · NO DESK AHEAD`,
  },
  runEnd: {
    unspent: (n: number): string => `UNSPENT ${n}`,
    tally: (trained: number, total: number, unspent: number): string => `TRAINED ${trained} of ${total} · UNSPENT ${unspent}`,
  },
} as const;

// The TRAINING cells' looping mini-demos (03 §4: "loops a 4-second mini-demo of the selected cell"), by data (review
// architecture note: the view switched on 'autoburn-1' strings, so a new skill fell to the plain loop): a drawing per
// version and one for LOCK RANGE (null for a skill without it). The drawings are TrainingWindow.ts demoSvg's; a new skill
// names existing ones or adds its own there. Slices 4c–4e (plan §6): AUTODROP's and SENTRY's six kinds are named here and
// drawn as 'plain' for now; the review-fix pass draws all six in one hand. Slice 6 refines SURVEY's.
export type DemoArt = 'capture' | 'green' | 'low-orbit' | 'lock' | 'plain'
  | 'centre' | 'pass' | 'plan'              // AUTODROP v1–v3 (4c)
  | 'sight' | 'quick-rm' | 'firewall';      // SENTRY v1–v3 (4d)

// One line per skill, so each track edits only its own.
export const TRAINING_DEMO_ART: Readonly<Record<SkillId, { versions: readonly [DemoArt, DemoArt, DemoArt]; lock: DemoArt | null }>> = {
  autoburn: { versions: ['capture', 'green', 'low-orbit'], lock: 'lock' },
  autodrop: { versions: ['centre', 'pass', 'plan'], lock: null },
  survey: { versions: ['plain', 'plain', 'plain'], lock: null },
  sentry: { versions: ['sight', 'quick-rm', 'firewall'], lock: null },
};

// =======================================================================================================================
// PACKET_SKILL_TEXT · Track TREE: the PACKET's skill chips (systems/transmit.ts), PACK AS and the +2 CYCLES card.
// =======================================================================================================================

export const PACKET_SKILL_TEXT = {
  // A file trained at this desk is locked on the PACKET (plan §2.3's 'trained' DropLock).
  trainedHere: 'TRAINED HERE · ◀ CHART TO UNDO',
  // What leaving each skill behind costs (03 §3.4: `AUTODROP.skl v3 (10) → drop pods by hand · RESTORE 8`).
  without: {
    autoburn: 'brake by hand',
    autodrop: 'drop pods by hand',
    survey: 'guess the sites',
    sentry: 'find the seeds by SCAN',
  },
  chip: (file: string, version: number, blocks: number, without: string, restore: number): string =>
    `${file} v${version} (${blocks}) ${PACKET_SKILL_TEXT.loss(without, restore)}`,
  // The loss alone (the chip's own line under its name: `→ brake by hand · RESTORE 5`).
  loss: (without: string, restore: number): string => `→ ${without} · RESTORE ${restore}`,
  packAs: (version: number, blocks: number, restore: number): string => `PACK AS v${version} (${blocks}) · RESTORE ${restore}`,
  // DELETE's inline confirm on a skill file (systems/tool-targets.ts deleteQuestion): it is lost until a desk's RESTORE.
  deleteEffect: (skill: string, restore: number): string =>
    restore > 0 ? `No ${skill} until a desk's RESTORE (${restore} CYCLES).` : `No ${skill}.`,
  // The +n CYCLES salvage card (data/upgrades.ts): its title and its line.
  cyclesCard: (cycles: number): string => `+${cycles} CYCLES`,
  cyclesEffect: (cycles: number): string => `${cycles} more TRAINING CYCLES to spend at the next desk`,
} as const;

// =======================================================================================================================
// BOOT_SKILL_TEXT · Track TREE: the boot's skill lines (systems/skill-files.ts skillBootLines) and the ONLINE stamp.
// =======================================================================================================================

export const BOOT_SKILL_TEXT = {
  // `> SKILL TRAINED: AUTOBURN.skl v1 · from your 1 capture · ACCURACY 92%` (plan §3 step 2), the noun and the measure by
  // the skill's demo kind (AUTODROP: `from your 3 drops · AIM 91%`). Past MAX_LINE_CHARS `your` goes (`from 12 captures`).
  trained: (file: string, version: number, demos: number, kind: DemoKind, accuracy: number): string => {
    const measure = DEMO_WORDS[kind].measure;
    const line = `> SKILL TRAINED: ${file} v${version} · from your ${demosOf(demos, kind)} · ${measure} ${accuracy}%`;
    return line.length <= MAX_LINE_CHARS ? line : `> SKILL TRAINED: ${file} v${version} · from ${demosOf(demos, kind)} · ${measure} ${accuracy}%`;
  },
  // No demos yet (03 §3.3's loud UNTRAINED state).
  untrained: (file: string, version: number, accuracy: number): string => `> SKILL TRAINED: ${file} v${version} · UNTRAINED ${accuracy}%`,
  // A skill with no demos (SURVEY, SENTRY).
  plain: (file: string, version: number): string => `> SKILL TRAINED: ${file} v${version}`,
  retrained: (file: string, version: number, demos: number, kind: DemoKind, accuracy: number): string =>
    `> SKILL RETRAINED: ${file} v${version} · ${demosOf(demos, kind)} · ${DEMO_WORDS[kind].measure} ${accuracy}%`,
  // Slice 5's grants (`from the sleeper on CURLEW`).
  granted: (file: string, version: number, source: string): string => `> SKILL TRAINED: ${file} v${version} · ${source}`,
  online: (skill: string, version: number): string => `${skill} v${version} ONLINE`,
} as const;
