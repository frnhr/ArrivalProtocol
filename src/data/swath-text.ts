// Slice 6: Track SWATH owns this file (docs/phase3/impl/slice-6-plan.md §2.13, §6.2): only what SWATH's modules emit:
// CONTROL's quips, the TERMINAL's lines, the strip's row, the Skills row's status and the touchdown echo's tail. The boot
// line, the sites' labels and the refusals are the lead's (data/survey-text.ts); everything SITES paints is
// data/sites-text.ts's. Seeded by the FOUNDATION with the plan's words, kept by SWATH. Every line ≤ MAX_LINE_CHARS at its worst case (tests/unit/support/words, SWATH's block).
import type { BadGround } from '@/types/survey';
import type { LzWidth } from '@/types/landing';

const GROUND_WORD: Readonly<Record<BadGround, string>> = { rocky: 'ROCKY', wet: 'WET' };

// A site's WIDTH class as the TERMINAL's find line names it (`ROOM 800 · WIDE`).
export const WIDTH_WORD: Readonly<Record<LzWidth, string>> = { wide: 'WIDE', standard: 'STANDARD', narrow: 'NARROW' };

export const SWATH_TEXT = {
  // ARRIVAL CONTROL (say('control', …, { critical: true }), once per ship: plan R21). Playtest 1 (B-VOICE): official, and
  // only the boot's notice; the reveal and the first move are PAL's quips (data/companion-text.ts siteReveal, siteMoved).
  control: {
    boot: 'Landing sites are estimates.',
  },
  // The TERMINAL (the first find, a v2 reveal, a wreck, PLANET MAPPED; other finds only ping).
  terminal: {
    found: (site: string, room: string, width: string): string => `> SURVEY: ${site} FOUND · ROOM ${room} · ${width}`,
    revealed: (lz: string, ground: BadGround): string => `> SURVEY: ${lz} IS ${GROUND_WORD[ground]} ✕`,
    wreck: (site: string): string => `> SURVEY: ${site} IS WRECKAGE · AN OLD POD. NOT OURS.`,
    mapped: (sites: number): string => `> SURVEY: PLANET MAPPED · ${sites} SITES`,
  },
  // The strip's one row (R22, `survey-swap`): worst `LZ-D IS ROCKY ✕ — SITES: SET SITE 12 AS LZ-D` (44).
  strip: {
    swap: (lz: string, ground: BadGround, site: string): string => `${lz} IS ${GROUND_WORD[ground]} ✕ — SITES: SET ${site} AS ${lz}`,
  },
  // The Skills row's status (survey.ts surveyStatus).
  status: {
    mapping: (pct: number): string => `MAPPING ${pct}% · HOLDS A THREAD`,
    mappingFree: (pct: number): string => `MAPPING ${pct}% · NO THREAD (v3)`,
    waits: 'WAITS FOR A SPARE THREAD',
    paused: (pct: number): string => `PAUSED · ${pct}%`,
    done: (sites: number): string => `DONE · ${sites} SITES`,
    goodIdle: 'SITE DATA GOOD · IDLE',
  },
  // The touchdown echo's tail (DROP's landing-text.ts echo, one line by request): `> pod03 ... LANDED · HARD · LZ-B IS WET`.
  echoTail: (lz: string, ground: BadGround): string => ` · ${lz} IS ${GROUND_WORD[ground]}`,
} as const;
