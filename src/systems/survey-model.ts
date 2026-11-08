// Slice 6: Track SWATH owns this file (docs/phase3/impl/slice-6-plan.md §2.1, §2.8, §6.2). The FOUNDATION wrote the final
// signatures as neutral stubs (plan §6.1 item 6): the UI may call any of them on every paint. Others ask by message.
// SURVEY's pure rules: the cells a tick sweeps, a site's ★, why a site can't take an LZ, the LZs a site can take, the swap
// the strip offers. No module state, no store. (mappedPct is state/survey-selectors.ts's: the ship's record needs it.)
import type { GameState } from '@state/schema';
import type { SurveySite, AssignRefusal } from '@/types/survey';

// The cells (indices into survey.mapped, SURVEY_CELL_DEG each from 0 rad) whose centre lies within the arc the ship swept
// from `fromRad` to `toRad` going `dir` (1 CCW, −1 CW), widened by ±`swathRad` (plan §2.8 step 3; a wrap through 0 and a
// long SKIP's whole turn included). FOUNDATION stub (neutral): none.
export function sweptCells(fromRad: number, toRad: number, dir: 1 | -1, swathRad: number): number[] {
  void fromRad;
  void toRad;
  void dir;
  void swathRad;
  return [];
}

// A site's rating (R11): 3 ★★★ FLAT and not NARROW, 2 ★★ FLAT NARROW, 1 ★ ROCKY or WET, 0 a wreck (no stars). Read only once
// its ground is known. FOUNDATION stub (neutral): 0.
export type SiteStars = 0 | 1 | 2 | 3;

export function siteStars(site: Readonly<SurveySite>): SiteStars {
  void site;
  return 0;
}

// Why the site `siteId` can't take the LZ `lz` now, or null when it can (R10, in the order of AssignRefusal's words:
// SURVEY closed, not found, a wreck, too small, another LZ's, pods down, a pod falling, its window open, the landing over,
// the site it is on). FOUNDATION stub (neutral): 'closed'.
export function assignRefusal(state: Readonly<GameState>, lz: string, siteId: string): AssignRefusal | null {
  void state;
  void lz;
  void siteId;
  return 'closed';
}

// Every LZ with what assignRefusal says for the site `siteId`, in label order: the SITES window's pill row (`SET AS LZ-B
// (800)` for a null refusal, the refusal dimmed otherwise). FOUNDATION stub (neutral): none.
export function assignableLzs(state: Readonly<GameState>, siteId: string): { lz: string; refusal: AssignRefusal | null }[] {
  void state;
  void siteId;
  return [];
}

// The best site to move the LZ `lz` to when its ground is known bad (R22's strip row): a FLAT found site with ROOM for it that
// assignRefusal allows, widest first. null: none. FOUNDATION stub (neutral): null.
export function bestSwap(state: Readonly<GameState>, lz: string): string | null {
  void state;
  void lz;
  return null;
}
