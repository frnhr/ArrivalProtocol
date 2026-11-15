// Slice 7c: the lead owns this file (slice-7-plan.md §2.5, §4.3): the `7c NEXT RUN` block is complete; Track TRACE and Track
// LINEAGE emit it, and either may change its cues in audio-cues.ts's 7c block only (each on its own events' lines).
// Slice 7b: the lead owns this file (slice-7-plan.md §2.5, §4.2): the `7b LAST LANDING` block is complete; Track DROP emits
// it, and VIEW may change its cues in audio-cues.ts's 7b block only.
// Slice 7a: the lead owns this file (slice-7-plan.md §2.5, §4.1): the `7 ENDING` block is complete; Track CARD and Track
// NIGHT change cues in audio-cues.ts's block only.
// Slice 6: the lead owns this file (docs/phase3/impl/slice-6-plan.md §2.5, §5); every slice 4c–4e, slice 5 and slice 6 event is
// named in the blocks at the end of GameEvents, and a track emits its own. Others ask by message.
import type { HollowFate, YouChoice, LastLandingState } from '@/types/ending';
import type { TraceKind } from '@/types/trace';
import type {
  FiringSource, ViewMode, AutoburnPhase, AutoburnEnd, DealOutcome, VerbKind,
} from '@state/schema';
import type { AutodropArm, AutodropEnd, DragKick, LandingEnd, LaunchSource, Place, Touch } from '@/types/landing';
import type { SegmentRole, InfectionSide } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import type { SkillId, SkillLevel, EffectiveVersion } from '@/types/skill';
import type { RepoFileId } from '@/types/repo';
import type { LineState } from '@systems/flight-events';
import type { OpKind } from '@systems/ops-core';
import type { PlotMode } from '@systems/capabilities';
import type { ResidentKind, ResidentDealOutcome, SleeperJob } from '@/types/resident';
import type { SiteKind, SurveyRunning, BadGround, RevealBy } from '@/types/survey';
import type { LzGround } from '@/types/landing';
import type { CheckCue } from '@/types/self-check';

// The game's event bus (§9 WP2): moments, not state. Systems emit what just happened (the line
// turned green, the flight ended, an input was refused); audio, juice and the director react.
// State that persists lives in the store; anything a listener needs to keep, it reads there.
//
// Emitters: flight-events (the predictor's transitions, countdown seconds, thrust starting and
// stopping, the instruments' plot mode), orbit-sim (terminal outcomes, ghost bursts), mode (SHIP
// ⇄ MIND), flight-controls / pace / actions (refused inputs, the dead-engine cough), actions (ops
// finishing), licences (installs), faults (scripted file damage) and input (UI clicks).
//
// Synchronous and in emission order. Listeners must not call store.update directly: the
// director buffers events and acts on its next tick; audio only plays sounds.

