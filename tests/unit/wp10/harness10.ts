// WP10 headless harness: the WP9 harness (every DOM-free system through the run, the zones and AUTOBURN; the WP1 base
// now also mounts the ghost-thrust system and the WP6 one THE DEAL) plus VESPER on its own and a VESPER-aware kid:
// • vesper(seed, opts): ship 4 alone, in flight, a fresh unit carried in (no transit hits); its Thrust Ctrl is built at
//   31% (the ship's own file), so the engine fires by itself from the first tick;
// • pipSwap(): what the strip's two-step lesson asks of a kid, done by the book: the THRUST CTRL pip (it jumps to the
//   MIND and selects the file), SWAP picked up, the file clicked, and back to the ship (TAB);
// • defend10(): the WP9 defender (REPAIR bites, MOVE souls behind a WALL, REPAIR a blind sensor, DELETE seeds that can
//   bite) plus the pip → SWAP the moment the lesson's first step stands on the strip.
// One harness per test file (systems are module singletons).
import { createHarness9, type Harness9 } from '../wp9/harness9';
import { followDirector } from '../wp2/harness2';
import { setMode } from '@systems/mode';
import { pickUpTool, applyTool, cancelTool } from '@systems/fs-tools';
import { getByRole } from '@state/selectors';
import { capabilitiesNow } from '@systems/capabilities';
import { getOps, canStartOp } from '@systems/ops-core';
import { resetWorld } from '@systems/reset';
import { createInitialState } from '@state/initial';
import { createRunMap } from '@systems/map-run';
import { mapAlong, nominalAlong, workedRouteTo, authoredSlot } from '@systems/arm-fixture';
import { giveTools } from '../map/repo-fixture';
import type { ShipThreat } from '@/types/threat';
import type { FsToolKind } from '@/types/fs-tool';
import { phase2HollowOf } from '../support/hollow-world';

export const VESPER = 3;

export interface VesperOpts {
  // Tool files given on top (written and licensed: repo-fixture giveTools), the arm's way to hand a suite the SWAP its lesson
  // needs (Track RETIRE: the classic schedule licensed SWAP at the first burst; 03 §6 retired it, the arm's comes by request).
  tools?: readonly FsToolKind[];
  // The worked route's tools by VESPER (harness7 shipAlone's `kit`; the arm only).
  kit?: boolean;
  // HOLLOW put to sleep for good (a flight suite measures the flight, not the fight).
  hollowAsleep?: boolean;
  // Phase 3 slice 2: VESPER as phase 2 had it, HOLLOW's HUNT stage (seeds next to your tools, THE DEAL, a 14-block
  // root), with the receiver's hunting ground; the fixed five no longer reach that stage (VESPER plays ARRIVAL + WALLS).
  hunt?: boolean;
}

// Phase 2's VESPER verdict: HOLLOW's HUNT stage aboard with a 14-block root (what `hunt` builds the ship with), on the facts of
// run 1's arm VESPER on the worked route (map-facts: depth 4, the hop from KESTREL).
export function huntVerdict(seed = 1): ShipThreat {
  const slots = workedRouteTo(authoredSlot(VESPER));
  const facts = nominalAlong(mapAlong(createRunMap({ wave: 1 }, seed), slots), slots).verdict;
  return { ...facts, act: 'hollow', stage: 'hunt', folded: [], hollow: phase2HollowOf(VESPER), rootBlocks: 14 };
}

export interface Harness10 extends Harness9 {
  vesper: (seed: number, opts?: VesperOpts) => void;
  // The kid follows the ghost lesson: pip → SWAP → back to the ship. True when a SWAP started.
  pipSwap: () => boolean;
  defend10: () => boolean;
  flyDefending10: (maxWall: number) => string[];
}

export function createHarness10(seed = 1, opts: { soulsFound?: boolean } = {}): Harness10 {
  const base = createHarness9(seed, opts);
  const state = () => base.store.getState();

  const pipSwap = (): boolean => {
    const now = state();
    if (now.clock.paused || !now.run.licences.includes('swap') || capabilitiesNow(now).thrustCtrl.ghost === null) return false;
    if (getOps().some((operation) => operation.kind === 'swap') || !canStartOp()) return false;
    const file = getByRole(now, 'thrust-ctrl');
    if (!file) throw new Error('harness10.pipSwap: no Thrust Ctrl');
    // The pip: the MIND, the file selected (WindowGrip's click does exactly this).
    setMode(base.store, 'memory');
    base.store.update((d) => { d.ui.selectedId = file.id; });
    pickUpTool(base.store, 'swap');
    applyTool(base.store, file, { ask: () => { throw new Error('harness10.pipSwap: SWAP asked a question'); } });
    const started = getOps().some((operation) => operation.kind === 'swap');
    cancelTool(base.store);
    setMode(base.store, 'tools');
    return started;
  };

  const defend10 = (): boolean => {
    let acted = base.defend9();
    const shown = state().director.shown?.id ?? '';
    if ((shown === 'tut-ghost-pip' || shown === 'tut-ghost-swap') && pipSwap()) acted = true;
    return acted;
  };

  return {
    ...base,
    vesper(nextSeed, vesperOpts = {}) {
      base.shipAlone(VESPER, nextSeed, { kit: vesperOpts.kit ?? false });
      if (vesperOpts.hunt) {
        // Run 1's arm VESPER with the HUNT verdict: the fresh unit laid out for it over the hop from KESTREL (its root in the
        // slot, the seeds' hunting ground), and the tools phase 2's VESPER fought it with (the worked route's MOVE and
        // DELETE, and the COPY and SWAP phase 2's schedule licensed there; the arm's come by request).
        const threat = huntVerdict(nextSeed);
        const fresh = createInitialState({ seed: nextSeed, shipIndex: VESPER, carried: 'fresh', threat });
        fresh.director.done = [...base.store.getState().director.done];
        base.store.update((d) => { Object.assign(d, fresh); });
        resetWorld();
        // They arrive on this ship (as phase 2's ship alone's licences did, and as a delivery's first of its kind does):
        // HOLLOW spares each until it is used (untriedTools).
        giveTools(base.store, ['move', 'delete', 'copy', 'swap']);
        base.store.update((d) => {
          for (const kind of ['move', 'delete', 'copy', 'swap'] as const) if (!d.hollow.untriedTools.includes(kind)) d.hollow.untriedTools.push(kind);
        });
      }
      if (vesperOpts.tools !== undefined) giveTools(base.store, vesperOpts.tools);
      if (vesperOpts.hollowAsleep) base.store.update((d) => { d.hollow.phase = 'dormant'; });
      base.events.length = 0;
    },
    pipSwap,
    defend10,
    flyDefending10(maxWall) {
      return followDirector(base, { reactionSec: 0.4, maxWall, mistake: () => { defend10(); return false; } });
    },
  };
}
