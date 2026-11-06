// Slice 4c, Track DROP: an arm ship in orbit for the AUTODROP suites (plan §8.1: the landing harness on an arm ship). Run 1's
// arm walked desk to desk with no flights (map/repo-fixture send: endShip, the desk, the real PACKET and TRANSMIT), the
// target ship's boot played on the harness's clock, then a constructed lock (landing/harness-landing lockOn): no capture
// is flown, so a suite reaches a ship's landing in a second or two. HOLLOW sleeps for good and the driver lessons are met,
// so the strip shows the landing's own rows.
import type { GameState } from '@state/schema';
import type { SkillVersion } from '@/types/skill';
import type { Harness7 } from '../wp7/harness7';
import { startRun } from '@systems/run';
import { receiveTransmission } from '@systems/boot';
import { lockOn } from '../landing/harness-landing';
import { send } from '../map/repo-fixture';
import { giveSkillFile } from '../support/skills';
import { setLandingMode } from '../support/landing-instant';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { DRIVER_RULES } from '@data/script';

export const ARM_SEED = 3;

// Run 1's arm ships the AUTODROP suites land on, by slot (map/run1-fixture's worked route).
export const ARM = { ARES: 0, HALCYON: 2, KESTREL: 5, VESPER: 11, CORMORANT: 15 } as const;

// The lessons and beats that would take the strip from the landing's rows on a ship reached without its earlier ones.
const QUIET = [...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks'];

export interface ArmLandingOpts {
  autodrop?: SkillVersion | null;   // AUTODROP's file at this version (default v1), null: none
  demos?: readonly number[];        // the kid's drop demos (tac s); default none (UNTRAINED)
  healDrivers?: boolean;            // every driver at 100 (default true): the arrival damage's wider dots aside
  healInstruments?: boolean;        // Sensor Interp, Nav Plotter and Bay Ctrl at 100 (default false: the ship's own damage)
  r?: number;                       // the lock's radius (default the ring's middle)
  keepSeeds?: boolean;              // keep the beam's seeds in memory (default: freed)
}

// The harness on `route`'s last ship, locked in orbit and landing. `route` starts at slot 0.
export function armLanding(h: Harness7, route: readonly number[], opts: ArmLandingOpts = {}): void {
  setLandingMode('manual');
  h.newRun(ARM_SEED);
  startRun(h.store, ARM_SEED, FIRST_RUN_LINEAGE, 'arm');
  if (!receiveTransmission(h.store)) throw new Error('armLanding: not on the title');
  h.stepUntil(() => h.store.getState().run.phase === 'flight', 30);
  for (const slot of route.slice(1)) {
    h.store.update((draft) => { draft.run.phase = 'report'; });
    send(h.store, slot);
    h.stepUntil(() => h.store.getState().run.phase === 'flight', 40);
  }
  if (h.store.getState().run.phase !== 'flight') throw new Error(`armLanding: stuck in ${h.store.getState().run.phase}`);
  h.store.update((draft) => {
    draft.hollow.phase = 'dormant';
    draft.director.done.push(...QUIET);
    if (draft.landing.finalShip) draft.hollow.finale.phase = 'purged';
    for (const seg of draft.memory) {
      if (seg.role === 'thrust-ctrl' && 'integrity' in seg) seg.integrity = 100;
      if (opts.healDrivers !== false && seg.type === 'driver') seg.integrity = 100;
      if (opts.healInstruments === true && (seg.role === 'sensor' || seg.role === 'navplot' || seg.role === 'bay') && 'integrity' in seg) seg.integrity = 100;
    }
    draft.run.stats.dropDemos = (opts.demos ?? []).map((offsetTac) => ({ offsetTac }));
    // The beam's seeds go (their alerts and the strip's seed lines would lead the MIND's strip): this is AUTODROP's suite.
    if (opts.keepSeeds !== true) {
      draft.memory = draft.memory.map((seg) => (seg.type === 'hollow' ? freeSegment(seg.size) : seg));
      mergeAdjacentFree(draft.memory);
    }
    draft.ui.memoryRev++;
  });
  const version = opts.autodrop === undefined ? 1 : opts.autodrop;
  if (version !== null) giveSkillFile(h.store, 'autodrop', version);
  lockOn(h, opts.r === undefined ? {} : { r: opts.r });
  if (h.store.getState().run.phase !== 'landing') throw new Error('armLanding: the lock did not begin the landing');
}

export const st = (h: Harness7): Readonly<GameState> => h.store.getState();