export interface GameEvents {
  'firing-start': { source: FiringSource | null };  // thrust began to be delivered
  'firing-stop': Record<string, never>;
  'line-state': { from: LineState; to: LineState };
  'clear-of-planet': Record<string, never>;      // the path stopped ending on the surface
  'loop-closed': Record<string, never>;          // an open path became a closed loop (CAPTURED)
  'in-ring': Record<string, never>;              // the whole loop is green
  'lowest-in-ring': Record<string, never>;       // ▼ moved into the ring (chime)
  'locked': Record<string, never>;
  'accepted': Record<string, never>;
  'stranded': Record<string, never>;
  'crashed': Record<string, never>;
  'escaped': Record<string, never>;
  // WP7: BEAM OUT filled its bar before the impact; the unit left the ship (§4.3 ABANDONED).
  'abandoned': Record<string, never>;
  // The START BURN tick: 'ready' when its countdown reaches GET READY, 'now' when it is due.
  'burn-point': { stage: 'ready' | 'now' };
  // A countdown passed a whole second worth a beep. secLeft 0 is the burn's "go" (final). 'window': GET READY's 5…1
  // before a landing window opens (01-landing §3.11 L7).
  'countdown-beep': { kind: 'burn' | 'impact' | 'window'; secLeft: number; final: boolean };
  // HOLD STEADY counted down to a new number (3, 2, 1) on the way to ORBIT LOCKED.
  'lock-count': { count: number };
  'mode-change': { from: ViewMode; to: ViewMode };
  // A player input that did nothing, and why (PAUSED, SHIP SCREEN, a SKIP reason …). `tool`
  // marks a filesystem-tool refusal: its reason is shown next to the cursor (WP3).
  'refused': { reason: string; tool?: boolean };
  // An fs-tool op finished its work: 'done', or a repair that stopped because REPAIR CHARGE ran
  // out. Cancelled and aborted ops say nothing. Slice 5 (plan §2.4): `segId`, the file it worked on (a MOVE's: the file
  // where it now stands; a COPY's: the source; a SWAP's: the backup that took the job), so a resident's module can react to
  // "the lock was deleted" or "the sleeper was moved" without a hook in actions.ts; null for SENTRY v2's pre-empt (the
  // seed it took never stood as a file).
  'op-done': { kind: OpKind; result: 'done' | 'no-charge'; segId: string | null };
  'ui-click': Record<string, never>;
  // WP4. ARRIVAL CONTROL installed a licensed tool's files (transmitIn, chime, the chip slides in).
  'licence': { kind: FsToolKind };
  // Phase 3 slice 3b (02 §4 step 6): a delivery from the repository unpacked at the boot, as its `> DELIVERY:` line is said
  // (systems/delivery-boot.ts receiveDeliveryAtBoot; a chime and the chip sliding in, Track UI). One per file.
  'delivery': { file: RepoFileId };
  // Phase 3 slice 3b (05 §4): the boot's `> n NEW MESSAGES · INBOX` line was said (systems/boot.ts, beside 'log-key'): the
  // one chime per boot with new mail and the dock badge's pulse hang on it (Track UI).
  'inbox-new': { count: number };
  // A scripted fault hit a file (ship 1's ENGINE I/O FAULT): its integrity fell from → to. Playtest 1 (C-UNROLL): `found`,
  // the boot's SELF-CHECK found it as arrival damage (no crunch, no shake, no stamp: the check's tag and tone say it).
  'file-fault': { role: SegmentRole; from: number; to: number; found: boolean };
  // SPACE was pressed but the engine can't fire at all (dead or missing driver, no controller).
  'engine-cough': Record<string, never>;
  // A damaged Thrust Ctrl fired the engine by itself (C2), and that burst ended. WP10: `count` is the ship's bursts so
  // far (`first`: this is the first, the alarm moment: klaxon, 6 px shake; later ones a 3 px shake and the counter);
  // `inSkip`: a later burst a SKIP flew through (it took no wall time: the views still flash, shake and sound it).
  'ghost-start': { sticky: boolean; first: boolean; count: number; inSkip: boolean };
  'ghost-stop': Record<string, never>;
  // What the NAV PLOT can show changed (Sensor Interp, Nav Plotter): a repair back to 'exact'
  // clears the line with a whoomp.
  'plot-mode': { from: PlotMode; to: PlotMode };
  // WP5. A scan finished on a file.
  'scanned': { segId: string; role: SegmentRole | null };
  // The landing (01-landing, systems/landing.ts). It began (ORBIT LOCK or ACCEPT); an LZ's window opened (the dot's
  // centre entered its bracket from inside the band), became sure (the whole dot fits) and closed.
  'landing-start': Record<string, never>;
  'window-open': { lz: string };
  'window-sure': { lz: string };
  'window-closed': { lz: string };
  // A pod launched: emitted while its driver is still on the strip, just before it leaves memory, so the view can
  // flash the chip (LaunchFx). Then it hit the atmosphere, and touched down where it was decided at launch
  // (`firstOnShip` names the colony and sends the radio line; `firstOfRun` is the first landing's moment).
  'pod-launched': { pod: number; source: LaunchSource; segId: string };
  'pod-entry': { pod: number; first: boolean };   // first: run 1's first pod (LaunchRecord.firstOfRun)
  // `bullseye` (slice 4c review m11): AUTODROP sent it, and it came down soft in an LZ with room. Decided once, here (landing.ts
  // touchDown), for the echo and the NAV PLOT's float.
  'pod-landed': { pod: number; place: Place; lz: string | null; touch: Touch; points: number; firstOnShip: boolean; firstOfRun: boolean; bullseye: boolean };
  // An LZ reached its count (the chord), every pod is down, pods were parked in orbit, the landing ended (and why).
  'lz-full': { lz: string };
  'all-pods-down': { parked: number };   // the ship's last pod is down; `parked`: pods that never launched
  'pods-parked': { count: number };
  'landing-ended': { reason: LandingEnd };
  // Slice 1b (orbit-sim, landing.ts): a drag kick took Δv at a ▼ below the DRAG line (the stamp, the hiss and the drag
  // lesson read `dropKm` against DRAG_STAMP_MIN_KM); GO LOWER was offered for `lz`, the kid fired for it (held), and the
  // strip said RELEASE (released).
  'drag-kick': DragKick;
  'go-low': { lz: string; phase: 'offered' | 'held' | 'released' };
  // WP6: HOLLOW (systems/hollow.ts, §6.6). The bite timer fired; a file was infected from `side`; a
  // WALL held a bite (the fizzle); a repair won the tug-of-war (sparkles, clusterSaved) and its
  // recoil ran out; a file was eaten and turned hollow (`driver`: a pod's driver, the pod stays aboard to be parked);
  // and the AI Core was eaten to 0, which loses the ship (the CORE LOST card).
  'hollow-bite': Record<string, never>;
  // `driver`: the bitten file is a pod's driver (the run's stats count those bites for the draft, WP8).
  // `scripted`: the ARRIVAL stage's one scripted bite (the story's), not one HOLLOW chose.
  'hollow-infect': { segId: string; side: InfectionSide; driver: boolean; scripted: boolean };
  'hollow-wall': { hollowId: string; side: InfectionSide; gapBlocks: number };
  // WP8: a FIREWALL.sys held a bite (`side`: the way HOLLOW looked, so the FIREWALL's edge that faces it is
  // the opposite one): the same fizzle, and its green edge flashes.
  'hollow-firewall': { firewallId: string; side: InfectionSide };
  'hollow-cure': { segId: string };
  'hollow-recoil-end': { segId: string };
  // `driver`: a pod lost its driver (its last copy was eaten), not merely one copy of it gone.
  'hollow-consume': { segId: string; ate: string; driver: boolean };
  'core-lost': Record<string, never>;
  // WP7: HOLLOW said who it is (on the ship it boards, `> i was 046.`): every hollow block now carries `name`.
  'hollow-named': { name: string };
  // WP7 part 2: the name flip was seen (in blue: at once, or on the kid's first look), so its sound
  // plays with the picture (like 'crack-shown').
  'hollow-name-shown': { name: string };
  // Playtest 1 (C-UNROLL, plan §3.5): the boot's SELF-CHECK reached files (they light; a finding has its tag). The sound of
  // the step (audio-cues: checkTick, faultFound, eccFixed, the pods' heartbeat, a chime) and the strip's flash hang on it.
  // (It replaces WP7's 'arrival-hits', the red flashes and crackles of the old boot's ECC line.)
  'self-check-step': { cue: CheckCue; segIds: readonly string[] };
  // BEAM OUT started (the TRANSMITTING bar), was cancelled, or filled ('abandoned' is the flight's end).
  'beam-out-start': Record<string, never>;
  'beam-out-cancel': Record<string, never>;
  // WP8: a write to the archive failed mid-run: from now on this unit is not kept (systems/meta.ts). The game
  // says so once (a TERMINAL line and a buzz); the footer's tag stays.
  'archive-lost': Record<string, never>;
  // Phase 3 slice 3c: a read or write of the run save failed (systems/save-write.ts): a reload will lose this run. The
  // game says so once (`RUN SAVE OFFLINE — a reload will lose this run`: a TERMINAL line and a buzz); the footer's NO SAVE
  // stays. Play goes on.
  'save-lost': Record<string, never>;
  // ...and its slot could not be emptied either (slice 3c review fix M2): a reload may resume the last save written, an
  // older point of this run (`RUN SAVE OFFLINE — a reload may go back to an older save`). Emitted instead of 'save-lost'.
  'save-stale': Record<string, never>;
  // WP9: a hazard zone hit memory (systems/zones.ts): a debris contact (every file in its rack at once) or one
  // belt hit. `hits` are the files, the rack each was in, and their integrity before and after; `lostDrivers`
  // are the pods whose drivers it took to 0. The thud, shake, rack flash and `HIT · RACK C` stamp hang on it.
  'zone-hit': {
    zoneId: string;
    kind: 'debris' | 'belt';
    racks: string[];
    hits: { segId: string; rack: string; from: number; to: number }[];
    lostDrivers: number[];
  };
  // WP9: what the instruments say a debris cloud will do changed (flight-events, from the SENSED path): 'hit'
  // (the path enters it), 'clear' (it misses), 'unknown' (PATH UNCERTAIN). The first look sets the baseline.
  'zone-forecast': { zoneId: string; from: ZoneForecast; to: ZoneForecast };
  // The ▼ correction stopped being able to dodge a debris cloud the path runs into (WP9 fix round 1: the strip's
  // `· 0:00 to dodge DEBRIS C` turned into `· too late to dodge DEBRIS C`), as the instruments saw it.
  'dodge-lapsed': { zoneId: string; rack: string };
  // WP9: HOLLOW telegraphs a seed (the blinking outline, §6.6) at these blocks, then it lands as `segId`.
  'seed-telegraph': { startAddr: number; size: number };
  'seed-landed': { segId: string; startAddr: number };
  // WP9: AUTOBURN changed phase (systems/autoburn.ts), and why an engagement ended.
  'autoburn': { from: AutoburnPhase; to: AutoburnPhase; end: AutoburnEnd | null };
  // WP10: THE DEAL (systems/hollow-deal.ts) was offered in the TERMINAL, naming `pod`; and how it ended.
  'deal-offered': { pod: number };
  'deal': { outcome: DealOutcome; pod: number };
  // Slice 4: a skill line of the boot (systems/skill-files.ts applySkillBootLine): a skill trained, retrained by new demos,
  // or granted; `accuracy` null for a skill with no demos. The ONLINE stamp and the chime hang on it.
  'skill-trained': { skill: SkillId; level: SkillLevel; kind: 'trained' | 'retrained' | 'granted'; demos: number; accuracy: number | null };
  // Slice 4 (03 §3.5): a skill's effective version moved (skill-files.ts mountSkillWatch): a step down is stamped
  // (`AUTOBURN v2 → v1`), a step back up through REPAIR too (`AUTOBURN v2 RESTORED`).
  'skill-version': { skill: SkillId; from: EffectiveVersion; to: EffectiveVersion };
  // Slice 4 (03 §3.7): the path entered AUTOBURN's lock range (the AUTO button glows; a chime).
  'autoburn-in-lock': Record<string, never>;
  // WP11: a glitchBurst (systems/glitch.ts): the overlay spikes to `level` for `ms` (a dim pulse under reduced motion).
  'glitch-burst': { level: number; ms: number };
  // WP11: HOLLOW's verbs (systems/hollow-verbs.ts): one started counting down at `targetId`; an op touched its target
  // first (BLOCKED: the stamp hangs on it); it landed; or it found its target gone or out of reach when it ran out.
  'verb-telegraph': { kind: VerbKind; targetId: string };
  'verb-blocked': { kind: VerbKind; targetId: string };
  'verb-landed': { kind: VerbKind; targetId: string };
  'verb-failed': { kind: VerbKind; targetId: string };
  // WP11: LAST LIGHT's finale (systems/finale.ts): ORBIT LOCK opened the root; its DELETE completed (one last block
  // left: HOLLOW stopped); the kid chose. (An UNRESOLVED end has no event: HOLLOW's line and the sombre RUN END carry it.)
  'root-unlocked': Record<string, never>;
  // WP11 part 2: one of the duel's glitch spikes while the root's DELETE runs; `progress` is how far it is (0..1).
  'duel-spike': { progress: number };
  'root-deleted': Record<string, never>;
  // Slice 7a (R7): step 2's confirm applied both choices; `restored`, the pods MERGE gave back (7a: in place, R15).
  'finale-chosen': { hollow: HollowFate; you: YouChoice; restored: number };
  // Phase 3 slice 2 (04 §3.4–§3.8, 05 §3.2). A beam seed landed behind its target at the boot (the ECC seeds line, the
  // `seedLand` thunk); a seed was deleted (`beam`: a beam seed, whose `words` it may say, at most once a ship); TRACE went
  // up at a ship's end.
  'seed-landed-beam': { segId: string; targetId: string | null };   // targetId null: a stray, loose (no-room rule)
  'seed-deleted': { segId: string; beam: boolean; words: string | null };
  'trace-changed': { from: number; to: number };
  // HOLLOW rides the beam into the next ship (the PACKET's uninvited chip, the transmitSweep stutter), then landed in the
  // root slot as the boot's 108% unpack was said (the shake, the tear, the hollowBoard cue).
  'hollow-boarding': { blocks: number; cause: 'trace' | 'forced' };
  'hollow-boarded': { blocks: number; cause: 'trace' | 'forced' };
  // 046.log: a boot's keys opened these entries; SCAN read its header (it reads `046.log` from now on).
  'log-key': { entries: number[] };
  'log-scanned': Record<string, never>;
  // The unit's last working rm was deleted or eaten (04 §3.3): the stamp and echo, information only.
  'last-rm-lost': Record<string, never>;

