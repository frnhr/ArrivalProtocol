// Slice 6: Track SITES owns this file (docs/phase3/impl/slice-6-plan.md §2.13, §6.2): every word SITES paints (the SITES
// window, the pill, the stamps, the NAV PLOT's and the GROUND TRACK's labels, the card's SITE DATA row, the AHEAD line's
// second line, the report's suffixes, the glossary). The boot line, the sites' labels (`SITE 4`, `LZ-B GUESS`) and the
// refusals are the lead's (data/survey-text.ts); CONTROL, the TERMINAL, the strip and the Skills row are SWATH's
// (data/swath-text.ts). Every line ≤ MAX_LINE_CHARS at its worst case (tests/unit/support/words, SITES's block: a new
// parameter name needs its worst case in SITES_WORST there).
import type { BadGround } from '@/types/survey';
import type { LzWidth } from '@/types/landing';

const GROUND_WORD: Readonly<Record<BadGround, string>> = { rocky: 'ROCKY', wet: 'WET' };
// ★ for each tier of a site's rating (survey-model.ts siteStars: 3 FLAT and not NARROW, 2 FLAT NARROW, 1 ROCKY or WET).
const starsOf = (stars: number): string => '★'.repeat(stars);
// `1 POD`, `4 PODS` (review m4).
const podsWord = (count: number): string => `${count} ${count === 1 ? 'POD' : 'PODS'}`;

