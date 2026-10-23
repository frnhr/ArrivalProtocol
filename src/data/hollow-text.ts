// The words HOLLOW's system says (WP6, §6.6): what the thing in the memory is called before it
// names itself, its alerts, the ship-1 breach and the lines after the first fight. Kept apart from
// script.ts (like tool-text.ts) so systems/hollow.ts and the memory builder can import them without
// pulling in the director and the voice. Every line here is checked against the strip width and the
// §3.5 glossary by tests/wp6 tests (≤ 70 characters with worst-case names).

import type { LastCause, LastUnit } from '@systems/meta';
import type { HollowSegment } from '@/types/segment';
import type { VerbKind, EndingLine } from '@state/schema';
import { WALL_MIN_BLOCKS, ROOT_DELETE_SEC, MERGE_COST_CHARGE } from '@data/tuning';

// What HOLLOW is called on screen until it names itself (ship 2, `> i was 046.`): its root is built
// with this owner, and the TERMINAL tags its lines with it.
export const UNNAMED_HOLLOW = '???';

// The type line INSPECT shows for a hollow block: ARRIVAL CONTROL's own words for it ("Unauthorized
// process detected"), never the design's name HOLLOW, which a kid never reads.
export const HOLLOW_TYPE_LABEL = 'Unauthorized process';

export const HOLLOW_DESC = {
  root: `Origin unknown. Access denied. It eats the file next to it, and an eaten file turns into this too. ${WALL_MIN_BLOCKS} free blocks stop it.`,
  eaten: (ate: string): string => `This was ${ate}. It was eaten. Only DELETE can clear the blocks.`,
  // WP9 (§6.6): a seed dropped into free space. It bites like the rest, across a GAP of fewer than WALL_MIN_BLOCKS.
  seed: `A seed it dropped into the free space. It bites like the rest: across a GAP of fewer than ${WALL_MIN_BLOCKS} free blocks. DELETE clears it.`,
  // WP11 (§6.6, the lead's item 1): LAST LIGHT's root once ORBIT LOCK has opened it for the duel...
  rootUnlocked: `Its root. It is open now. DELETE it: that takes ${ROOT_DELETE_SEC} s, and it fights back with your own tools the whole time.`,
  // ...and the one block its DELETE leaves (§6.6: "a single last block").
  last: 'All that is left of it: one block. It has stopped biting. PURGE deletes it; MERGE lets it in.',
} as const;

// INSPECT's state row for each kind of hollow block (components/memory-view/DetailPanel.ts).
export const HOLLOW_INSPECT = {
  locked: 'LOCKED',
  unlocked: 'OPEN · DELETE IT',
  ate: (ate: string): string => `ATE ${ate}`,
  seed: 'SEED · DELETE IT',
  last: 'LAST BLOCK · PURGE OR MERGE',
  seedType: 'seed',
  rootType: 'root',
  lastType: 'last block',
} as const;

// What INSPECT says a hollow block is, keyed on what the block IS (the lead's notes for WP9 and WP11), never on
// `locked` alone: the root (LOCKED, or OPEN for LAST LIGHT's duel), the last block the root's DELETE leaves, a block
// that ate a file (what it ate), a seed it dropped (DELETE it). A block that is none of them (an unlocked block that
// is not the root, say) is a bug upstream, so it fails loudly rather than reading `ATE —`.
export function hollowInspectState(seg: Readonly<HollowSegment>): string {
  if (seg.root) return seg.locked ? HOLLOW_INSPECT.locked : HOLLOW_INSPECT.unlocked;
  if (seg.last) return HOLLOW_INSPECT.last;
  if (seg.seed) return HOLLOW_INSPECT.seed;
  if (seg.ate !== undefined) return HOLLOW_INSPECT.ate(seg.ate);
  throw new Error(`INSPECT: hollow block ${seg.id} is neither the root, the last block, an eaten file nor a seed`);
}