  // === Slices 4c–4e (docs/phase3/impl/slice-4cde-plan.md §2.5): the FOUNDATION named every event; each track emits its own.

  // --- 4c AUTODROP (Track DROP, systems/autodrop.ts) ---
  // [G] armed or disarmed it (`from` / `to`: null at rest), and why a pass or plan ended.
  'autodrop': { from: AutodropArm | null; to: AutodropArm | null; end: AutodropEnd | null };
  // A volley was planned for `lz`: `n` pods, the first at `firstAtTSec` (game s). Each launch plays its own podLaunch.
  'autodrop-volley': { lz: string; n: number; firstAtTSec: number };
  // Its claim found no Core thread free for `lz`'s volley (it launches late: `AUTODROP NEEDS A THREAD`).
  'autodrop-wait': { lz: string };
  // --- end of 4c ---

  // --- 4d SENTRY (Track SENTRY, systems/sentry.ts and the seed paths) ---
  // A disguised seed was unmasked: by a SCAN (`NOT A FILE`), SENTRY's boot line, or a DELETE (`IT WAS A SEED`).
  'seed-unmasked': { segId: string; by: 'scan' | 'sentry' | 'delete' };
  // SENTRY v2's DELETE on HOLLOW's outline freed the seed as it landed (`PRE-EMPTED`).
  'seed-preempted': { startAddr: number };
  // SENTRY v3 compiled a FIREWALL.sys at the boot.
  'firewall-compiled': { segId: string };
  // --- end of 4d ---

