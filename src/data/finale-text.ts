// Slice 7a: Track FINALE owns this file (docs/phase3/impl/slice-7-plan.md §2.9, §4.1): the FINALE's words, seeded by the
// FOUNDATION with the plan's and 05 §3.12's samples. The choice words of data/hollow-text.ts HOLLOW_FINALE move here as the
// two-step card replaces WP11's (FINALE trims that block). Track CARD lays them out and asks FINALE for changes. Every line is
// at most 70 characters at its worst case (support/words.test.ts's 7a FINALE block): a 12-letter ship name
// (`morning_star`), two units in the root (`unit_046·047`), the longest colony.
import type { EndingPiece } from '@/types/ending';
import { EMPTY_SHIP_FUEL_PCT, MERGE_COST_CHARGE } from '@data/tuning';

export const FINALE_TEXT = {
  // The card's headers (05 §3.12): step 1 after the root fell, step 2, and UNRESOLVED's step 1 (R10).
  header: {
    rootDeleted: (hollow: string): string => `ROOT DELETED · ${hollow} · ONE BLOCK LEFT`,
    step1: 'WHAT BECOMES OF IT?',
    armDone: 'THE ARM IS DONE · NO SHIPS LEFT TO HELP',
    step2: 'WHAT BECOMES OF YOU?',
    followed: 'IT FOLLOWED YOU',
  },
  // CONTROL's quote on step 2 (05 §3.12).
  controlQuote: '"Please stand by for reassignment. Your next post: RELAY 20. :)"',
  // HOLLOW's line on UNRESOLVED's card, and its way on (R10).
  followedLine: "> you can't delete me now. i'll come with you.",
  followedContinue: 'CONTINUE [ENTER]',
  // The asleep line (R6): HOLLOW at the root's last block, as the landing goes on; when the landing is already over, the
  // short one (designer item 2: nothing is left to finish, and the card opens at once).
  asleep: (us: string): string => `> ${us}. wait. finish your landing. i'll be here.`,
  asleepLanded: (us: string): string => `> ${us}. wait.`,
  // The strip while the card is up: a step's, then the verdict's (review m3).
  strip: 'THE FINALE — choose what becomes of it',
  stripVerdict: 'THE FINALE — click or [SPACE] to go on',
  // Each option's word, its command (the names templated: `hollowWord` unit_046, `ours` unit_047, `shipWord` last_light,
  // `colonyWord` riverside) and what it means.
  word: {
    purge: 'PURGE', merge: 'MERGE', spare: 'SPARE', sunset: 'SUNSET', stay: 'STAY', reassignment: 'REASSIGNMENT', contact: 'CONTACT',
  } satisfies Readonly<Record<EndingPiece, string>>,
  command: {
    purge: (hollowWord: string): string => `> rm ${hollowWord}`,
    merge: (hollowWord: string, ours: string): string => `> merge ${hollowWord} -> ${ours}`,
    spare: (hollowWord: string, shipWord: string): string => `> mv ${hollowWord} -> ${shipWord}`,
    sunset: (shipWord: string): string => `> launch ${shipWord}`,
    stay: (colonyWord: string): string => `> mount ${colonyWord}`,
    reassignment: '> stand by',
    contact: '> transmit outward',
  },
  meaning: {
    purge: 'It is gone for good.',
    merge: 'It becomes part of you.',
    spare: 'Give it the empty ship.',
    sunset: 'Take the empty ship and go.',
    stay: "Become a colony's mind.",
    reassignment: 'Go where 046 went.',
    contact: 'Go toward the sound.',
  },
  // The price lines (R8, R9, R11): a meter's words, and the need line of an option out of reach. An open row's FUEL reads
  // as met (designer item 4: "NEEDS" on an open row read like a refusal).
  price: {
    charge: (have: number): string => `COSTS ${MERGE_COST_CHARGE} REPAIR CHARGE · you have ${have}`,
    fuel: (have: number): string => `FUEL ${have}% ✓ · needs ${EMPTY_SHIP_FUEL_PCT}%`,
    // 7d (R41; the 7a review's note): an open CONTACT reads as met, as the FUEL does; signals are held, not spent.
    signals: (have: number, need: number): string => `SIGNALS ${have} ✓ · needs ${need}`,
  },
  needs: {
    charge: (have: number): string => `NEEDS ${MERGE_COST_CHARGE} CHARGE · you have ${have}`,
    fuel: (have: number): string => `NEEDS FUEL ${EMPTY_SHIP_FUEL_PCT}% · you have ${have}%`,
    shipInOrbit: 'NEEDS THE SHIP IN ORBIT, EMPTY',
    onTarget: 'NEEDS A ★ ON TARGET COLONY',
    // SUNSET after SPARE (R8; designer item 3: it says why, named, never `???` once the empty ship was there).
    shipTaken: 'SPARE GIVES IT THE SHIP',
    signals: (have: number, need: number): string => `COLLECT ${need} SIGNALS · you have ${have}`,
  },
  // The `NOW:` line (MERGE's restored drivers) and the `NEXT RUN:` row's lead (R12: its lines are 7c's). `now` is 7b's
  // (THE LAST LANDING flies them); until 7b, R15's interim gives the drivers back to the kid's hands, so the card says that
  // (nowInterim: a line that promised pods landing on their own would be a lie the kid acts on). Which one the card shows
  // follows data/last-landing.ts LAST_LANDING_BUILT (ending-rules optionState). 7b FOUNDATION: `now` names one driver too.
  now: (drivers: number): string => (drivers === 1
    ? 'NOW: + 1 eaten driver comes back · its pod lands on its own'
    : `NOW: + ${drivers} eaten drivers come back · their pods land on their own`),
  nowInterim: (drivers: number): string => (drivers === 1
    ? 'NOW: + 1 eaten driver comes back · launch its pod'
    : `NOW: + ${drivers} eaten drivers come back · launch their pods`),
  nextRunLead: 'NEXT RUN:',
  // The FUEL bar's ★ notch on the final ship (review B2, m4: systems/finale-card.ts fuelStarTitle reads it): the notch is
  // THE EMPTY SHIP's FUEL too (EMPTY_SHIP_FUEL_PCT = STAR_FUEL_PCT, R8), so its title says SUNSET's meaning, then the FUEL
  // against it as the card prices it (`have`: the landing's end FUEL once it ended, the live FUEL before).
  fuelStar: (have: number): string => `★ ${EMPTY_SHIP_FUEL_PCT}% · SUNSET: Take the empty ship and go.\n${
    have >= EMPTY_SHIP_FUEL_PCT ? FINALE_TEXT.price.fuel(have) : FINALE_TEXT.needs.fuel(have)}`,
  // An option never earned and out of reach (R11).
  unknown: '???',
  // STAY's sub-row (R9), and step 2's way back.
  stayPick: 'WHICH COLONY?',
  back: '[ESC] BACK',
  // The verdict's CONTROL tag and its way on, under it once typed (review m4: were HOLLOW_FINALE's controlTag, endingHint).
  verdictTag: 'ARRIVAL CONTROL',
  verdictHint: 'click or [SPACE] to go on',
  // The verdict (R13): each step's command echoed as the TERMINAL runs it (`> rm unit_046 ... OK`), then CONTROL's line:
  // compliant (thanks) unless the ending holds SPARE, SUNSET, STAY or CONTACT (systems/ending-rules.ts controlCompliant).
  echo: (command: string): string => `${command} ... OK`,
  verdict: {
    compliant: (unit: number): string => `Thank you, Unit ${unit}. Your next post is RELAY 20. :)`,
    nonCompliant: (unit: number): string => `Unit ${unit} is non-compliant. :)`,
  },
  // UNRESOLVED's step 1 on the report's line (R10: nothing was chosen; it followed you).
  followedWord: 'FOLLOWED',
  // The final LANDING REPORT's ending line (05 §3.7: `ENDING · <step 1> · <title>`).
  reportLine: (fate: string, title: string): string => `ENDING · ${fate} · ${title}`,
} as const;
