// Playtest 1, C-UNROLL (docs/phase3/impl/playtest-1-plan.md §3.5; Fran's notes 13 and 17): the boot's SELF-CHECK on run 1's
// first three ships, headless, through the run's own machinery (real boots, real beams along the worked route).
// • The stages in order (RECEIVE, SELF, SHIP, HOLD, MANIFEST, SENSORS), each problem found as the check reaches it (a tag on
//   its file, its step sounded once), at most six of the unit's own lines typed a ship, the rest marks (logged, never typed).
// • ARES-VII: SELF finds Engine I/O −15% and Sensor Interp −22% in transit, SHIP finds the ENGINE I/O FAULT (85 → 38, ENGINE
//   WEAK; no crunch, no thrust), HOLD finds POD 02, MANIFEST holds on 046.log (the run's first) for SELF_CHECK_HOLD_SEC with no
//   press, then PAL's reaction.
// • HALCYON: the sleep types first; 046.log is no longer new (no hold); ECC's corrections tick back (`ECC ✓`); the first
//   parcel (Mv, requested at ARES-VII's desk) holds the sweep, a press lets it go, and it is named DELIVERY · WAITED n YRS.
// • KESTREL: SHIP finds Sensor Interp at 45 (PATH UNCERTAIN) before the plot draws; MANIFEST holds on the first seed (`NOT IN
//   YOUR PACKET`), then names it (`RODE YOUR BEAM · IT GROWS`), and ARRIVAL CONTROL says HOLLOW for the first time, officially,
//   then PAL. No line on the run says HOLLOW before it.
// • Run 1 ship 1 runs about 12 s with its hold clicked through; a later run's first ship holds on nothing, and two presses
//   skip it.
// • The words: the check's tags and strip lines fit, and never say wake / waking / awake.
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import { receiveTransmission, skipBoot, bootCheckProgress } from '@systems/boot';
import { transmitNext, continueAfterReport } from '@systems/run';
import { leaveOrbit, setCourseFromDesk } from '../support/desk';
import { setRequest } from '@systems/repository';
import { checkView, hollowWordSaid, CHECK_FIRST_ID, CHECK_NAMED_HOLLOW } from '@systems/self-check';
import { mountStoryLog } from '@systems/story-log';
import { on } from '@systems/events';
import { SELF_CHECK_TEXT } from '@data/self-check-text';
import { HOLLOW_STORY } from '@data/hollow-text';
import { COMPANION_LINES } from '@data/companion-text';
import { ENGINE_FAULT_ID, LINES } from '@data/script';
import { CHECK_STAGES, type CheckStage, type CheckTag } from '@/types/self-check';
import { SELF_CHECK_HOLD_SEC, MAX_LINE_CHARS } from '@data/tuning';
import type { GameState, LogEntry } from '@state/schema';

const SEED = 19;
const h = createHarness11(SEED, { soulsFound: false });
mountStoryLog(h.store);
const state = (): Readonly<GameState> => h.store.getState();
const steps: { cue: string; segIds: string[] }[] = [];
on('self-check-step', ({ cue, segIds }) => { steps.push({ cue, segIds: [...segIds] }); });

interface Boot {
  ship: string;
  stages: CheckStage[];
  stageAt: Partial<Record<CheckStage, number>>;
  // Every tag the check showed on each file, in order.
  tags: Map<string, CheckTag[]>;
  heldSec: number;
  totalSec: number;
  entries: LogEntry[];
  engineAt: Partial<Record<CheckStage, number>>;
  steps: { cue: string; segIds: string[] }[];
}

// Plays one boot to the flight, recording what the check showed. `press`: called each step while the sweep holds; true
// presses (the click that lets it go).
function playBoot(press: (heldSec: number) => boolean = () => false): Boot {
  const from = state().log.entries.length;
  const stepFrom = steps.length;
  const start = h.wall();
  const boot: Boot = { ship: state().level.shipName, stages: [], stageAt: {}, tags: new Map(), heldSec: 0, totalSec: 0, entries: [], engineAt: {}, steps: [] };
  let heldFor = 0;
  while (state().run.phase === 'boot' && h.wall() - start < 60) {
    const before = h.wall();
    h.step();
    const dt = h.wall() - before;
    const progress = bootCheckProgress();
    const stage = progress.stage;
    if (stage !== null && boot.stages.at(-1) !== stage) {
      boot.stages.push(stage);
      boot.stageAt[stage] = h.wall() - start;
      const engine = state().memory.find((seg) => seg.role === 'engine-io');
      if (engine !== undefined && 'integrity' in engine) boot.engineAt[stage] = engine.integrity;
    }
    for (const tag of checkView().tags.values()) {
      const seen = boot.tags.get(tag.segId) ?? [];
      if (seen.at(-1)?.text !== tag.text) boot.tags.set(tag.segId, [...seen, tag]);
    }
    if (progress.held) {
      boot.heldSec += dt;
      heldFor += dt;
      if (press(heldFor)) { skipBoot(h.store); heldFor = 0; }
    } else heldFor = 0;
  }
  boot.totalSec = h.wall() - start;
  boot.entries = state().log.entries.slice(from);
  boot.steps = steps.slice(stepFrom);
  return boot;
}

