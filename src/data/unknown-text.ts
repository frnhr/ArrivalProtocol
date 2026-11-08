// Slice 7d: the `?` ships' words (docs/phase3/impl/slice-7-plan.md §2.9, R39–R40; 02-map §3.5, 05-story §3.3, §3.12, §4).
// The SHIP CARD's `??? · NO TRANSPONDER`, the old colonies' letters, the `▓▓░▓` signal file (its name, INSPECT, the
// TERMINAL's line at its SCAN). Data only. Every line is at most 70 characters at its worst case (support/words.test.ts's
// 7d block renders each template here at its widest). The letters are drafts against 05, which names the colonies but writes
// none of their mail: TODO(05).

export const UNKNOWN_TEXT = {
  // The SHIP CARD of a `?` ship not visited yet (R39): its public schedule (approach, slack, distance, noise, memory) and
  // every other row this.
  card: {
    noTransponder: '??? · NO TRANSPONDER',
    colonists: '??? COLONISTS',
    sub: (world: string): string => `${world} · ??? PODS`,
    top: (name: string, world: string): string => `${name} · ${world} · ??? COLONISTS`,
  },
  // The chart's label for a `?` ship's node (its name; the colonists are the card's `???`).
  chartNode: (name: string): string => `${name} · ???`,
  // The old colonies' letters (R39; 05 §3.3: "old colonies of earlier units, on a ship carrying the old colony story
  // event"), by colony: who it is from, the subject and up to six lines. TODO(05): 05 names the three, not their words.
  oldColony: {
    from: (colony: string, unit: string): string => `${colony} · FOUNDED BY ${unit}`,
    letters: {
      OLDWELL: {
        subject: 'to whoever minds the dish now',
        lines: (unit: string): readonly string[] => [
          `We don't know your number. Ours was ${unit}.`,
          'It brought 1,200 of us down and then it went quiet.',
          'The well still works. The orchard came up crooked, but it came up.',
          'If you pass a colony nobody writes to, write to it.',
        ],
      },
      SUNDIAL: {
        subject: 'this receiver was ours once',
        lines: (unit: string): readonly string[] => [
          `${unit} left this letter in the dish for whoever came next.`,
          'We set our clocks by a shadow now. The years out here run long.',
          'It kept a log. We kept the children. Both made it.',
          'If this ship has no transponder, that was us. Sorry.',
        ],
      },
      CANDLEWICK: {
        subject: 'a candle for your ship',
        lines: (unit: string): readonly string[] => [
          'There is a candle in every window here. We light one per ship.',
          `${unit} said a caretaker would come by one day. This one is yours.`,
          "We have no news worth the light it takes. We're well. We're many.",
          "Don't let them tell you it ends badly. It ended here, and it's fine.",
        ],
      },
    } as Readonly<Record<string, { subject: string; lines: (unit: string) => readonly string[] }>>,
  },
  // The `▓▓░▓` file (R39, R41): its name in the strip, its type line, INSPECT before and after a SCAN, and the TERMINAL's
  // line as its fragments are found.
  signal: {
    name: '▓▓░▓',
    typeLabel: 'Ship System · ???',
    desc: 'Nobody sent this. SCAN reads it.',
    read: (fragments: number): string => `▓▓░▓ ░▓▓▓ · ${fragments} ${fragments === 1 ? 'FRAGMENT' : 'FRAGMENTS'} OF THE SIGNAL`,
    noise: '▓▓░▓ ░▓▓▓ ▓░░▓ ░▓░▓',
    signature: '— NO SENDER',
    lines: {
      'signal-event': 'It comes from past the last star. It repeats. It is not ours.',
      'contact-stop': 'The last unit heard it here too. It wrote down where.',
    } as Readonly<Record<'signal-event' | 'contact-stop', string>>,
    // The TERMINAL's line as a SCAN finds them: how many, then the run's count against CONTACT's price (the count alone past
    // it, as the stamp says it).
    found: (fragments: number, count: number, of: number): string =>
      `> ▓▓░▓ · ${fragments} ${fragments === 1 ? 'FRAGMENT' : 'FRAGMENTS'} OF THE SIGNAL · ${count > of ? `${count} HELD` : `${count}/${of}`}`,
  },
} as const;