export const SITES_TEXT = {
  // A site's WIDTH class as the rows say it.
  width: { wide: 'WIDE', standard: 'STANDARD', narrow: 'NARROW' } satisfies Readonly<Record<LzWidth, string>>,
  window: {
    title: 'Sites',
    // The header line, and the strip of the rim under it (one cell of SITES_RIM_BAR_CELLS per glyph).
    header: (pct: number): string => `POOR DATA · MAPPED ${pct}%`,
    rimMapped: '▓',
    rimUnmapped: '░',
    // SURVEY's state (survey-model.ts surveyRunning) and version: running at v1–v2 holds a thread, at v3 none.
    status: {
      running: (version: number): string => `SURVEY v${version} · MAPPING · HOLDS A THREAD`,
      sweeping: (version: number): string => `SURVEY v${version} · MAPPING · NO THREAD`,
      waiting: (version: number): string => `SURVEY v${version} · WAITS FOR A SPARE THREAD`,
      paused: (version: number): string => `SURVEY v${version} · PAUSED · ITS THREAD IS FREE`,
      // v3 holds no thread, so its pause frees none (review m2).
      pausedFree: (version: number): string => `SURVEY v${version} · PAUSED`,
      done: (version: number, sites: number): string => `SURVEY v${version} · PLANET MAPPED · ${sites} SITES`,
      idle: (version: number): string => `SURVEY v${version} · IDLE`,
      none: 'NO SURVEY · ARRIVAL CONTROL\'S GUESSES',
      // SURVEY.skl aboard but OFF by damage (review m1).
      offline: 'SURVEY OFFLINE — REPAIR IT',
    },
    pause: '[ PAUSE ]',
    resume: '[ RESUME ]',
    pauseTitle: 'Pausing gives SURVEY\'s Core thread back; RESUME takes it again',
    pauseTitleFree: 'Pausing stops the mapping; RESUME starts it again',
    lzHead: 'LANDING ZONES',
    foundHead: 'SITES FOUND',
    // Under the found sites' head while it has none.
    emptyMapping: 'NONE YET · THE SWATH IS MAPPING',
    emptyNone: 'TRAIN SURVEY AT A DESK TO FIND BETTER SITES',
    emptyOffline: 'REPAIR SURVEY.skl TO MAP AND FIND BETTER SITES',
    emptyDone: 'NO OTHER SITES ON THIS PLANET',
    hint: 'CLICK A SITE TO MOVE AN LZ THERE',
  },
  row: {
    // `SITE 4 · ROOM 800 · WIDE · FLAT ★★★`. `groundWord`: the ground as shown (`FLAT ★★★`, `GROUND ?`; review m10).
    site: (label: string, room: string, width: string, groundWord: string): string => `${label} · ROOM ${room} · ${width} · ${groundWord}`,
    // An LZ: where it stands (`GUESS`: CONTROL's, or `SITE 4`), its count, its width, its ground.
    lz: (lz: string, where: string, podCount: number, width: string, groundWord: string): string => `${lz} · ${where} · ${podsWord(podCount)} · ${width} · ${groundWord}`,
    guess: 'GUESS',
    // 01 §7's story find: never assignable.
    wreck: (label: string): string => `${label} · AN OLD POD. NOT OURS.`,
    groundUnknown: 'GROUND ?',
    // Slice 8 (OPEN-DECISIONS 53): v1's rough tell on a guess its swath passed, not rated (survey-model.ts guessTell).
    tellFlat: 'FLAT ?',
    tellRough: 'ROUGH ?',
    unsurveyed: 'UNSURVEYED',
    flat: (stars: number): string => `FLAT ${starsOf(stars)}`,
    bad: (ground: BadGround): string => `${GROUND_WORD[ground]} ✕`,
  },
  // A click's pill row: an LZ the site can take, or why not (the lead's refusal words, data/survey-text.ts), dimmed.
  pill: (lz: string, room: string): string => `SET AS ${lz} (${room})`,
  pillRefused: (lz: string, why: string): string => `${lz} ✕ ${why}`,
  stamp: {
    bad: (lz: string, ground: BadGround): string => `${lz} · ${GROUND_WORD[ground]} ✕`,
    moved: (lz: string, site: string): string => `${lz} → ${site}`,
  },
  // The NAV PLOT: an LZ's mark in flight (`LZ-B ?`, `LZ-B ✕`; in LANDING the landing layer names it and this layer adds the
  // glyph), and a found site's name.
  plot: {
    unknown: '?',
    bad: '✕',
    lz: (lz: string, glyph: string): string => `${lz} ${glyph}`.trimEnd(),
  },
  // The GROUND TRACK's candidate brackets: `SITE 4`, `SITE 4 ★★★` once rated, a wreck's.
  track: {
    rated: (label: string, stars: number): string => `${label} ${starsOf(stars)}`,
    wreck: 'WRECK',
  },
  card: {
    label: 'SITE DATA',
    good: 'GOOD',
    poor: 'POOR · ARRIVAL CONTROL GUESSED',
    // After the ship (ShipResult.survey): the LZs moved (`LZ-B`, `LZ-A, LZ-B`), surveyed and kept, or never surveyed.
    moved: (lzs: string): string => `POOR · ${lzs} MOVED`,
    kept: 'POOR · SURVEYED, KEPT',
    notSurveyed: 'POOR · NOT SURVEYED',
    // The 'lzs' row's words on a POOR planet (01 §3.15; data/map-text.ts MAP_TEXT.card.lzs reads it).
    lzs: (count: number): string => `LZ: ${count} · SURVEY NEEDED`,
  },
  ahead: {
    open: 'SITE DATA POOR · SURVEY FINDS BETTER SITES',
    closed: 'SITE DATA POOR · ARRIVAL CONTROL GUESSED THE LZs',
  },
  // The LANDING REPORT's LZ row tails (01's LZ-row slot): the site it moved to, its bad ground and the pods that landed hard.
  report: {
    site: (site: string): string => ` · ${site}`,
    hard: (ground: BadGround, pods: number): string => ` · ${GROUND_WORD[ground]} · ${pods} HARD`,
    bad: (ground: BadGround): string => ` · ${GROUND_WORD[ground]}`,
  },
  glossary: {
    siteData: 'SITE DATA · GOOD: CONTROL\'S LZs ARE SOUND. POOR: THEY ARE GUESSES.',
    survey: 'SURVEY · MAPS THE GROUND UNDER THE SHIP AND FINDS BETTER SITES',
    ground: 'GROUND · FLAT, ROCKY OR WET. ROCKY AND WET LAND HARD.',
  },
} as const;
