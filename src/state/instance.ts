import { createStore } from './store';
import type { GameState } from './schema';
import { createInitialMemory } from '@data/memory';
import { INITIAL_MISSION, INITIAL_TELEMETRY, INITIAL_CLOCK, INITIAL_AI } from '@data/mission';

// The single global store. Components and systems import this singleton.
// Legacy code holds a direct reference to state.memory and mutates it in place,
// then calls store.notify() to re-evaluate subscriber selectors.
export const store = createStore<GameState>({
  mission: INITIAL_MISSION,
  memory: createInitialMemory(),
  ai: INITIAL_AI,
  telemetry: INITIAL_TELEMETRY,
  clock: INITIAL_CLOCK,
  ui: {
    mode: 'tools',
    selectedId: null,
    activeTool: null,
    pickedSourceId: null,
    pendingPlacement: null,
  },
  ops: { byId: {} },
});
