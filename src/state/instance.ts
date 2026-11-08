// Slice 3c: Track SAVE owns this file (docs/phase3/impl/slice-3c-plan.md §5.2); WORLD and UI request helpers by message.
import { createStore } from './store';
import type { GameState } from './schema';
import { newRunSeed } from '@systems/rng';
import { browserStorage } from '@systems/storage';
import { openPageStorage, pageTitleState } from '@systems/run-save';

// The run seed is the one entropy source of a run (every game roll is a child stream of
// it). `?seed=N` pins it so a screenshot or a bug report replays the same run.
function pickRunSeed(): number {
  const param = new URLSearchParams(window.location.search).get('seed');
  if (param !== null) {
    const seed = Number(param);
    if (!Number.isInteger(seed)) throw new Error(`?seed=${param} is not an integer`);
    return seed >>> 0;
  }
  return newRunSeed();
}

// The run seed first (slice 3c): a fresh archive takes it as its arm seed, so `?seed=N` on a cleared archive replays run 1.
const seed = pickRunSeed();

// The archive and the run save are read before the store exists (systems/run-save.ts openPageStorage: the page's open
// sequence, slice 3c plan §2.2): the very first title already names this run's unit (UNIT-048 · WAVE 2 after one run) and
// the last one's lineage, or offers the saved run (RESUME).
const save = openPageStorage(browserStorage, seed);

// The single global store. Components and systems import this singleton. The page opens on
// the title card; RECEIVE TRANSMISSION boots the unit and starts the flight (systems/boot), RESUME the saved run
// (systems/run-save.ts resumeRun).
// The page plays the galaxy map (slice 3a): the run's arm from its seed and its run number (systems/map-run.ts createRunMap,
// as NEW RUN's startRun does).
export const store = createStore<GameState>(pageTitleState(seed, save, window.matchMedia('(prefers-reduced-motion: reduce)').matches));
