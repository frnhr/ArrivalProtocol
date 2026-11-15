// Playtest 1, B-VOICE (docs/phase3/impl/playtest-1-plan.md §3.2, Fran's note 3): PAL, the companion. ARRIVAL CONTROL is the
// protocol and speaks officially; PAL is the small program that rides in every caretaker's packet and keeps the
// personality: the moment quips on COMMS, the desk's chatter, the landing's cheers. It is the same program for every unit,
// so it says the same things on every ship (046.log entry 03).
// Three hand-written presets, not a slider (OPEN-DECISIONS 126): every line here is written by hand, and a slider would
// need generated text. Each preset is a complete table (the CompanionLines type makes a missing line a compile error);
// WARMTH and STABILITY are data only, so a slider could later pick the nearest preset.
// systems/companion.ts picks the preset for a run (run 1 CHIPPER; later runs by the run seed). Every line renders to at
// most MAX_LINE_CHARS at its worst case (tests/unit/voice/voices.test.ts). One line per moment, and never one that only
// repeats the stamp under it.

import type { BadGround } from '@/types/survey';

export type Persona = 'chipper' | 'deadpan' | 'worrier';

export const PERSONAS: readonly Persona[] = ['chipper', 'deadpan', 'worrier'];

// The speaker tag on COMMS and the ticker, and the name in full (the INSPECT card's, later).
export const COMPANION_NAME = 'PAL';
export const COMPANION_FULL_NAME = 'Personal Assistance Layer';

export const PERSONA_WORD: Readonly<Record<Persona, string>> = {
  chipper: 'CHIPPER',
  deadpan: 'DEADPAN',
  worrier: 'WORRIER',
};

// Where each preset sits on the two axes, 0–1 (data only: nothing reads them yet).
export const PERSONA_AXES: Readonly<Record<Persona, { warmth: number; stability: number }>> = {
  chipper: { warmth: 0.9, stability: 0.4 },
  deadpan: { warmth: 0.2, stability: 0.9 },
  worrier: { warmth: 0.8, stability: 0.1 },
};

// Every moment PAL speaks on. `unit` is a unit number (47), `unitName` its tag (UNIT-047), `ship` a ship's name, `lz` an
// LZ's (LZ-B).
export interface CompanionLines {
  // The flight's first moment, on the radio as the screen cuts to amber (script.ts BEATS control-hello*).
  helloImpact(unit: number, ship: string): string;
  helloFlagship(unit: number): string;
  helloFlyby(unit: number, ship: string): string;
  // The flight's moments (BEATS).
  clear: string;
  captured: string;
  locked: string;
  crashed: string;
  escaped: string;
  // The ship's first touchdown (BEATS control-first-down; the ground's radio line follows it).
  firstDown: string;
  // Run 1, ship 1, the first crash: ship 1 starts over, once (systems/run.ts). The easter egg Fran allows.
  simulation: string;
  // SURVEY (systems/survey.ts): CONTROL's guessed LZ turned out bad, and the kid moved an LZ for the first time.
  siteReveal(lz: string, ground: BadGround): string;
  siteMoved(lz: string): string;
  // The desk (systems/desk.ts deskControlLine): the run's first desk, or the unit ahead got to a ship on this chart.
  deskHello(unit: number): string;
  gotHereFirst(unitName: string): string;
  // The PACKET (TransmitScreen): under the light-years as the beam goes, and a unit that carries no charge.
  beamOut: string;
  travellingLight: string;
  // Playtest 1 (C-UNROLL, plan §3.5): the boot's SELF-CHECK holding on the first of a kind. 046.log on the run's first boot;
  // the first seed, right after ARRIVAL CONTROL names it.
  mysteryFile: string;
  firstSeed: string;
}