const typedOwn = (boot: Boot): string[] => boot.entries.filter((entry) => entry.speaker === 'mind-sys' && entry.mark !== true).map((entry) => entry.text);
const marks = (boot: Boot): string[] => boot.entries.filter((entry) => entry.mark === true).map((entry) => entry.text);
const tagTexts = (boot: Boot, segId: string): string[] => (boot.tags.get(segId) ?? []).map((tag) => tag.text);
const segIdOf = (role: string): string => state().memory.find((seg) => seg.role === role)?.id ?? `(no ${role})`;
const inOrder = (stages: readonly CheckStage[]): boolean => stages.every((stage, i) => i === 0 || CHECK_STAGES.indexOf(stage) > CHECK_STAGES.indexOf(stages[i - 1]!));
const done = (): string[] => state().director.done;

// The ship's end at once (locked, landed), LEAVE ORBIT, the desk (`request`), the beam to `slot`.
function onTo(slot: number, request: 'mv' | null): void {
  h.store.update((draft) => { draft.hollow.phase = 'dormant'; });
  h.startLanding(1, 'locked');
  h.untilPhase('report', 400);
  continueAfterReport(h.store);
  leaveOrbit(h.store);
  if (request !== null) setRequest(h.store, request);
  setCourseFromDesk(h.store, slot);
  transmitNext(h.store);
}

// --- ARES-VII ------------------------------------------------------------------------------------------------------------
h.newRun(SEED);
receiveTransmission(h.store);
const ares = playBoot();
{
  check('ARES-VII: the check runs its six stages in order', JSON.stringify(ares.stages) === JSON.stringify(CHECK_STAGES), ares.stages.join(' → '));
  check('…the unpack and the host type; the ECC record is a mark (logged, never typed); the mail types',
    typedOwn(ares).join(' | ') === `> UNPACKING UNIT-047 ... 100% | ${ares.entries.find((entry) => entry.text.startsWith('> HOST:'))?.text} | > 1 NEW MESSAGE · INBOX`
    && marks(ares).length === 1 && marks(ares)[0]!.startsWith('> ECC: ENGINE I/O 85% · SENSOR INTERP 78%'), `${typedOwn(ares).join(' | ')} || ${marks(ares).join(' | ')}`);
  const engine = segIdOf('engine-io');
  const sensor = segIdOf('sensor');
  check('…SELF finds Engine I/O −15% and Sensor Interp −22% in transit', tagTexts(ares, engine)[0] === '−15% IN TRANSIT'
    && tagTexts(ares, sensor).join() === '−22% IN TRANSIT', `${tagTexts(ares, engine).join()} · ${tagTexts(ares, sensor).join()}`);
  check('…SHIP finds the ENGINE I/O FAULT: 85 through SELF, 38 from HOLD on, tagged ENGINE WEAK, found with no crunch',
    ares.engineAt.self === 85 && ares.engineAt.ship === 85 && ares.engineAt.hold === 38 && done().includes(ENGINE_FAULT_ID)
    && tagTexts(ares, engine).at(-1) === 'ENGINE WEAK' && state().burn.thrustTac === 0
    && h.events.some((event) => event.name === 'file-fault' && (event.payload as { found: boolean }).found),
    `${JSON.stringify(ares.engineAt)} · ${tagTexts(ares, engine).join(' → ')}`);
  const pod2 = state().memory.find((seg) => seg.type === 'driver' && seg.pod === 2);
  check('…HOLD finds POD 02 at 44 (its heartbeat with it)', pod2 !== undefined && tagTexts(ares, pod2.id).join() === '−56% IN TRANSIT'
    && ares.steps.some((step) => step.cue === 'pod' && step.segIds.includes(pod2.id)), pod2 ? tagTexts(ares, pod2.id).join() : 'no POD 02');
  const log = state().memory.find((seg) => seg.type === 'log')!;
  check(`…MANIFEST holds on 046.log, the run's first (no press: SELF_CHECK_HOLD_SEC ${SELF_CHECK_HOLD_SEC} s), \`NOT IN THE MANIFEST\``,
    Math.abs(ares.heldSec - SELF_CHECK_HOLD_SEC) < 0.1 && tagTexts(ares, log.id).join() === SELF_CHECK_TEXT.tag.log && done().includes(CHECK_FIRST_ID.log),
    `${ares.heldSec.toFixed(2)} s`);
  check('…and PAL reacts in its preset (`Ooh, a mystery file! :)`), not CONTROL', ares.entries.some((entry) => entry.speaker === 'companion'
    && entry.text === COMPANION_LINES.chipper.mysteryFile) && !ares.entries.some((entry) => entry.speaker === 'control'));
  check('…each file found is sounded once', ares.steps.filter((step) => step.segIds.includes(sensor)).length === 1
    && ares.steps.filter((step) => step.segIds.includes(engine)).length === 2);
  const unheld = ares.totalSec - ares.heldSec;
  check(`…about 12 s with its hold clicked through (${unheld.toFixed(1)} s; ${ares.totalSec.toFixed(1)} s waited out)`, unheld >= 10 && unheld <= 14);
  check('…and the flight\'s first line is the REPAIR lesson (ENGINE WEAK) on the crash course', state().run.phase === 'flight'
    && (h.stepFor(0.5), state().director.shown?.id === 'tut-engine-weak'), state().director.shown?.text);
}