  // --- 4e ORBIT (Track ORBIT, systems/autoburn.ts) ---
  // AUTOBURN v3 lowered its landing orbit (`AUTOBURN v3 GOES LOWER — LZ-B's dot will fit`).
  'autoburn-v3-lower': { fromKm: number; toKm: number; lz: string };
  // --- end of 4e ---

  // === Slice 5 (docs/phase3/impl/slice-5-plan.md §2.5): the FOUNDATION named every event; each track emits its own.
  // 'scanned', 'op-done' (with its segId), 'skill-trained' (kind 'granted') and 'ghost-start' are reused.

  // --- 5 WARDEN (systems/resident-corrupted.ts) and KIN (the sleeper's wake) ---
  // A resident woke: a corrupted one (`surprise`: the late surprise's, with the stamp `THE SHIP'S OWN AI IS AWAKE · RACK A`),
  // or the sleeper (KIN emits 'sleeper-woken' too).
  'resident-wake': { kind: ResidentKind; name: string; surprise: boolean };
  // A lock on `pod`: telegraphed (`> LOCK POD 07 ... 3`), blocked by an op on the driver, landed, or released (a DELETE, a
  // cure or an ACCEPT frees every lock: one event per pod).
  'resident-lock': { pod: number; phase: 'telegraph' | 'blocked' | 'landed' | 'released' };
  // The resident's DEAL ended, and the file it named.
  'resident-deal': { outcome: ResidentDealOutcome; fileName: string | null };
  // Its DELETE completed (`RESIDENT DELETED`); REPAIR healed it to 100 (`RESIDENT CURED`).
  'resident-deleted': { name: string };
  'resident-cured': { name: string };
  // --- end of 5 WARDEN ---

