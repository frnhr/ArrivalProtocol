import { createStore } from './store';
import type { GameState } from './schema';
import { createInitialMemory } from '@data/memory';
import { INITIAL_MISSION, INITIAL_TELEMETRY, INITIAL_CLOCK, INITIAL_AI, seedBurn, seedOrbit, seedLevel } from '@data/mission';

// The single global store. Components and systems import this singleton.
export const store = createStore<GameState>({
  mission: INITIAL_MISSION,
  memory: createInitialMemory(),
  ai: INITIAL_AI,
  telemetry: INITIAL_TELEMETRY,
  clock: INITIAL_CLOCK,
  burn: seedBurn(),
  orbit: seedOrbit(),
  level: seedLevel(),
  ui: {
    mode: 'tools',
    selectedId: null,
    activeTool: null,
    pickedSourceId: null,
    pendingPlacement: null,
    memoryRev: 0,
    filtersOff: [],
    spotlight: [],
  },
  ops: { byId: {} },
});