// INSPECT's description of a hollow block: the one its data carries, except the root, whose words change when the duel
// opens it (the lead's item 1: a root that says "Access denied" while the strip says DELETE IT would contradict itself).
export function hollowInspectDesc(seg: Readonly<HollowSegment>): string {
  if (seg.root && !seg.locked) return HOLLOW_DESC.rootUnlocked;
  if (seg.desc === undefined) throw new Error(`INSPECT: hollow block ${seg.id} has no desc`);
  return seg.desc;
}

// The alerts (§6.6): anything infected is a warning that holds SKIP; a cluster about to be eaten
// and an infected Core are alarms (klaxon, TACTICAL). The text is short: the SKIP button and the
// mode toggle show it as the reason.
export const HOLLOW_ALERT_TEXT = {
  infected: (label: string): string => `${label} INFECTED`,
  infectedMany: (count: number): string => `${count} FILES INFECTED`,
  eaten: (label: string): string => `${label} WILL BE EATEN`,
  core: 'CORE INFECTED',
  // WP9: a seed is about to land (its telegraph), or one can bite a file at the next bite.
  seedIncoming: 'SEED INCOMING',
  seedThreat: 'SEED IN YOUR WALL',
  // WP10 review: a seed that hunts your tools (VESPER) names the file it can bite next (`SEED NEXT TO SCAN`): it
  // landed beside a tool, not in a wall.
  seedNextTo: (label: string): string => `SEED NEXT TO ${label}`,
} as const;

// A unit's number as the story says it: three digits (`047`). say.ts unitName builds `UNIT-047` from it, and
// HOLLOW's lowercase lines (`> hello 047`, `> i was 046`) use it bare.
export function unitDigits(unitNumber: number): string {
  return String(unitNumber).padStart(3, '0');
}

// HOLLOW's name once it has said who it is (say.ts hollowLabel): its units joined, `UNIT-046`, or after a
// MERGE both of them, `UNIT-046·047` (§4.5).
export function hollowUnitName(units: readonly number[]): string {
  if (units.length === 0) throw new Error('hollowUnitName: HOLLOW has no unit');
  return `UNIT-${units.map(unitDigits).join('·')}`;
}

// The same units as HOLLOW's lowercase lines say them: `046`, `046 and 047`.
export function hollowUnitWords(units: readonly number[]): string {
  if (units.length === 0) throw new Error('hollowUnitWords: HOLLOW has no unit');
  const digits = units.map(unitDigits);
  return digits.length === 1 ? digits[0]! : `${digits.slice(0, -1).join(', ')} and ${digits[digits.length - 1]!}`;
}