  // --- 5 KIN (systems/resident-left.ts, systems/resident-sleeper.ts) ---
  // The sleeper woke, by an rm of its lock or a MOVE of it off the lock; it took a job.
  'sleeper-woken': { name: string; by: 'rm' | 'move' };
  'sleeper-job': { job: SleeperJob };
  // A note's signal fragment was found (`SIGNAL · n/3`: `count` signals in the run now).
  'signal-found': { slot: number; count: number };
  // A SCAN read a leftover (its card's name shows).
  'leftover-read': { segId: string };
  // --- end of 5 KIN ---

  // === Slice 6 (docs/phase3/impl/slice-6-plan.md §2.5): the FOUNDATION named every event; Track SWATH emits them
  // (systems/survey.ts). 'pod-landed' (it carries `lz` and `touch`) is reused for the touchdown reveal.

  // --- 6 SURVEY ---
  // SURVEY's state changed (the Skills row, the SITES header): mapping, waiting for a spare thread, paused, the planet mapped,
  // or off (not aboard, OFF by damage, a GOOD planet, the landing over); at the version it works at.
  'survey-state': { running: SurveyRunning; version: EffectiveVersion };
  // A site's centre cell was mapped (`first`: the ship's first find, which the TERMINAL types).
  'site-found': { siteId: string; kind: SiteKind; first: boolean };
  // v2+ rated a found site (its GROUND known).
  'site-rated': { siteId: string; ground: LzGround };
  // A bad ground an LZ stands on was made known (R5): by SURVEY's swath or by the first pod down on it (the stamp
  // `LZ-B · WET ✕`, CONTROL's reveal quip).
  'site-revealed': { lz: string; siteId: string; ground: BadGround; by: RevealBy };
  // assignSite moved an LZ from one site to another (the stamp `LZ-B → SITE 4`). Playtest 1, C-SITES: openSite opened a site
  // as a new LZ (`from` null: it stood nowhere before).
  'lz-moved': { lz: string; from: string | null; to: string };
  // --- end of 6 SURVEY ---

