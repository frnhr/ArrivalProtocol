// The words the hazard zones say (WP9, §6.8): the TERMINAL's damage lines and the strip's upcoming event.
// Kept apart from script.ts (like hollow-text.ts) so systems/zones.ts can import them without the director.
// Every line is checked against the strip width with worst-case names by tests/wp9 tests (≤ 70 chars).

import { MAX_LINE_CHARS } from '@data/tuning';

export interface ZoneDamageItem {
  label: string;   // C07, THRUST CONTROLLER
  lost: number;    // integrity points
}

// What a zone is called in a kid's words: the strip's upcoming event (`DEBRIS C 03:30`) and the TERMINAL.
export const ZONE_WORD = { debris: 'DEBRIS', belt: 'BELT' } as const;

// The NAV PLOT's zone labels (§6.8, §5.1 4:48–5:00, WP9 part 2), two short lines beside the glyph: what the
// zone will do, then when. `racks` is types/zone.ts racksText (`RACK C`, `RACKS A–B`); `time` is a countdown.
export const ZONE_PLOT_TEXT = {
  debrisHits: (racks: string): string => `${ZONE_WORD.debris} · HITS ${racks}`,
  debrisClear: `${ZONE_WORD.debris} · CLEAR`,
  // PATH UNCERTAIN: the cloud is on the map, the path is not (§5.1 4:48 `DEBRIS · RACK C · HIT?`).
  debrisUnknown: (racks: string): string => `${ZONE_WORD.debris} · ${racks} · HIT?`,
  // The cloud already hit (one-shot): the same words as the stamp.
  debrisSpent: (racks: string): string => `HIT · ${racks}`,
  countdown: (time: string): string => `IN ${time}`,
  beltInside: (time: string): string => `${ZONE_WORD.belt} · ${time} INSIDE`,
  beltHits: (hits: number, racks: string): string => `≈${hits} HITS ON ${racks}`,
  beltClear: `${ZONE_WORD.belt} · CLEAR`,
  beltUnknown: (racks: string): string => `${ZONE_WORD.belt} · ${racks} · HITS?`,
} as const;

// The stamps (§3.5, §6.8): debris contact, and the moment a correction takes the path off the cloud (the
// twin of CLEAR OF THE PLANET, so a kid hears and sees that steering early saved those souls).
// WP9 review round 2 (the lead's ruling): the dodge's countdown running out is said once, loudly: TOO LATE TO DODGE.
// The strip's own line keeps the rest (`· too late to dodge DEBRIS C`, then `MOVE souls out of it`).
export const ZONE_STAMP_TEXT = {
  hit: (racks: string): string => ZONE_PLOT_TEXT.debrisSpent(racks),
  clear: 'CLEAR OF THE DEBRIS',
  tooLate: 'TOO LATE TO DODGE',
} as const;

// The MIND's tag on a rack's label while a zone is coming for it (the lead's note: the rack is named in blue
// too): two short lines under `RACK C` (the label column is about 48 px wide).
export const RACK_TAG_TEXT = {
  debris: ZONE_WORD.debris,
  debrisUnknown: `${ZONE_WORD.debris}?`,
  debrisHit: 'HIT',
  // ...over this when the rack held nothing it could hurt (the TERMINAL: `> DEBRIS HIT RACK C: NOTHING THERE`).
  debrisHitNothing: 'NOTHING',
  belt: ZONE_WORD.belt,
  beltUnknown: `${ZONE_WORD.belt}?`,
  inside: 'INSIDE',
} as const;

// The ECC-style line when debris hits a rack (§6.8 "ECC lines"): `> DEBRIS HIT RACK C: C07 C08 C09 C10 −25%`.
// As many files as fit, then `+n`; a file that straddled the rack lost less, and says so on its own.
export function debrisHitLine(rack: string, items: readonly ZoneDamageItem[]): string {
  const head = `> DEBRIS HIT RACK ${rack}`;
  if (items.length === 0) return `${head}: NOTHING THERE`;
  const full = Math.max(...items.map((item) => item.lost));
  const words = items.map((item) => (Math.round(item.lost) === Math.round(full) ? item.label : `${item.label} −${Math.round(item.lost)}%`));
  const tail = ` −${Math.round(full)}%`;
  for (let shown = words.length; shown >= 1; shown--) {
    const rest = words.length - shown;
    const line = `${head}: ${words.slice(0, shown).join(' ')}${rest > 0 ? ` +${rest}` : ''}${tail}`;
    if (line.length <= MAX_LINE_CHARS) return line;
  }
  return `${head}: ${items.length} FILES${tail}`;
}

// One belt hit (§6.8): `> BELT HIT · C03 −8%`.
export function beltHitLine(item: ZoneDamageItem): string {
  return `> BELT HIT · ${item.label} −${Math.round(item.lost)}%`;
}

// A cluster a zone took to 0 (§6.8: no HOLLOW turn; it simply did not wake).
export function zoneLostLine(cluster: string): string {
  return `> ${cluster} ... DID NOT WAKE`;
}