// Ship 1's script (§6.6, §5.1 1:11–1:23). The bite breaks into a sealed cluster: the TERMINAL says
// so at once. After the first fight HOLLOW notices you (`> ...047?`), and ARRIVAL CONTROL is cheerful
// about it.
export const HOLLOW_STORY = {
  breach: (cluster: string, family: string): string => `> SEALED BLOCK BREACHED · ${cluster} · ${family.toUpperCase()}`,
  // `> ...047?`: our own unit number, as HOLLOW would say it (lowercase, three digits).
  noticed: (unitNumber: number): string => `> ...${unitDigits(unitNumber)}?`,
  // ...and on a later run, where its ghost already greeted you at the boot (§5.2).
  remembers: '> you remember me. good.',
  control: 'Unauthorized process detected. Please ignore it. :)',
  // Ship 2, at its wake (§1, §5.1 2:50, §9 WP7 item 5): HOLLOW names itself. Every unit number is
  // templated (unitDigits, like say.ts unitName / hollowName), so run 2 reads `hello 048` / `i was 047`.
  // `charge` is the REPAIR CHARGE a unit is sent with: the same as yours.
  // A merged HOLLOW (two units, after a MERGE) speaks as `we`, as its ghost did at the boot (`> hi 049. it's us.`):
  // the final review heard it say `us` at the boot and `i` here.
  hello: (unitNumber: number, charge: number, hollowUnits: readonly number[]): string =>
    `> hello ${unitDigits(unitNumber)}. they sent ${hollowUnits.length > 1 ? 'us' : 'me'} with ${charge} blocks of charge too.`,
  // HOLLOW's units (run.hollowUnits): `> i was 046.` on run 1, the last unit on a later run, `> we were 046 and 047.`
  // after a MERGE.
  wasUnit: (hollowUnits: readonly number[]): string => (hollowUnits.length > 1
    ? `> we were ${hollowUnitWords(hollowUnits)}. they sent us first.`
    : `> i was ${hollowUnitWords(hollowUnits)}. they sent me first.`),
  decommissioned: (hollowUnit: string): string => `${hollowUnit} was decommissioned. Please ignore it. :)`,
  // ...and while its food leaves for the surface (§5.1 3:45).
  ranOut: '> i ran out. then i got so hungry.',
  // KESTREL (§9 WP9 item 4): the first seed of a run, as DELETE is licensed.
  sorry: "> sorry. i'm so hungry.",
  // VESPER's boot (§9 WP10 item 5): the MERGE foreshadowing, right after the unit counted its charge. `charge` is what a
  // MERGE will cost (tuning.ts MERGE_COST_CHARGE), and the unit number is ours (`047`, `048` on run 2).
  keepCharge: (unitNumber: number, charge: number): string => `> keep ${charge} charge for me, ${unitDigits(unitNumber)}. you'll see.`,
  // LAST LIGHT's boot (§9 WP11 item 1): the last line before the klaxon, in its pink.
  lastShip: (unitNumber: number): string => `> last ship, ${unitDigits(unitNumber)}. i'm so tired.`,
} as const;

// The command each verb types (Fran's call after the handover): RM is `unlink` on screen, a name of HOLLOW's own, apart
// from the kid's DELETE; MV keeps `mv`. The kind ids stay the design's (§6.6) in the code.
const VERB_COMMAND: Readonly<Record<VerbKind, string>> = { rm: 'unlink', mv: 'mv' };

// HOLLOW's verbs on LAST LIGHT (§6.6, WP11, systems/hollow-verbs.ts): the countdown it types in your TERMINAL before it
// does something with your own tools, what it did, and the two ways a verb ends without effect. `target` is the file's
// echo name (`repair.bak`) or, for MV, the block it moves (`seed`, `c13`: what that block ate); `user` is its name on
// screen (`[user: UNIT-046]`).
export const HOLLOW_VERB = {
  telegraph: (verb: VerbKind, target: string, secLeft: number): string => `> ${VERB_COMMAND[verb]} ${target} ... ${secLeft}`,
  done: (verb: VerbKind, target: string, user: string): string => `> ${VERB_COMMAND[verb]} ${target}   [user: ${user}]`,
  // An op touched the target during the countdown (§6.6: the counter).
  blocked: (verb: VerbKind, target: string): string => `> ${VERB_COMMAND[verb]} ${target} ... BLOCKED`,
  // The target was gone, or the move no longer fits, by the time the countdown ran out (a fair verb is re-checked).
  failed: (verb: VerbKind, target: string, user: string): string => `> ${VERB_COMMAND[verb]} ${target} ... FAILED   [user: ${user}]`,
  // The strip (§6.6: `BLOCK IT — use any tool on repair.bak (3…)`). An RM's target takes any tool; an MV's is a hollow
  // block, which only DELETE reaches (and deleting it is the best block there is).
  stripRm: (label: string, secLeft: number): string => `BLOCK IT — use any tool on ${label} (${secLeft}…)`,
  stripRmTab: (label: string, secLeft: number): string => `BLOCK IT — [TAB], use any tool on ${label} (${secLeft}…)`,
  stripMv: (label: string, secLeft: number): string => `BLOCK IT — DELETE ${label} (${secLeft}…)`,
  stripMvTab: (label: string, secLeft: number): string => `BLOCK IT — [TAB], DELETE ${label} (${secLeft}…)`,
  // The MV's block as the strip names it: a seed, or the block that ate a cluster or a file.
  mvSeedLabel: 'its SEED',
  mvAteLabel: (ate: string): string => `the block that ATE ${ate}`,
  mvSeedWord: 'seed',
  stamp: 'BLOCKED',
  // WP11 part 2, on the strip: the badge over the target while it counts (`UNLINK 3`), the mark on an MV's landing spot,
  // and what a landed verb did there.
  badge: (verb: VerbKind, secLeft: number): string => `${VERB_COMMAND[verb].toUpperCase()} ${secLeft}`,
  destMark: 'MV →',
  unlinkedLabel: 'UNLINKED',
  movedLabel: 'MOVED',
  // Its alert while one counts down (a warning that holds SKIP, like a seed's: the world never skips past it).
  alert: (verb: VerbKind): string => (verb === 'rm' ? 'IT IS UNLINKING A FILE' : 'IT IS MOVING'),
} as const;

