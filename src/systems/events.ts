import type {
  FiringSource, ViewMode, TransitHit, AutoburnPhase, AutoburnEnd, DealOutcome, VerbKind,
} from '@state/schema';
import type { DragKick, LandingEnd, LaunchSource, Place, Touch } from '@/types/landing';
import type { SegmentRole, InfectionSide } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import type { LineState } from '@systems/flight-events';
import type { OpKind } from '@systems/ops-core';
import type { PlotMode } from '@systems/capabilities';

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
  // out. Cancelled and aborted ops say nothing.
  'op-done': { kind: OpKind; result: 'done' | 'no-charge' };
  'ui-click': Record<string, never>;
  // WP4. ARRIVAL CONTROL installed a licensed tool's files (transmitIn, chime, the chip slides in).
  'licence': { kind: FsToolKind };
  // A scripted fault hit a file (ship 1's ENGINE I/O FAULT): its integrity fell from → to.
  'file-fault': { role: SegmentRole; from: number; to: number };
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
  'pod-landed': { pod: number; place: Place; lz: string | null; touch: Touch; points: number; firstOnShip: boolean; firstOfRun: boolean };
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
  // `scripted`: ship 1's one scripted bite (the story's), not one HOLLOW chose.
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
  // WP7: HOLLOW said who it is (HALCYON, `> i was 046.`): every hollow block now carries `name`.
  'hollow-named': { name: string };
  // WP7 part 2: the name flip was seen (in blue: at once, or on the kid's first look), so its sound
  // plays with the picture (like 'crack-shown').
  'hollow-name-shown': { name: string };
  // The boot typed its ECC line after a transmission: these hits (and the ship's own arrival damage) are
  // what the crossing did, in order. The strip flashes each file red (components/run/ArrivalFlash).
  'arrival-hits': { hits: readonly TransitHit[] };
  // BEAM OUT started (the TRANSMITTING bar), was cancelled, or filled ('abandoned' is the flight's end).
  'beam-out-start': Record<string, never>;
  'beam-out-cancel': Record<string, never>;
  // WP8: a write to the archive failed mid-run: from now on this unit is not kept (systems/meta.ts). The game
  // says so once (a TERMINAL line and a buzz); the footer's tag stays.
  'archive-lost': Record<string, never>;
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
  // WP9: AUTOBURN.skl was trained at this boot from the kid's captures (installed, or retrained with more).
  'skill-trained': { demos: number; accuracy: number; retrained: boolean };
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
  'finale-chosen': { choice: 'purge' | 'merge'; restoredInPlace: number; restoredHalf: number };
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