  // === Slice 7a (docs/phase3/impl/slice-7-plan.md §2.5): the FOUNDATION named every event; Track FINALE emits the FINALE's
  // (systems/finale.ts), Track NIGHT the epilogue's. 'finale-chosen' (above) is widened.

  // --- 7 ENDING ---
  // The root's DELETE left its last block and HOLLOW sleeps there (R6: no bites, seeds or verbs; the landing goes on).
  'finale-asleep': Record<string, never>;
  // The FINALE's card shows a step (R6, R7): step 1 as it opens (and after [ESC] BACK), step 2 after step 1's pick.
  'finale-open': { step: 1 | 2 };
  // Step 2 was confirmed ('finale-chosen' follows the apply in the same moment).
  'finale-step2': { you: YouChoice };
  // The EPILOGUE came up (Track NIGHT, components/run/Epilogue.ts: its choir, review m10), and typed its line `n` (0-based).
  'epilogue-open': Record<string, never>;
  'epilogue-line': { n: number };
  // --- end of 7 ENDING ---

  // === Slice 7b (docs/phase3/impl/slice-7-plan.md §2.5): the FOUNDATION named both; Track DROP emits them
  // (systems/last-landing.ts). 'pod-launched' and 'pod-landed' already carry source 'merge' for its pods.