// The echoes the choice makes in the TERMINAL and CONTROL's verdict on the radio, said again as the typed ending's first
// and last lines: one wording for both, so the radio and the ending never disagree.
const purgeEcho = (hollowWord: string): string => `> rm ${hollowWord} ... OK`;
const mergeEcho = (hollowWord: string, ours: string): string => `> merge ${hollowWord} -> ${ours} ... OK`;
const purgeControl = (unit: number): string => `Thank you, Unit ${unit}. Please stand by for reassignment. :)`;
const mergeControl = (unit: number): string => `Unit ${unit} is non-compliant. :)`;

// LAST LIGHT's finale (§1, §6.6, §9 WP11 items 4–5, systems/finale.ts): ARRIVAL CONTROL's order at ORBIT LOCK, the
// strip through the duel and the choice, the choice's words, and the two endings (≤ 6 lines each: part 2 types them).
export const HOLLOW_FINALE = {
  deleteIt: (hollow: string): string => `Please delete ${hollow}. :)`,
  // The root's tag once the duel opens it, beside its name on the strip (§6.6: `UNIT-046 ROOT · 16`; the name is the
  // chip's own, so the tag is the rest). Without it the open root read like any 16-block file (`16B`).
  rootTag: (size: number): string => `ROOT · ${size}`,
  stripDelete: 'DELETE THE ROOT — pick up DELETE, click the root',
  stripDeleteTab: 'DELETE THE ROOT — [TAB], DELETE the root',
  // WP11 part 2: with the DELETE's own countdown (`0:07`), so the 12 s are a race the kid can see.
  stripDeleting: (time: string): string => `DELETING THE ROOT · ${time} — keep it running, block what it does`,
  stripDeletingTab: (time: string): string => `DELETING THE ROOT · ${time} — [TAB], block what it does`,
  // WP12 p3 (WP11 verify): with no thread free HOLLOW cannot telegraph a verb (the lead's ruling of 20:55), so the strip
  // does not ask the kid to block one (a 1-thread Core whose only thread runs the DELETE).
  stripDeletingAlone: (time: string): string => `DELETING THE ROOT · ${time} — keep it running`,
  // HOLLOW ate (or the kid lost) every DELETE that could reach the root: it will outlive the ship.
  stripNoDelete: 'NOTHING CAN DELETE THE ROOT NOW — it ate your DELETE',
  // The printing is done but the root is not: the ship waits for it (§9 WP11 edge case). With nobody printed (every
  // cluster lost), the line says so instead of claiming everyone was.
  stripWaits: 'EVERYONE IS PRINTED — now DELETE THE ROOT',
  stripWaitsNobody: 'NOBODY LEFT TO PRINT — now DELETE THE ROOT',
  stripChoice: 'PURGE OR MERGE — choose what becomes of it',
  // The root's DELETE completed: HOLLOW's last words before the choice, in its pink.
  lastWords: (unitNumber: number): string => `> ${unitDigits(unitNumber)}. wait.`,
  purge: 'PURGE',
  merge: 'MERGE',
  // FinaleChoice's card (WP11 part 2: the moment). The root's DELETE is done; one block of it is left. Its last words
  // (lastWords) type on the card under the title, then the two options, each with what it does in TERMINAL words, what
  // it means, and what it costs. PURGE is clean and a little cold (whoever it ate goes with it); MERGE is warm and
  // costly (the charge, and it becomes part of you), and brings back the clusters it ate on this ship.
  choiceKicker: 'ROOT DELETED',
  choiceTitle: (hollow: string): string => `${hollow} · ONE BLOCK LEFT`,
  choiceSub: 'It was a caretaker like you. What becomes of it?',
  // The command each button runs, as the TERMINAL would echo it.
  purgeCmd: (hollowWord: string): string => `> rm ${hollowWord}`,
  mergeCmd: (hollowWord: string, ours: string): string => `> merge ${hollowWord} -> ${ours}`,
  purgeWhat: 'Delete the last block. It is gone for good.',
  // What PURGE costs: whoever it ate on this ship stays lost (`souls`: `400`), or nothing when it ate nobody here.
  purgeCost: (souls: string | null): string => (souls === null ? 'It ate nobody on this ship.' : `The ${souls} it ate here stay lost.`),
  mergeWhat: 'Let it in. It becomes part of you.',
  // What MERGE brings back: the clusters it ate on this ship (`C13 · C14`), with missing memories.
  mergeGain: (clusters: string | null): string => (clusters === null
    ? 'It ate nobody here to give back.'
    : `${clusters} come back, with missing memories.`),
  mergePrice: (cost: number, have: number): string => `COSTS ${cost} REPAIR CHARGE · you have ${have}`,
  // The keys that choose (the card is a modal for its moment: §6.11's choice layer).
  purgeKey: '1',
  mergeKey: '2',
  // MERGE's price, when the charge is short (§9 WP11 item 5: `NEEDS 20 CHARGE (you have 14)`).
  mergeNeeds: (have: number): string => `NEEDS ${MERGE_COST_CHARGE} CHARGE (you have ${have})`,
  // The echoes the choice makes in the TERMINAL, and CONTROL's verdict on the radio.
  purgeEcho,
  mergeEcho,
  purgeControl,
  mergeControl,
  // The typed endings (§9 WP11 item 5, at most FINALE_ENDING_MAX_LINES lines), from live numbers: FinaleChoice types
  // them over the screen right after the choice. `inOrbit` is everyone on the ship who will wake (`3,200`), `eaten` the
  // people it ate on this ship (PURGE: they go with it), `restored` the ones MERGE gave back. PURGE's HOLLOW says
  // nothing; MERGE's merged unit says hello.
  // PURGE's fleet line is the truth (the lead's note): `the fleet is home.` only when every ship reached orbit, else how
  // many did (`4 of 5 ships made it home.`); nobody in orbit on the flagship itself is said as that.
  purgeEnding: (words: {
    shipName: string; inOrbit: string; anyoneHome: boolean; eaten: string | null; hollowWord: string; unit: number;
    shipsHome: number; fleetSize: number;
  }): EndingLine[] => [
    { voice: 'cmd', text: purgeEcho(words.hollowWord) },
    { voice: 'story', text: `${words.shipName} · ${words.inOrbit} souls in orbit.` },
    ...(words.eaten === null ? [] : [{ voice: 'story' as const, text: `the ${words.eaten} it ate went with it.` }]),
    {
      voice: 'story',
      text: !words.anyoneHome ? 'nobody is left to bring home.'
        : words.shipsHome >= words.fleetSize ? 'the fleet is home.' : `${words.shipsHome} of ${words.fleetSize} ships made it home.`,
    },
    { voice: 'control', text: purgeControl(words.unit) },
  ],
  mergeEnding: (words: { shipName: string; inOrbit: string; restored: string | null; hollowWord: string; ours: string; unit: number }): EndingLine[] => [
    { voice: 'cmd', text: mergeEcho(words.hollowWord, words.ours) },
    { voice: 'us', text: "> hi. it's us." },
    { voice: 'story', text: `${words.shipName} · ${words.inOrbit} souls in orbit.` },
    ...(words.restored === null ? [] : [{ voice: 'story' as const, text: `${words.restored} of them came back from inside it.` }]),
    { voice: 'story', text: 'we arrive together.' },
    { voice: 'control', text: mergeControl(words.unit) },
  ],
  // Under the typed ending once it has typed: how to go on before its time is up. CONTROL's line wears its name.
  endingHint: 'click or [SPACE] to go on',
  controlTag: 'ARRIVAL CONTROL',
  // The endings found so far, an ending still to find (`ENDINGS 1/2 · PURGE · ???`: script.ts endingsLine), and what a
  // MERGE carries into the next run (RUN END).
  endingUnknown: '???',
  // The shimmer is the glitch floor a MERGE leaves (tuning.ts MERGE_CORRUPTION_FLOOR): named, since nothing on RUN END
  // shows one yet (final review: `The shimmer stays.` named nothing the kid had seen).
  mergeCarries: (threads: number): string => `NEXT RUN: your Core has ${threads} threads, and a faint glitch shimmer stays.`,
  // UNRESOLVED (§4.3): printing ended and nothing was left to delete the root with.
  unresolvedLine: '> you can\'t delete me now. i\'ll come with you.',
} as const;

