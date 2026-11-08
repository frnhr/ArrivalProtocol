// Slice 6: Track SITES owns this file (docs/phase3/impl/slice-6-plan.md §2.13, §6.2): every word SITES paints (the SITES
// window, the pill, the stamps, the card's SITE DATA row, the AHEAD line's second line, the report's suffixes, the glossary).
// Seeded by the FOUNDATION with final keys and the plan's words (plan 5's M2: a track owns every word it paints); SITES
// rewords and adds freely. The boot line, the sites' labels (`SITE 4`, `LZ-B GUESS`) and the refusals are the lead's
// (data/survey-text.ts); CONTROL, the TERMINAL, the strip and the Skills row are SWATH's (data/swath-text.ts). Every line ≤
// MAX_LINE_CHARS at its worst case (tests/unit/support/words, SITES's block).
import type { BadGround } from '@/types/survey';

const GROUND_WORD: Readonly<Record<BadGround, string>> = { rocky: 'ROCKY', wet: 'WET' };

export const SITES_TEXT = {
  window: {
    title: 'Sites',
    header: (pct: number): string => `SITES · POOR DATA · MAPPED ${pct}%`,
    surveying: (version: number): string => `SURVEY v${version} · HOLDS A THREAD`,
    noSurvey: 'NO SURVEY · ARRIVAL CONTROL\'S GUESSES',
    pause: '[ PAUSE ]',
    resume: '[ RESUME ]',
    unsurveyed: 'UNSURVEYED',
  },
  row: {
    // `SITE 4 · ROOM 800 · WIDE · FLAT ★★★`, `LZ-B GUESS · ROOM 800 · STANDARD · GROUND ?`.
    site: (label: string, room: string, width: string, ground: string): string => `${label} · ROOM ${room} · ${width} · ${ground}`,
    groundUnknown: 'GROUND ?',
    lz: (lz: string, site: string, pods: number, ground: string): string => `${lz} · on ${site} · ${pods} PODS · ${ground}`,
  },
  pill: (lz: string, room: string): string => `SET AS ${lz} (${room})`,
  stamp: {
    bad: (lz: string, ground: BadGround): string => `${lz} · ${GROUND_WORD[ground]} ✕`,
    moved: (lz: string, site: string): string => `${lz} → ${site}`,
  },
  card: {
    label: 'SITE DATA',
    good: 'GOOD',
    poor: 'POOR · ARRIVAL CONTROL GUESSED',
    moved: (lz: string): string => `POOR · ${lz} MOVED`,
    kept: 'POOR · SURVEYED, KEPT',
    notSurveyed: 'POOR · NOT SURVEYED',
    // The 'lzs' row's words on a POOR planet (01 §3.15; data/map-text.ts MAP_TEXT.card.lzs reads it).
    lzs: (count: number): string => `LZ: ${count} · SURVEY NEEDED`,
  },
  ahead: {
    open: 'SITE DATA POOR · SURVEY FINDS BETTER SITES',
    closed: 'SITE DATA POOR · ARRIVAL CONTROL GUESSED THE LZs',
  },
  report: {
    site: (site: string): string => ` · ${site}`,
    hard: (ground: BadGround, pods: number): string => ` · ${GROUND_WORD[ground]} · ${pods} HARD`,
  },
  glossary: {
    siteData: 'SITE DATA · GOOD: CONTROL\'S LZs ARE SOUND. POOR: THEY ARE GUESSES.',
    survey: 'SURVEY · MAPS THE GROUND UNDER THE SHIP AND FINDS BETTER SITES',
    ground: 'GROUND · FLAT, ROCKY OR WET. ROCKY AND WET LAND HARD.',
  },
} as const;
