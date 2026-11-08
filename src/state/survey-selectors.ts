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

// A site the kid can see (review A4: the one rule the SITES window, assignRefusal and bestSwap share): CONTROL's guesses are
// on the list from the boot, every other site once the swath found it.
export function siteVisible(site: Readonly<Pick<SurveySite, 'kind' | 'found'>>): boolean {
  return site.kind === 'guess' || site.found;
}

// The LZ standing on the site `siteId`, by its label, or null (review A4: the machine's reveal, 'taken', the SITES window).
export function lzOnSite(landing: Readonly<Pick<LandingState, 'lzs'>>, siteId: string): string | null {
  return landing.lzs.find((lz) => lz.site === siteId)?.label ?? null;
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

// The candidates found so far: the sites an LZ could move to, so the wreck is left out (review m3: `PLANET MAPPED · 4 SITES`
// on CORMORANT, whose fifth find is a wreck no LZ can take).
export function candidatesFound(survey: Readonly<SurveyState>): number {
  return survey.sites.filter((site) => site.kind === 'candidate' && site.found).length;
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

// One LZ's net outcome over the ship, read from its record alone (review m5, A1; the record's shape is unchanged): where it
// ended against its own guess, and the ground it started and ended on. The SHIP CARD's `POOR · LZ-B MOVED` and slice 7's
// epilogue (`RIVERSIDE stayed dry: you moved LZ-B off the lake`) read it, not the raw moves: a move away and back is no move.
export interface SurveyNetOutcome {
  lz: string;
  endedSite: string | null;          // the site it ended on; null: it never moved (its own guess)
  moved: boolean;                    // it ended off its own guess
  groundBefore: LzGround | null;     // its guess's ground; null when the record can't tell (see below)
  groundAfter: LzGround;
  knownBefore: RevealBy | null;      // who made a bad guess known before the LZ left it (null: moved off blind, or FLAT)
  knownAfter: RevealBy | null;       // who made the bad ground it ended on known (null: nobody, or FLAT)
}

// Every LZ the record says anything about (a move, or bad ground kept), by label; an LZ that never moved and stood on FLAT
// has no entry (nothing happened to it, and the record does not list it).
// • After: `badKept` names every LZ left on bad ground, so any other LZ ended on FLAT.
// • Before: every LZ starts on its own guess, so its first move's `from` is the guess. `movedOff` is the moves off bad ground
//   in order, so an LZ that ended back on its guess started on the ground it ended on; one with as many of those as moves
//   left bad ground every time (the guess was bad); one with none left FLAT every time. With some but not all (off a FLAT
//   guess onto a bad candidate and off again, or the other way round) the record can't tell which move left the bad ground:
//   groundBefore is null, and nothing should be claimed about the guess.
// • An LZ with no move started where it ended.
export function surveyNetOutcome(record: Readonly<SurveyRecord>): SurveyNetOutcome[] {
  const labels = [...new Set([...record.moves, ...record.badKept, ...record.movedOff].map((entry) => entry.lz))].sort();
  return labels.map((lz): SurveyNetOutcome => {
    const moves = record.moves.filter((move) => move.lz === lz);
    const off = record.movedOff.filter((entry) => entry.lz === lz);
    const kept = record.badKept.find((entry) => entry.lz === lz) ?? null;
    const groundAfter: LzGround = kept?.ground ?? 'flat';
    const knownAfter = kept?.known ?? null;
    if (moves.length === 0) {
      if (off.length > 0) throw new Error(`surveyNetOutcome: ${lz} moved off bad ground without a move`);
      return { lz, endedSite: null, moved: false, groundBefore: groundAfter, groundAfter, knownBefore: knownAfter, knownAfter };
    }
    if (off.length > moves.length) throw new Error(`surveyNetOutcome: ${lz} has ${off.length} moves off bad ground of ${moves.length}`);
    const guess = moves[0]!.from;
    const endedSite = moves[moves.length - 1]!.site;
    const moved = endedSite !== guess;
    const groundBefore: LzGround | null = !moved ? groundAfter : off.length === 0 ? 'flat' : off.length === moves.length ? off[0]!.ground : null;
    // A bad guess is the first move's `from`, so the first move off bad ground is the move off the guess.
    const knownBefore = groundBefore !== null && groundBefore !== 'flat' && off.length > 0 ? off[0]!.known : null;
    return { lz, endedSite: moved ? endedSite : null, moved, groundBefore, groundAfter, knownBefore, knownAfter };
  });
}