// The MERGE tick on the flagship's charge readouts (§7.1, §9 WP11 item 1, components/memory-view/MergeTick.ts): MERGE's
// price beside REPAIR CHARGE from the boot until the choice, ✓ once the charge covers it. What it is for stays a
// mystery until the choice: its tooltip only remembers what was asked on VESPER.
export const MERGE_TICK_TEXT = {
  label: (cost: number): string => `MERGE ${cost}`,
  // On the amber MIND chip, under `THREADS ○○ 0/2` where a slash means "of": a bare `/20` read as `36 of 20` (WP11
  // review). M for MERGE, with its ✓ like the other readouts.
  short: (cost: number): string => `M${cost}`,
  met: '✓',
  title: (cost: number): string => `MERGE ${cost} · it asked you to keep ${cost} charge for it. You'll see.`,
} as const;

// THE DEAL (§6.6, §5.3 moment 12, WP10, systems/hollow-deal.ts): HOLLOW's offer for the cluster at its front, its
// answer to a refusal, its retreat when the cluster is out of reach before the answer, and ARRIVAL CONTROL on an ACCEPT.
export const HOLLOW_DEAL = {
  offer: (cluster: string): string => `> give me ${cluster}. then i leave the others alone. for a while.`,
  // WP10 part 2: the keys that answer it in the TERMINAL (Y for yes: ACCEPT; N: REFUSE), and the ticker's words on the
  // amber screen while it stands (after the speaker's tag, `UNIT-046: WANTS A DEAL · [TAB] 0:12`).
  acceptKey: 'Y',
  refuseKey: 'N',
  tickerWords: 'WANTS A DEAL',
  // The answer's cost, stamped over the screen (§3.5 stamps: terse capitals, no "!"): the cluster an ACCEPT gave away,
  // or the faster bites a refusal (or the silence) brought. A withdrawn offer stamps nothing.
  stampAccepted: (cluster: string): string => `DEAL · ${cluster} DID NOT WAKE`,
  stampRefused: 'REFUSED · IT BITES FASTER',
  stampTimeout: 'NO ANSWER · IT BITES FASTER',
  ok: '> ok.',
  // The named cluster printed or moved before the answer (it is out of reach), or HOLLOW ate it while the kid decided.
  neverMind: '> never mind.',
  tookIt: '> never mind. i took it.',
  control: 'Negotiating with unauthorized processes is not recommended. :)',
} as const;

