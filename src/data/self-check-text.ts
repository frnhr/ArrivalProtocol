// Playtest 1, C-UNROLL (docs/phase3/impl/playtest-1-plan.md §3.5, Fran's notes 13 and 17): the boot's SELF-CHECK words. The
// check is mostly marks on the memory strip, so these are short tags that sit on a file as the sweep finds something there,
// and the strip's line for each stage. The TERMINAL keeps only the few lines that are not about one file
// (data/script.ts bootLineTyped). The screen never says "wake" (tests/unit/support/words.test.ts): colonists land and
// never wake, and the unit only comes online.

import type { CheckStage } from '@/types/self-check';

export const SELF_CHECK_TEXT = {
  // The strip during the boot, by stage (systems/director.ts reads boot.ts bootStage). The RECEIVE stage keeps the old
  // RECEIVING TRANSMISSION line; a hold asks for the click.
  stage: {
    receive: 'RECEIVING TRANSMISSION',
    self: 'SELF-CHECK · YOUR FILES',
    ship: 'SELF-CHECK · THE SHIP',
    hold: 'SELF-CHECK · THE PODS',
    manifest: 'SELF-CHECK · NOT IN THE MANIFEST',
    sensors: 'SELF-CHECK · SENSORS',
  } satisfies Record<CheckStage, string>,
  skip: 'click or [SPACE] to skip',
  hold: 'click it or [SPACE]',
  // The tags (components/memory-view/SelfCheck.ts draws them over the file).
  tag: {
    // What the crossing (or ship 1's unpack) took from a file: `−22% IN TRANSIT`.
    transit: (lost: number): string => `−${Math.round(lost)}% IN TRANSIT`,
    // A hit ECC corrected while the unit slept (02 §3.3): the file ticks back to its colour.
    ecc: 'ECC ✓',
    // The REPAIR CHARGE the arrival brought on top of what crossed (the stars, the card, a gift, the floor).
    charge: (added: number): string => `+${added} CHARGE`,
    // The first of its kind on the run (the sweep holds on it), then every later one as the sweep passes.
    log: 'NOT IN THE MANIFEST',
    logKey: (entries: string): string => `KEY FOUND · ${entries}`,
    parcel: (waited: number): string => (waited <= 0 ? 'DELIVERY' : `DELIVERY · WAITED ${waited} ${waited === 1 ? 'YR' : 'YRS'}`),
    // A delivery a transit hit landed on: what it lost, as a file of the unit's would say it.
    parcelHit: (lost: number): string => `DELIVERY · −${Math.round(lost)}% IN TRANSIT`,
    seed: 'NOT IN YOUR PACKET',
    // The seed after its hold (the INSPECT line, said as a tag: plan §3.5's `It rode your beam from out here. It grows.`).
    seedNamed: 'RODE YOUR BEAM · IT GROWS',
    // A disguised seed SENTRY v1 unmasked at this boot.
    sentrySeed: 'A SEED · SENTRY',
    hollow: (owner: string, blocks: number): string => `${owner} · ${blocks} BLOCKS · NOT IN YOUR PACKET`,
  },
} as const;
