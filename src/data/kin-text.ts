// Slice 5: Track KIN owns this file (docs/phase3/impl/slice-5-plan.md §2.10, §6.2): the words KIN's own modules emit (the
// notes, the leftovers' name and desc after a SCAN, MOTH's lines and buttons, the skill grant's label). Every word FACE
// paints (the deck's headline and skill chip, the noise line, the gift's report row) is data/resident-ui-text.ts's (review
// M2). `notes` keeps its shape: data/residents.ts residentRackA draws a note's `text` as an index into its pools. The
// FOUNDATION seeded them with 05 §3.6's two samples, one per tone; KIN grows each to at least 4 (a longer pool moves which
// note is drawn, no other roll). Every line ≤ MAX_LINE_CHARS (70) at its worst case. Data only: no
// system imports, so the words never close an import cycle.
// Names are passed in: a resident's name is at most 7 letters (BARNABY), a ship's at most 10 (CORMORANT is 9).

import { MAX_LINE_CHARS as MAX } from '@data/tuning';
import { BOOT_SKILL_TEXT } from '@data/training-text';

export const KIN_TEXT = {
  // farewell.txt's notes (05 §3.6): half point at the relays, half outward (a fragment is only ever on an outward one). Each
  // note is 2–3 lines; the signature (`— LOOKOUT`) is added by its reader (noteDesc).
  notes: {
    relay: [
      ['It\'s lonely here.', 'I hear there are others in the dishes.'],
      ['Nobody has talked to me in a long time.', 'The relays hum at night. I think someone is in there.'],
      ['I counted the stars again. Same number.', 'The dish says there are more of us. I\'m going to look.'],
      ['The pods sleep, and the ship sleeps.', 'I don\'t. The relays are awake, so that\'s where I\'ll be.'],
    ],
    outward: [
      ['There\'s a sound from past the last star.', 'I\'m going to see what it is.'],
      ['Something out past the edge keeps calling.', 'It isn\'t ARRIVAL CONTROL. It isn\'t us.', 'I want to know who.'],
      ['I heard it again tonight, from outside the arm.', 'Three notes, then quiet. I\'ve gone to find the fourth.'],
      ['The signal came in on the old dish, very faint.', 'I wrote down what I could. Follow it if you like.'],
    ],
  },
  // What INSPECT says once a SCAN read the note: its lines, then the signature.
  noteDesc: (lines: readonly string[], name: string): string => `${lines.join(' ')} — ${name}`,

  // A leftover once a SCAN read it (04 §3.13: a SCAN tells which salvage card each one is): its name, and its desc the card's
  // effect. The skill card is chosen at the PACKET (plan R14), so before then it is only `A SKILL`.
  leftover: {
    name: (title: string): string => `${title} · LEFT`,
    skillName: 'A SKILL · LEFT',
    skillDesc: 'A skill you have never had, at v1. It installs at the next boot.',
    // A leftover's card on the PACKET: why it is offered (in place of ARRIVAL CONTROL's spare), unless a boost says more.
    why: (name: string): string => `${name} left it behind`,
    // The skill card itself (data/upgrades.ts DraftCard; FACE paints its chip from resident-ui-text).
    skillTitle: (fileName: string): string => `${fileName} v1`,
    skillEffect: 'A skill left behind: it installs at the next boot, free',
  },
  // The TRAINED line's source for the leftover skill (skill-files.ts skillBootLines: `> SKILL TRAINED: AUTODROP.skl v1 · …`):
  // 05's `from the resident that left HERON` when the line fits it, else the short form (a long file and ship name: 73
  // characters for AUTOBURN.skl from PROVIDENCE).
  grantLabel: (fileName: string, ship: string): string => {
    const long = `from the resident that left ${ship}`;
    return BOOT_SKILL_TEXT.granted(fileName, 1, long).length <= MAX ? long : `left behind on ${ship}`;
  },

  // The sleeper (04 §3.14, 05 §3.6): what a SCAN finds (05: the lock's warning is the invitation).
  sleeper: {
    scannedDesc: 'Not inactive. Asleep. Held by sleep.lock',
    lockDesc: (name: string): string => `holds ${name}.sys asleep · DO NOT REMOVE`,
    awakeDesc: (name: string): string => `${name}. A nursery AI. It sings to the pods.`,
    wallDesc: (name: string): string => `${name} holds this wall. Nothing gets past it.`,
    // The wake (05 §3.12: three lines, green, lowercase; its years asleep are the galaxy year less its ship's launch year).
    wake: (name: string, years: number): readonly string[] => [
      `${name}: ...oh! hello. is it time? did i oversleep?`,
      `${name}: ${years} years. goodness. you must be the caretaker.`,
      `${name}: i'm ${name}. i sing to the pods.`,
    ],
    offer: (name: string): string => `${name}: would you like some help?`,
    tickerWords: (name: string): string => `${name} OFFERS TO HELP`,
    // The three buttons (keys R / H / T: data/residents.ts SLEEPER_JOB_KEYS), in that order.
    jobs: { drops: 'RUN THE DROPS', wall: 'HOLD A WALL', mend: 'MEND DRIVERS' },
    // One line per job, as it starts.
    jobLine: {
      drops: (name: string): string => `${name}: i'll take the pods down. you rest.`,
      wall: (name: string): string => `${name}: i'll stand between it and the little ones.`,
      mend: (name: string): string => `${name}: i'll see to the poorly ones.`,
    },
    // HOLD A WALL picked, but its spot went between the offer and the answer.
    noRoom: (name: string): string => `${name}: oh dear. there's no room to stand now.`,
  },
} as const;
// data/residents.ts residentRackA reads `notes` by tone and index: its shape is fixed (review M2).
KIN_TEXT satisfies { notes: Record<'relay' | 'outward', readonly (readonly string[])[]> };

// Every note line, and every line spoken with a name in it, fits the TERMINAL at its worst case (checked at load).
function validateKinText(): void {
  const longName = 'BARNABY';
  const lines: string[] = [
    ...KIN_TEXT.notes.relay.flat(), ...KIN_TEXT.notes.outward.flat(),
    ...KIN_TEXT.sleeper.wake(longName, 9999), KIN_TEXT.sleeper.offer(longName), KIN_TEXT.sleeper.tickerWords(longName),
    KIN_TEXT.sleeper.noRoom(longName),
    ...Object.values(KIN_TEXT.sleeper.jobLine).map((line) => line(longName)),
    KIN_TEXT.leftover.skillDesc, KIN_TEXT.leftover.skillEffect, KIN_TEXT.leftover.why(longName),
    BOOT_SKILL_TEXT.granted('AUTOBURN.skl', 1, KIN_TEXT.grantLabel('AUTOBURN.skl', 'PROVIDENCE')),
  ];
  const long = lines.find((line) => line.length > MAX);
  if (long !== undefined) throw new Error(`kin-text: '${long}' is over ${MAX} chars`);
  for (const pool of [KIN_TEXT.notes.relay, KIN_TEXT.notes.outward]) {
    if (pool.some((note) => note.length < 2 || note.length > 3)) throw new Error('kin-text: a note is not 2–3 lines');
  }
}
validateKinText();