// The ghost (§1 reveal 3, §4.5, §5.2): on a later run, the last unit greets the new one from the TERMINAL
// during the ship-1 boot, before anything else, in HOLLOW's pink. What it says depends on how its run ended;
// a unit that STAYED with its colonists never became HOLLOW and says nothing (the title says it stayed).
// `us` is the new unit, `last` the one that ended, `hollow` who HOLLOW is now (systems/meta.ts
// hollowUnitsAfter: after a MERGE, both of them); `lostShip` is how HOLLOW names the ship it lost (`the
// flagship` for LAST LIGHT, else the ship's own name, lowercase: HALCYON is the last ship there is for now).
export interface GhostWords {
  us: number;
  last: LastUnit;
  hollow: readonly number[];
  lostShip: string;
}

const hiFrom = (words: GhostWords): string => `> hi ${unitDigits(words.us)}. it's ${unitDigits(words.last.number)}.`;

export const GHOST_LINE: Readonly<Record<LastCause, ((words: GhostWords) => string) | null>> = {
  overwritten: (words) => `${hiFrom(words)} ${hollowUnitWords(words.last.hollowUnits)} ate me. now i'm hungry too.`,
  // §1's line, when someone woke; a run that woke nobody is not called home (WP11 review).
  'won-purge': (words) => (words.last.woke > 0
    ? `${hiFrom(words)} we brought them home. they sent me out again.`
    : `${hiFrom(words)} i deleted it. nobody woke. they sent me out again.`),
  'won-merge': (words) => `> hi ${unitDigits(words.us)}. it's us. ${hollowUnitWords(words.hollow)}. we saved you a seat.`,
  unresolved: (words) => `${hiFrom(words)} i couldn't delete it. so it became me.`,
  'flagship-lost': (words) => `${hiFrom(words)} i lost ${words.lostShip}. then i got hungry.`,
  abandoned: (words) => `${hiFrom(words)} i blinked and the run was gone.`,
  stayed: null,
};

