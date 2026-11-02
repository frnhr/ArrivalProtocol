// Slice 3c: Track SAVE owns this file (docs/phase3/impl/slice-3c-plan.md §5.2); WORLD and UI request helpers by message.
import { createStore } from './store';
import type { GameState } from './schema';
import { createInitialState } from './initial';
import { newRunSeed } from '@systems/rng';
import { openRunArchive, archiveLineage, browserStorage } from '@systems/meta';
import { createRunMap } from '@systems/map-run';

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

// The archive is read before the store exists: the very first title already names this run's unit
// (UNIT-048 · WAVE 2 after one run) and the last one's lineage.
const archiveStatus = openRunArchive(browserStorage);

// The single global store. Components and systems import this singleton. The page opens on
// the title card; RECEIVE TRANSMISSION boots the unit and starts the flight (systems/boot).
// The page plays the galaxy map (slice 3a): the run's arm from its seed and its run number (systems/map-run.ts createRunMap,
// as NEW RUN's startRun does); the classic five stay the suites' fixture and __ap.ship's.
const seed = pickRunSeed();
const lineage = archiveLineage();
export const store = createStore<GameState>(createInitialState({
  seed,
  phase: 'title',
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  lineage,
  archive: { status: archiveStatus },
  map: createRunMap(lineage, seed),
}));
