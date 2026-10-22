import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { getByRole, hasIntegrity } from '@state/selectors';
import { setIntegrity } from '@state/actions';
import { getPrediction } from '@systems/predict';
import { emit } from '@systems/events';
import { FILE_FAULTS, type FileFault } from '@data/script';

// Scripted file damage (§5.1): the ship-1 ENGINE I/O FAULT and its kind. A fault strikes the
// best live copy of its role once, after the engine has delivered thrust for afterThrustTac
// tactical seconds on that ship. It runs on world ticks, so a pause holds it back (no ticks) and
// a SKIP can never fire it unseen (thrust holds the pace at TACTICAL). DOM-free: the crunch, the
// shake and the pip flash hang off its 'file-fault' event.
//
// It also waits out a crash course: a beat must never cost the flight. A kid who starts the
// opening OUT burn late clears the planet with a healthy engine but not at 40%, so the fault
// strikes on the first tick the TRUE path is off the planet (for a kid who burns at once that is
// still ~1 s before the 2.0 s mark, so nothing changes for them).

function strike(store: Store<GameState>, fault: FileFault): void {
  const file = getByRole(store.getState(), fault.role);
  const target = file && hasIntegrity(file) ? file : null;
  const from = target ? target.integrity : null;
  store.update((draft) => {
    if (target && target.integrity > fault.toIntegrity) setIntegrity(target, fault.toIntegrity);
    draft.director.done.push(fault.id);
    draft.ui.memoryRev++;
  });
  if (target && from !== null && from > fault.toIntegrity) emit('file-fault', { role: fault.role, from, to: fault.toIntegrity });
}

let mounted = false;

// Mount after orbit-sim: each tick reads the thrust that tick delivered (burn.thrustTac).
export function mountFaults(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountFaults: already mounted');
  mounted = true;
  const offTick = onGameTick(() => {
    const state = store.getState();
    if (state.burn.status !== 'approaching') return;
    for (const fault of FILE_FAULTS) {
      if (fault.shipIndex !== state.run.shipIndex || state.director.done.includes(fault.id)) continue;
      if (state.burn.thrustTac < fault.afterThrustTac || getPrediction().outcome === 'impact') continue;
      strike(store, fault);
    }
  });
  return () => { offTick(); mounted = false; };
}
