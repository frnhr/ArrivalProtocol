import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { getByRole, hasIntegrity } from '@state/selectors';
import { setIntegrity } from '@state/actions';
import { emit } from '@systems/events';
import { FILE_FAULTS, type FileFault } from '@data/script';

// Scripted file damage (§5.1): the ship-1 ENGINE I/O FAULT and its kind. Playtest 1 (C-UNROLL, plan §3.5, OPEN-DECISIONS
// 139): the fault is arrival damage. It happened while the unit slept, and the boot's SELF-CHECK finds it at its SHIP stage
// (systems/boot.ts calls findFault as the check reaches the engine), so the first burn never meets a surprise crunch: the
// ENGINE WEAK lesson comes first, against the IMPACT clock. A 38% engine still clears the opening crash course when the burn
// starts in the first ~140 s of a 163 s fall (tests/unit/wp4/fix1-review), so the pressure stays and no flight is lost to it.
// A world that starts its flight with no boot (the headless suites' `resetTo('flight')`, `__ap` jumps) still meets the
// damage: the first world tick finds it. DOM-free: the SELF-CHECK's tag and the 'faultFound' tone hang off its 'file-fault'
// event (found: true), and so does the SHIP-side pip's flash.

// The fault found on its file now: the integrity falls to the fault's (a file already lower keeps its own), and its id goes
// into director.done like a beat's. Returns the file's id, or null when the ship has no live copy of the role.
export function findFault(store: Store<GameState>, fault: FileFault): string | null {
  const file = getByRole(store.getState(), fault.role);
  const target = file && hasIntegrity(file) ? file : null;
  const from = target ? target.integrity : null;
  store.update((draft) => {
    if (target && target.integrity > fault.toIntegrity) setIntegrity(target, fault.toIntegrity);
    draft.director.done.push(fault.id);
    draft.ui.memoryRev++;
  });
  if (target && from !== null && from > fault.toIntegrity) emit('file-fault', { role: fault.role, from, to: fault.toIntegrity, found: true });
  return target?.id ?? null;
}

// The faults this ship arrives with that nothing has found yet (the SELF-CHECK plans its SHIP stage from it).
export function faultsDue(state: Readonly<GameState>): FileFault[] {
  return FILE_FAULTS.filter((fault) => fault.shipIndex === state.run.shipIndex && !state.director.done.includes(fault.id));
}

let mounted = false;

export function mountFaults(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountFaults: already mounted');
  mounted = true;
  const offTick = onGameTick(() => {
    const state = store.getState();
    if (state.burn.status !== 'approaching') return;
    for (const fault of faultsDue(state)) findFault(store, fault);
  });
  return () => { offTick(); mounted = false; };
}
