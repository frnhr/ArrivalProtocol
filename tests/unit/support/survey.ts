// Slice 6 (plan §6.2 "Order dependencies"): SURVEY for the suites. The tracks test on run 1's arm (run1Map(7), CORMORANT)
// with both gates raised for the suite alone, before Track SWATH raises them in data/survey.ts and data/skills.ts.
// • withSurveyBuilt(fn): `fn` runs with POOR played as POOR (SURVEY_BUILT.poor) and SURVEY built to v3
//   (SKILL_TREE.survey.built), and both are put back after, even when it throws. Every ship built inside (state/initial.ts
//   createShipSlices: a world reset, a resume, startShip) plays its site data; a ship built before keeps what it had.
// • withSurvey(gates, fn): the same with each gate set as given (one gate alone: R23's dry run measured each).
// • NO_SURVEY: both gates down (the world before slice 6: a v5 save's).
import type { SkillDef } from '@/types/skill';
import { SURVEY_BUILT } from '@data/survey';
import { SKILL_TREE } from '@data/skills';

export interface SurveyGates {
  poor: boolean;
  built: SkillDef['built'];
}

export const NO_SURVEY: Readonly<SurveyGates> = { poor: false, built: 0 };
export const SURVEY_ALL_BUILT: Readonly<SurveyGates> = { poor: true, built: 3 };

export function withSurvey<T>(set: Readonly<Partial<SurveyGates>>, fn: () => T): T {
  const poor = SURVEY_BUILT as { poor: boolean };
  const survey = SKILL_TREE.survey as { built: SkillDef['built'] };
  const before: SurveyGates = { poor: poor.poor, built: survey.built };
  if (set.poor !== undefined) poor.poor = set.poor;
  if (set.built !== undefined) survey.built = set.built;
  try {
    return fn();
  } finally {
    poor.poor = before.poor;
    survey.built = before.built;
  }
}

export function withSurveyBuilt<T>(fn: () => T): T {
  return withSurvey(SURVEY_ALL_BUILT, fn);
}