  // --- 7b LAST LANDING ---
  // THE LAST LANDING started (R25, R27): this many restored pods, and who flies them (decided once at the start).
  'last-landing-start': { pods: number; flier: LastLandingState['flier'] };
  // It ended (every restored pod down, or parked): `landed`, the restored pods that came down in an LZ with room.
  'last-landing-end': { landed: number };
  // --- end of 7b LAST LANDING ---

  // === Slice 7c (docs/phase3/impl/slice-7-plan.md §2.5): the FOUNDATION named all four; Track TRACE emits the first three
  // (systems/trace-gifts.ts traceBootLineSaid, as the boot's trace lines are said), Track LINEAGE the last
  // (systems/lineage-boot.ts lineageBootLineSaid, at the face's first line).

  // --- 7c NEXT RUN ---
  // A trace's gift was given at the ship in `slot` (R32: SPARE's and SUNSET's caches, STAY's supply packet; at the final
  // ship MERGE's thread and REASSIGNMENT's allowance).
  'trace-gift': { kind: TraceKind; slot: number };
  // PURGE's wiped dish (R33): the seeds the unit carried into the final ship are gone.
  'dish-wiped': { seeds: number };
  // A non-compliant trace's wild dish (R33): the seed(s) that came in at the final boot.
  'dish-wild': { seeds: number };
  // The last unit took the final root over (R35): its unit number.
  'root-face': { unit: number };
  // --- end of 7c NEXT RUN ---

  // === Slice 7d (docs/phase3/impl/slice-7-plan.md §2.5): systems/unknown-events.ts emits it as a `▓▓░▓` file's SCAN finds
  // its fragments (after 'signal-found', which the stamp and the note's SCAN share).
  // --- 7d SIGNALS ---
  // The `▓▓░▓` file on the ship in `slot` gave `n` fragments (the signal `?` ship's 2, a CONTACT stop's 1).
  'signal-event': { slot: number; n: number };
  // --- end of 7d SIGNALS ---
}

export type ZoneForecast = 'hit' | 'clear' | 'unknown';

export type GameEventName = keyof GameEvents;

type Listener<Name extends GameEventName> = (payload: GameEvents[Name]) => void;
type AnyListener = <Name extends GameEventName>(name: Name, payload: GameEvents[Name]) => void;

const listeners = new Map<GameEventName, Set<Listener<GameEventName>>>();
const anyListeners = new Set<AnyListener>();

export function on<Name extends GameEventName>(name: Name, listener: Listener<Name>): () => void {
  let set = listeners.get(name);
  if (!set) {
    set = new Set();
    listeners.set(name, set);
  }
  const entry = listener as Listener<GameEventName>;
  set.add(entry);
  return () => { set.delete(entry); };
}

// Every event, with its name (the director's buffer and debug logging).
export function onAny(listener: AnyListener): () => void {
  anyListeners.add(listener);
  return () => { anyListeners.delete(listener); };
}

export function emit<Name extends GameEventName>(name: Name, payload: GameEvents[Name]): void {
  listeners.get(name)?.forEach((listener) => listener(payload));
  anyListeners.forEach((listener) => listener(name, payload));
}

// Event payloads with no fields, so call sites read `emit('locked', NO_PAYLOAD)`.
export const NO_PAYLOAD: Record<string, never> = Object.freeze({}) as Record<string, never>;