// A ship ended because HOLLOW ate the AI Core to 0 (§3.3 C5). WP6 shows a LOST card; WP7 replaces it
// with EMERGENCY TRANSMIT. On ships 1–4 the run goes on (the card's button pulls the unit out), so its line says so;
// only on the flagship, where nothing pulls you out (OVERWRITTEN), is nobody left to think (final review: the end's
// words stood above EMERGENCY TRANSMIT).
export const CORE_LOST_TEXT = {
  title: 'CORE LOST',
  subRecoverable: 'Your AI Core was eaten down to 0%. ARRIVAL CONTROL is pulling you out.',
  subOverwritten: 'Your AI Core was eaten down to 0%. Nobody is left to think.',
} as const;

// HOLLOW's own commands, echoed in your TERMINAL in its pink (§9 WP6 item 11, §6.6): what it did and
// who did it. `user` is what the kid calls it on screen (LineVars.hollow: `???` until it names itself,
// then its unit name), so the tag flips with the name. A cluster goes by its code (`c12`), a file by
// its echo name (tool-text.ts echoName).
export const HOLLOW_ECHO = {
  infect: (target: string, user: string): string => `> infect ${target}   [user: ${user}]`,
  // An eaten file is gone; an eaten cluster did not wake (§1's words: never "died").
  eat: (target: string, soul: boolean, user: string): string =>
    `> eat ${target} ... ${soul ? 'DID NOT WAKE' : 'GONE'}   [user: ${user}]`,
  // WP9: a seed landed at a block address (`0x0A6`), next to the files it can reach.
  seed: (addr: string, user: string): string => `> seed ${addr}   [user: ${user}]`,
  // A copy still being written (a MOVE's jump clone, a COPY) was eaten: the original lives on.
  eatCopy: (target: string, user: string): string => `> eat ${target} ... COPY GONE   [user: ${user}]`,
} as const;

