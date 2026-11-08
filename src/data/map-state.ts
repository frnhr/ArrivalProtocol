// Slice 3c: Track WORLD owns this file (docs/phase3/impl/slice-3c-plan.md §5.1); SAVE and UI request changes by message.
import type { MapHistory } from '@/types/lineage';

// The run map's own shape (types/map.ts RunMapState; slice 3c plan §1.4, the 3a F2 note "a version field on the map"):
// a leaf module, so the map's makers (systems/map-run.ts), the save codec and the suites' literals read one constant.

// Bump when RunMapState gains, loses or reinterprets a field: the run save (systems/save-codec.ts) and the archive's arm
// refuse a map of another shape loudly instead of reading it half.
export const MAP_STATE_VERSION = 1;

// Nothing before this run (run 1, a suite's map). Frozen: a map that wants its own history clones it
// (structuredClone), so a literal that shares this one can never be written through by accident.
export const EMPTY_HISTORY: MapHistory = Object.freeze({
  gap: 0,
  valveYears: 0,
  finalSerial: 0,
  lastUnitNumber: null,
  departures: Object.freeze([]) as unknown as MapHistory['departures'],
  colonies: Object.freeze([]) as unknown as MapHistory['colonies'],
  routes: Object.freeze([]) as unknown as MapHistory['routes'],
});
