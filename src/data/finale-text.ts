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
  // The asleep line (R6): HOLLOW at the root's last block, as the landing goes on.
  asleep: (us: string): string => `> ${us}. wait. finish your landing. i'll be here.`,
  // The strip while the card is up.
  strip: 'THE FINALE — choose what becomes of it',
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
  // The price lines (R8, R9, R11): a meter's words, and the need line of an option out of reach.
  price: {
    charge: (have: number): string => `COSTS ${MERGE_COST_CHARGE} REPAIR CHARGE · you have ${have}`,
    fuel: (have: number): string => `NEEDS FUEL ${EMPTY_SHIP_FUEL_PCT}% · you have ${have}% ✓`,
  },
  needs: {
    charge: (have: number): string => `NEEDS ${MERGE_COST_CHARGE} CHARGE · you have ${have}`,
    fuel: (have: number): string => `NEEDS FUEL ${EMPTY_SHIP_FUEL_PCT}% · you have ${have}%`,
    shipInOrbit: 'NEEDS THE SHIP IN ORBIT, EMPTY',
    onTarget: 'NEEDS A ★ ON TARGET COLONY',
    shipTaken: '046 HAS THE SHIP',
    signals: (have: number, need: number): string => `COLLECT ${need} SIGNALS · you have ${have}`,
  },
  // The `NOW:` line (MERGE's restored drivers) and the `NEXT RUN:` row's lead (R12: its lines are 7c's).
  now: (drivers: number): string => `NOW: + ${drivers} eaten drivers come back · their pods land on their own`,
  nextRunLead: 'NEXT RUN:',
  // An option never earned and out of reach (R11).
  unknown: '???',
  // STAY's sub-row (R9), and step 2's way back.
  stayPick: 'WHICH COLONY?',
  back: '[ESC] BACK',
  // The verdict (R13): CONTROL's line by step 2.
  verdict: {
    compliant: (unit: number): string => `Thank you, Unit ${unit}. Your next post is RELAY 20. :)`,
    nonCompliant: (unit: number): string => `Unit ${unit} is non-compliant. :)`,
  },
  // The final LANDING REPORT's ending line (05 §3.7: `ENDING · <step 1> · <title>`).
  reportLine: (fate: string, title: string): string => `ENDING · ${fate} · ${title}`,
} as const;
