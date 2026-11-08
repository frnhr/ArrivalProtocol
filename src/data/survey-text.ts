// Slice 6: the lead owns this file (docs/phase3/impl/slice-6-plan.md §2.13, §5): the boot line, the sites' labels and the
// refusals for assigning. CONTROL, the TERMINAL, the strip and the Skills row are Track SWATH's (data/swath-text.ts);
// everything the SITES window, the plot, the card and the report paint is Track SITES's (data/sites-text.ts). Tracks ask
// by message. Every line ≤ MAX_LINE_CHARS at its worst case (tests/unit/survey/foundation).
import type { SurveySite, AssignRefusal } from '@/types/survey';
import { formatCount } from '@data/format';
import { lzLetter } from '@data/survey-sites';
import { COLONISTS_PER_POD } from '@data/tuning';

// What a refusal names (survey-model.ts assignRefusal's caller fills it): the site's label, the LZ's, the colonists the site
// holds and the LZ needs.
export interface RefusalWords {
  site: string;
  lz: string;
  holds: number;    // colonists
  needs: number;    // colonists
}

export const SURVEY_TEXT = {
  // The boot (02 §4, after the ship's own arrival-damage lines; map-boot.ts 'site-data'): 47 characters.
  boot: (lzs: number): string => `> SITE DATA POOR · ARRIVAL CONTROL GUESSED ${lzs} LZs`,
  // ROOM in colonists, as the LZ counts are shown (`ROOM 800`).
  room: (pods: number): string => formatCount(pods * COLONISTS_PER_POD),
  // Refused assigns (R10): at most 46 characters at the worst case (`SITE 12 HOLDS 3,200 · LZ-D NEEDS 3,200`).
  refusal: {
    'closed': () => 'NO SURVEY · SITES STAY AS GUESSED',
    'offline': () => 'SURVEY OFFLINE — REPAIR IT',
    'not-found': () => 'NOT FOUND YET',
    'wreck': () => 'WRECKAGE · NO ROOM',
    'too-small': (words) => `${words.site} HOLDS ${formatCount(words.holds)} · ${words.lz} NEEDS ${formatCount(words.needs)}`,
    'taken': (words) => `${words.site} IS ${words.lz}'s`,
    'pods-down': (words) => `${words.lz} HAS PODS DOWN`,
    'falling': (words) => `A POD IS FALLING TO ${words.lz}`,
    'falling-under': () => 'A POD IS FALLING — WAIT FOR IT',
    'window-open': (words) => `${words.lz}'S WINDOW IS OPEN`,
    'landing-over': () => 'THE LANDING IS OVER',
    'same': (words) => `${words.lz} IS ON ${words.site}`,
  } satisfies Readonly<Record<AssignRefusal, (words: Readonly<RefusalWords>) => string>>,
} as const;

// A site's label (`SITE 4`, `LZ-B GUESS`, `SITE 5 · WRECKAGE`): a guess by its LZ, a candidate or a wreck by its number.
export function siteLabel(site: Readonly<Pick<SurveySite, 'kind' | 'number'>>): string {
  switch (site.kind) {
    case 'guess': return `LZ-${lzLetter(site.number)} GUESS`;
    case 'candidate': return `SITE ${site.number}`;
    case 'wreck': return `SITE ${site.number} · WRECKAGE`;
  }
}
