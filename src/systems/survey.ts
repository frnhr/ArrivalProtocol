// Slice 6: Track SWATH owns this file (docs/phase3/impl/slice-6-plan.md §2.1, §2.8, §6.2). The FOUNDATION wrote the final
// signatures: the hot-path stubs answer neutrally and never throw; the entry points that change state throw through
// not-built.ts until SWATH builds them (plan §6.1 item 6). Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { AssignRefusal, SurveyRecord, SurveyState } from '@/types/survey';
import type { EffectiveVersion } from '@/types/skill';
import { releaseThread } from '@systems/ops-core';
import { surveyRecordOf, surveyVersion, mappedPct } from '@state/survey-selectors';
import { notBuilt } from '@systems/not-built';

// The survey machine (01-landing §3.13, 03-skills §3.9; plan §2.8): it maps the swath under the ship from the first flight
// tick after the boot, finds and rates the sites, holds a yieldable Core thread at v1–v2 (R8), and moves an LZ onto a site
// the kid picks (assignSite). All its state is state.landing.survey (plan §2.3: no module state; whether it holds a thread
// is `claimed`, reconciled each tick with ops-core holdsThread(SURVEY_THREAD_OWNER)).

// Its Core thread's owner (ops-core reserveThread(SURVEY_THREAD_OWNER, { yieldable: true })).
export const SURVEY_THREAD_OWNER = 'survey';

// Mounted by main.ts right after mountResidents (and by tests/unit/wp6/harness6.ts), after the landing and the ops core.
// Built by the FOUNDATION as a no-op: SWATH adds its tick (onGameTick) and its watchers (the touchdown reveal on
// 'pod-landed') here. Returns the unmount.
export function mountSurvey(store: Store<GameState>): () => void {
  void store;
  return () => {};
}

// Moves the LZ `lz` onto the site `siteId` (R10): survey-model.ts assignRefusal first (its refusal is returned and nothing
// changes), then in one update the LZ takes the site's centre, half-width, widthKm, ground and id, sitesRev and moves grow,
// and 'lz-moved' is emitted. Called by the SITES window's pill and __ap.survey.set. Changes state: throws until SWATH.
export function assignSite(store: Store<GameState>, lz: string, siteId: string): AssignRefusal | null {
  return notBuilt('assignSite', 'SWATH', store, lz, siteId);
}

// The SITES header's [ PAUSE ] / [ RESUME ] (R7): flips survey.paused; the tick releases or claims the thread. Changes state:
// throws until SWATH.
export function toggleSurveyPause(store: Store<GameState>): void {
  notBuilt('toggleSurveyPause', 'SWATH', store);
}

// The ship is ending (run.ts endShip, after the landing's tally, before residentShipEnd; plan R20): the machine at rest
// (its thread released, `claimed` false, `lastRad` null: the codec reads SHIP DONE's slice so), and the ship's record (null
// on a GOOD planet). Built by the FOUNDATION (the record is state/survey-selectors.ts surveyRecordOf's).
export function surveyShipEnd(store: Store<GameState>): SurveyRecord | null {
  releaseThread(SURVEY_THREAD_OWNER);
  const { survey } = store.getState().landing;
  if (survey.claimed || survey.lastRad !== null) {
    store.update((draft) => {
      draft.landing.survey.claimed = false;
      draft.landing.survey.lastRad = null;
    });
  }
  return surveyRecordOf(store.getState().landing);
}

// The Skills row's status (skills.ts SKILL_ROW_HOOKS.survey; words in data/swath-text.ts SWATH_TEXT.status): `MAPPING 46% ·
// HOLDS A THREAD`, `WAITS FOR A SPARE THREAD`, `PAUSED · 46%`, `DONE · 6 SITES`, `SITE DATA GOOD · IDLE`; null when SURVEY
// is not aboard (the plain row then). Read every tick. FOUNDATION stub (hot path, neutral): null.
export function surveyStatus(state: Readonly<GameState>): { text: string; tone: 'good' | 'warn' } | null {
  void state;
  return null;
}

// --- Debug bodies (debug.ts __ap.survey; the lead owns the hooks, plan §2.15) -----------------------------------------------

// __ap.survey(): what the machine holds, as data. Built (pure).
export interface SurveyDebug {
  site: SurveyState['site'];
  sites: SurveyState['sites'];
  mappedPct: number;
  paused: boolean;
  claimed: boolean;
  ranAt: EffectiveVersion;
  moves: SurveyState['moves'];
  reveals: SurveyState['reveals'];
  version: EffectiveVersion;
}

export function surveyDebug(state: Readonly<GameState>): SurveyDebug {
  const survey = structuredClone(state.landing.survey);
  return {
    site: survey.site, sites: survey.sites, mappedPct: mappedPct(survey), paused: survey.paused, claimed: survey.claimed, ranAt: survey.ranAt,
    moves: survey.moves, reveals: survey.reveals, version: surveyVersion(state),
  };
}

// __ap.survey.map(pct): marks cells from the ship's angle onward until `pct` of the rim is mapped, and finds and rates as the
// tick would. Changes state: throws until SWATH.
export function mapNow(store: Store<GameState>, pct: number): void {
  notBuilt('mapNow', 'SWATH', store, pct);
}