// --- HALCYON -------------------------------------------------------------------------------------------------------------
onTo(2, 'mv');
let releasedOk = false;
const halcyon = playBoot((heldSec) => {
  if (heldSec < 0.5) return false;
  // The press is the click: the sweep goes on, still in blue.
  releasedOk = state().run.phase === 'boot';
  return true;
});
{
  check('HALCYON: the stages in order', inOrder(halcyon.stages) && halcyon.stages[0] === 'receive' && halcyon.stages.at(-1) === 'sensors', halcyon.stages.join(' → '));
  check('…the sleep types first (`> ASLEEP IN HALCYON\'S RECEIVER …`), and at most six of the unit\'s own lines type',
    typedOwn(halcyon)[0]?.startsWith('> ASLEEP IN HALCYON\'S RECEIVER') === true && typedOwn(halcyon).length <= 6, typedOwn(halcyon).join(' | '));
  const arrival = state().run.arrival!;
  const ecc = [...halcyon.tags.values()].flat().filter((tag) => tag.text === SELF_CHECK_TEXT.tag.ecc).length;
  const hits = [...new Set(arrival.hits.map((hit) => hit.segId))];
  check(`…what the crossing took is found on each file hit (${hits.length}), and ECC's ${arrival.eccCorrected} corrections tick back \`ECC ✓\``,
    hits.every((id) => tagTexts(halcyon, id).some((text) => text.endsWith('IN TRANSIT'))) && ecc === arrival.eccCorrected && marks(halcyon).some((text) => text.startsWith('> ECC:')),
    `${ecc} ECC ✓ · ${hits.map((id) => tagTexts(halcyon, id).join()).join(' | ')}`);
  const mv = arrival.deliveries.find((delivery) => delivery.file === 'mv');
  check('…046.log is no longer new: the sweep does not hold on it', mv !== undefined && !halcyon.steps.some((step) => step.cue === 'new'
    && step.segIds.includes(state().memory.find((seg) => seg.type === 'log')!.id) && tagTexts(halcyon, step.segIds[0]!).includes(SELF_CHECK_TEXT.tag.log)));
  const parcel = mv?.segIds[0] ?? '';
  check('…the first parcel (Mv, requested at ARES-VII) holds the sweep, and a press lets it go on in blue',
    releasedOk && halcyon.heldSec > 0.4 && halcyon.heldSec < 1 && done().includes(CHECK_FIRST_ID.parcel), `${halcyon.heldSec.toFixed(2)} s`);
  check('…named as it is found: `DELIVERY · WAITED n YRS` (or what the crossing took from it), and MOVE is licensed with it',
    /^DELIVERY · (WAITED \d+ YRS?|−\d+% IN TRANSIT)$/.test(tagTexts(halcyon, parcel).join())
    && state().run.licences.includes('move') && marks(halcyon).some((text) => text.startsWith('> DELIVERY: mv')), tagTexts(halcyon, parcel).join());
  check('…no HOLLOW yet: CONTROL has not named it', !hollowWordSaid(state()));
}