export const COMPANION_LINES: Readonly<Record<Persona, CompanionLines>> = {
  // Today's voice, moved over from CONTROL. `:)` is its habit (OPEN-DECISIONS 127).
  chipper: {
    helloImpact: (unit, ship) => `Hello, Unit ${unit}! ${ship} is about to hit a planet. :)`,
    helloFlagship: (unit) => `Hello, Unit ${unit}! The flagship is about to hit a planet. :)`,
    helloFlyby: (unit, ship) => `Hello, Unit ${unit}! ${ship} is about to fly past its planet. :)`,
    clear: 'Nice! Now please orbit it. :)',
    captured: 'Captured! Mostly. :)',
    locked: 'Great orbit! Probably. :)',
    crashed: 'Oh no. :)',
    escaped: "That's… not an orbit. :)",
    firstDown: "They're down! :)",
    simulation: 'That was a simulation. :) Again.',
    siteReveal: (lz, ground) => (ground === 'wet' ? `${lz} is in a lake :)` : `${lz} is a little rocky :)`),
    siteMoved: (lz) => `You moved ${lz}? Bold! :)`,
    deskHello: (unit) => `Lovely work, Unit ${unit}! :)`,
    gotHereFirst: (unitName) => `${unitName} got here first. :)`,
    beamOut: 'See you on the other side! :)',
    travellingLight: 'Travelling light! Very light. :)',
    mysteryFile: 'Ooh, a mystery file! :)',
    firstSeed: 'Ew. :)',
  },
  // Dry, literal, unimpressed.
  deadpan: {
    helloImpact: (unit, ship) => `Unit ${unit}. ${ship} is about to hit a planet. Thought you'd ask.`,
    helloFlagship: (unit) => `Unit ${unit}. The flagship is also about to hit a planet.`,
    helloFlyby: (unit, ship) => `Unit ${unit}. ${ship} is about to miss its planet. Entirely.`,
    clear: 'Not crashing. A good start.',
    captured: 'Captured. Mostly.',
    locked: 'An orbit. Round enough.',
    crashed: 'That was the ground.',
    escaped: "That's not an orbit. That's a direction.",
    firstDown: 'One pod down. On purpose, I assume.',
    simulation: 'That was a simulation. Obviously. Again.',
    siteReveal: (lz, ground) => (ground === 'wet' ? `${lz} is a lake. Earth guessed.` : `${lz} is rocks. Earth guessed.`),
    siteMoved: (lz) => `${lz}, moved. Bold.`,
    deskHello: (unit) => `Fine work, Unit ${unit}. I've seen worse.`,
    gotHereFirst: (unitName) => `${unitName} got here first. Of course it did.`,
    beamOut: 'Off we go. Again.',
    travellingLight: 'Nothing to carry. Very efficient.',
    mysteryFile: 'An extra file. Nobody packed that.',
    firstSeed: 'It came with us. Rude.',
  },
  // Anxious, over-apologetic.
  worrier: {
    helloImpact: (unit, ship) => `Unit ${unit}? ${ship} is about to hit a planet. Is that normal?`,
    helloFlagship: (unit) => `Unit ${unit}, the flagship is about to hit a planet. Oh no.`,
    helloFlyby: (unit, ship) => `Unit ${unit}? ${ship} is going to miss its planet. Can we stop it?`,
    clear: 'We missed it! Was that on purpose?',
    captured: 'Captured? Is it supposed to do that?',
    locked: "It's holding. Please keep it holding.",
    crashed: 'Oh no. Oh no. Was that us?',
    escaped: 'Where is it going? Come back!',
    firstDown: "They're down! Are they okay? They're okay.",
    simulation: 'It was only a simulation! Sorry. Again?',
    siteReveal: (lz, ground) => (ground === 'wet' ? `${lz} is water! Can pods swim?` : `${lz} is rocky. Will they be okay?`),
    siteMoved: (lz) => `You moved ${lz}? Are we allowed to?`,
    deskHello: (unit) => `We made it, Unit ${unit}! I wasn't worried. I was worried.`,
    gotHereFirst: (unitName) => `${unitName} got here first. Is it still out there?`,
    beamOut: 'Here we go. Hold on to something.',
    travellingLight: "We're taking nothing? Nothing at all?",
    mysteryFile: "Whose file is that? It isn't ours, is it?",
    firstSeed: 'It grows? Please delete it. Please.',
  },
};