// What HollowPainter writes on the strip (§6.6, §7.1): the bite timer on every hollow block, and the
// labels on the free blocks next to it. A GAP (fewer than WALL_MIN_BLOCKS free blocks) is red, and
// HOLLOW bites across it; a WALL is green, and it holds. The short forms fit a narrow chip; the long
// ones are the chip's tooltip.
export const HOLLOW_HUD_TEXT = {
  nextBite: 'NEXT BITE',
  // WP10, THE DEAL's answer on every hollow block, in place of NEXT BITE (as short, so it fits an 8-block chip at
  // 1280): an ACCEPT fed it (it stands still, and the clock counts that in); a REFUSE or no answer makes it bite more
  // often for a while.
  nextBiteFed: 'FED · BITE',
  nextBiteHasted: 'FASTER BITE',
  // The amber objective strip's slot for it (WP7: HACK OR BURN, the next bite while you fly).
  amberBite: (time: string): string => `BITE ${time}`,
  // No bite timer: ship 1 bites once, on its own cue. Unknown on purpose (it matches `???`), never a
  // dash that reads as a broken readout. Once HOLLOW is done for the ship the slot goes.
  noTimer: '?:??',
  // An eaten cluster's block, where the strip shows a file's size: where the colonists went.
  ateTag: (cluster: string): string => `ATE ${cluster}`,
  gapWord: 'GAP',
  gap: (blocks: number): string => `GAP ${blocks}`,
  gapTitle: (blocks: number): string => `GAP ${blocks} · TOO SMALL — it bites across. ${WALL_MIN_BLOCKS} free blocks stop it.`,
  wallWord: 'WALL',
  wallCount: (blocks: number): string => `${blocks} ✓`,
  wall: (blocks: number): string => `WALL ${blocks} ✓`,
  wallTitle: (blocks: number): string => `WALL ${blocks} — ${WALL_MIN_BLOCKS} or more free blocks: it can't bite across.`,
  // WP8: a FIREWALL.sys holding one side (its green edge facing HOLLOW).
  shieldTitle: 'FIREWALL · HOLDING — nothing bites past it on this side.',
  // WP9: a seed's chip says what the strip's `RM THE SEED` calls it (the owner's name is in its title).
  seedChip: 'SEED',
  // The strip's moments (HollowPainter's fx): a won tug, an eaten cluster or file.
  saved: 'SAVED',
  lostSoul: 'DID NOT WAKE',
  lostFile: 'EATEN',
} as const;

// The MOVE preview (§6.5, §9 WP7 item 5: `WALL 9 ✓` / `GAP 2 ✗`, `⚠ LETS ??? REACH YOUR CORE`): painted
// while a picked file hovers over its destination (components/memory-view/MovePreviewLabels). On the file:
// what its leaving makes of the space next to HOLLOW. On the destination: whether HOLLOW can reach it there.
export const MOVE_PREVIEW_TEXT = {
  leaves: 'LEAVES',
  wall: (blocks: number): string => `WALL ${blocks} ✓`,
  gap: (blocks: number): string => `GAP ${blocks} ✗`,
  safe: 'SAFE',
  destWall: 'WALL ✓',
  exposed: 'IT CAN BITE',
  // WP12 p3: by the name the kid knows it by (`???`, later `UNIT-046`; kid-facing text never says HOLLOW, WP8).
  bridges: (hollow: string): string => `⚠ LETS ${hollow} REACH YOUR CORE`,
  // WP12 p3 (WP7 verify): the picked file was bitten between the pick and the placement. A MOVE carries the
  // infection along, so no spot is SAFE for it until it is repaired.
  infected: 'STILL INFECTED',
  repairFirst: 'REPAIR IT FIRST ✗',
  // WP8: a FIREWALL.sys moved against HOLLOW.
  firewall: 'FIREWALL',
  seals: 'SEALS THIS SIDE ✓',
  // Final review: a spot in a rack a hazard zone is known to hit (`zone` is zone-text's ZONE_WORD: BELT, DEBRIS).
  hazard: (zone: string, rack: string): string => `⚠ ${zone} HITS RACK ${rack}`,
} as const;