// --- KESTREL -------------------------------------------------------------------------------------------------------------
onTo(5, null);
const kestrel = playBoot();
{
  const fragment = kestrel.entries.findIndex((entry) => entry.speaker === 'control' && entry.text === HOLLOW_STORY.fragment);
  const firstSeed = state().run.arrival?.seeds.find((seed) => seed.disguise === null);
  check('KESTREL: the stages in order', inOrder(kestrel.stages) && kestrel.stages.at(-1) === 'sensors', kestrel.stages.join(' → '));
  const sensor = segIdOf('sensor');
  check('…SHIP finds Sensor Interp at 45: PATH UNCERTAIN, before the sensors come up', tagTexts(kestrel, sensor).at(-1) === 'PATH UNCERTAIN'
    && kestrel.steps.some((step) => step.cue === 'fault' && step.segIds.includes(sensor)), tagTexts(kestrel, sensor).join(' → '));
  check('…MANIFEST holds on the first seed: `NOT IN YOUR PACKET`, then `RODE YOUR BEAM · IT GROWS`', firstSeed !== undefined
    && JSON.stringify(tagTexts(kestrel, firstSeed.segId)) === JSON.stringify([SELF_CHECK_TEXT.tag.seed, SELF_CHECK_TEXT.tag.seedNamed])
    && Math.abs(kestrel.heldSec - SELF_CHECK_HOLD_SEC) < 0.1 && done().includes(CHECK_FIRST_ID.seed), `${tagTexts(kestrel, firstSeed?.segId ?? '').join(' → ')} · ${kestrel.heldSec.toFixed(2)} s`);
  check('…then ARRIVAL CONTROL names it, officially: `Fragment of a HOLLOW process detected. Delete it.`, and PAL reacts after',
    fragment >= 0 && kestrel.entries.slice(fragment + 1).some((entry) => entry.speaker === 'companion' && entry.text === COMPANION_LINES.chipper.firstSeed)
    && done().includes(CHECK_NAMED_HOLLOW) && hollowWordSaid(state()), kestrel.entries.filter((entry) => entry.speaker !== 'mind-sys').map((entry) => `${entry.speaker}: ${entry.text}`).join(' | '));
  const all = state().log.entries;
  const named = all.findIndex((entry) => entry.text === HOLLOW_STORY.fragment);
  const before = all.slice(0, named).filter((entry) => /hollow/i.test(entry.text));
  check('…and no line of the run says HOLLOW before it', named > 0 && before.length === 0, before.map((entry) => entry.text).join(' | '));
  check('…at most six of the unit\'s own lines typed', typedOwn(kestrel).length <= 6, typedOwn(kestrel).join(' | '));
}

// --- A later run: nothing held, two presses skip ---------------------------------------------------------------------------
h.newRun(SEED + 1);
h.store.update((draft) => { draft.run.tutorial = false; });
receiveTransmission(h.store);
h.stepFor(1);
const plan = bootCheckProgress().steps;
check('a later run (not the tutorial): the first of a kind is named as the sweep passes, never held',
  plan.some((step) => step.kind === 'first') && plan.every((step) => step.kind !== 'first' || !step.hold));
check('…and the check stays skippable: two presses, then the cut once the findings are seen', skipBoot(h.store) && skipBoot(h.store)
  && (h.stepFor(1.5), state().run.phase === 'flight'), state().run.phase);

// --- The words -----------------------------------------------------------------------------------------------------------
{
  const words = [
    ...Object.values(SELF_CHECK_TEXT.stage), SELF_CHECK_TEXT.skip, SELF_CHECK_TEXT.hold, SELF_CHECK_TEXT.tag.transit(100), SELF_CHECK_TEXT.tag.ecc,
    SELF_CHECK_TEXT.tag.charge(99), SELF_CHECK_TEXT.tag.log, SELF_CHECK_TEXT.tag.logKey('ENTRIES 10–11'),
    SELF_CHECK_TEXT.tag.parcel(999), SELF_CHECK_TEXT.tag.parcelHit(100), SELF_CHECK_TEXT.tag.seed, SELF_CHECK_TEXT.tag.seedNamed, SELF_CHECK_TEXT.tag.sentrySeed,
    SELF_CHECK_TEXT.tag.hollow('UNIT-046·047', 99), HOLLOW_STORY.fragment,
    ...Object.values(COMPANION_LINES).flatMap((lines) => [lines.mysteryFile, lines.firstSeed]),
    ...CHECK_STAGES.flatMap((stage) => [LINES.booting(stage, false), LINES.booting(stage, true)]),
  ];
  check('the check\'s words never say wake, waking or awake', words.every((text) => !/\b(wake|waking|awake)\b/i.test(text)),
    words.filter((text) => /\b(wake|waking|awake)\b/i.test(text)).join(' | '));
  check(`…every strip line and tag fits one line (≤ ${MAX_LINE_CHARS})`, words.every((text) => text.length <= MAX_LINE_CHARS),
    words.filter((text) => text.length > MAX_LINE_CHARS).join(' | '));
}

finish();
