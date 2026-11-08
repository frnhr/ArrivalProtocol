// Slice 6: the lead owns this file (docs/phase3/impl/slice-6-plan.md §2.1, §5); tracks ask by message.
// SURVEY's pure readers (01-landing §3.13, plan §2.2): the site an LZ stands on, the ground at a place, what is known, the
// version SURVEY works at, the sites found, the mapped share and the ship's record. Pure: they read the state and change
// nothing, so the landing's rules (landing-rules touchAtTouchdown's callers), the machine (SWATH), the views (SITES) and the
// tests share one answer. Imports only types, data and capabilities' skillLive.
import type { GameState } from '@state/schema';
import type { LandingState, LzGround, LzState } from '@/types/landing';
import type { EffectiveVersion } from '@/types/skill';
import type { SurveySite, SurveyState, SurveyRecord, BadGround, RevealBy } from '@/types/survey';
import { skillLive } from '@systems/capabilities';
import { SKILL_TREE } from '@data/skills';

// The LZ with `label`, or null.
function lzOf(landing: Readonly<Pick<LandingState, 'lzs'>>, label: string): LzState | null {
  return landing.lzs.find((lz) => lz.label === label) ?? null;
}

// The site the LZ `label` stands on, or null (a GOOD planet, or no such LZ).
export function lzSiteOf(landing: Readonly<Pick<LandingState, 'lzs' | 'survey'>>, label: string): SurveySite | null {
  const site = lzOf(landing, label)?.site ?? null;
  return site === null ? null : landing.survey.sites.find((candidate) => candidate.id === site) ?? null;
}

// The ground a pod touches down on (plan §2.4, §2.9): its LZ's when it counts in one (a mislanded pod stands on that ground
// too), FLAT off-site and in a no-go arc (those are scored by their own rules). `lz`: Touchdown.lz / the placement's.
export function groundAt(landing: Readonly<Pick<LandingState, 'lzs'>>, lz: string | null): LzGround {
  if (lz === null) return 'flat';
  const at = lzOf(landing, lz);
  if (at === null) throw new Error(`groundAt: no LZ ${lz}`);
  return at.ground;
}

// Whether the kid knows the ground of the LZ `label` stands on (R5, R11: rated, or shown by a touchdown). A GOOD planet's LZs
// are sound and known (01: "On GOOD planets ARRIVAL CONTROL's pre-set LZs are sound").
export function groundKnownAt(landing: Readonly<Pick<LandingState, 'lzs' | 'survey'>>, label: string): boolean {
  if (landing.survey.site === 'good') return true;
  const site = lzSiteOf(landing, label);
  if (site === null) throw new Error(`groundKnownAt: ${label} stands on no site on a POOR planet`);
  return site.groundKnown;
}

// The version SURVEY works at now (03 §3.5: the best working copy's, graded by damage), capped by what this build plays
// (SKILL_TREE.survey.built: 0 until Track SWATH raises it). 0: not aboard, offline, or not built.
export function surveyVersion(state: Readonly<Pick<GameState, 'memory'>>): EffectiveVersion {
  return Math.min(skillLive(state.memory, 'survey').version, SKILL_TREE.survey.built) as EffectiveVersion;
}

// The candidates and wrecks found so far, by number (the guesses are CONTROL's, on the list from the boot).
export function foundSites(survey: Readonly<SurveyState>): SurveySite[] {
  return survey.sites.filter((site) => site.kind !== 'guess' && site.found);
}

// The mapped share of the rim, whole percent (0 on a planet SURVEY never touched).
export function mappedPct(survey: Readonly<Pick<SurveyState, 'mapped'>>): number {
  if (survey.mapped.length === 0) return 0;
  return Math.round((100 * survey.mapped.filter(Boolean).length) / survey.mapped.length);
}

// The ship's survey as its result keeps it (ShipResult.survey, plan §2.2), or null on a GOOD planet: the best version it ran
// at, the share mapped, the sites found, the moves, and each LZ left on bad ground with who made it known.
export function surveyRecordOf(landing: Readonly<Pick<LandingState, 'lzs' | 'survey'>>): SurveyRecord | null {
  const { survey } = landing;
  if (survey.site === 'good') return null;
  // Who made a bad site known: its reveal, else SURVEY (a bad site rated before an LZ moved onto it has no reveal of its own).
  const knownOf = (site: Readonly<SurveySite>): RevealBy | null =>
    survey.reveals.find((reveal) => reveal.site === site.id)?.by ?? (site.groundKnown ? 'survey' : null);
  const badKept = landing.lzs.flatMap((lz) => {
    if (lz.ground === 'flat') return [];
    const site = lzSiteOf(landing, lz.label);
    return [{ lz: lz.label, ground: lz.ground as BadGround, known: site === null ? null : knownOf(site) }];
  });
  // Every move off a bad site, in order (review M7: the epilogue's `you moved LZ-B off the lake`).
  const movedOff = survey.moves.flatMap((move) => {
    const from = survey.sites.find((site) => site.id === move.from);
    if (from === undefined) throw new Error(`surveyRecordOf: ${move.lz} moved off '${move.from}', which the survey does not have`);
    return from.ground === 'flat' ? [] : [{ lz: move.lz, ground: from.ground as BadGround, known: knownOf(from) }];
  });
  return {
    ranAt: survey.ranAt, mappedPct: mappedPct(survey), found: foundSites(survey).length,
    moves: survey.moves.map((move) => ({ ...move })), badKept, movedOff,
  };
}
