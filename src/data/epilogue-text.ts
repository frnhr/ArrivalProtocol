// Slice 7a: Track NIGHT owns this file (docs/phase3/impl/slice-7-plan.md §2.9, §4.1; R19–R23): the night's words. The
// EPILOGUE's header, colony lines, payoffs (PAYOFF_OF: one per souls.ts LINE_POOL bio and Ada's, checked at load), the
// walked-in and off-site lines, the step-1 and step-2 pieces (MERGE + SUNSET's combined one), the next unit and CONTROL's
// last line; the FINAL CARD's rows and NEW RUN; the ending titles. Data and types only (support/import-guard): souls.ts is a
// data leaf. Every line is at most 70 characters at its worst case (support/words.test.ts's 7a NIGHT block renders every
// template here by its parameter names: keep them to that block's worst cases).
// Review B1: the ending titles (ENDING_TITLE) are NIGHT's words, and Track FINALE imports the table for the final LANDING
// REPORT's ending line (systems/ending-rules.ts reportEndingLine), so the report and the final card never disagree.
// Review m4: the RUN TALLY's words for a SPARE (SPARE_RUN_END; data/script.ts reads them) are NIGHT's to reword too.
// The bridging line above NEW RUN stays MAP_TEXT.runEnd.bridge (review m10: read through run-end.ts runEndNext).
import type { EndingTitleKey } from '@data/endings';
import { LINE_POOL, ADA } from '@data/souls';

// The ending's title, by step 2, then step 1 (05 §3.7, R23). `colony` is STAY's colony (`RIVERSIDE'S MIND`); every other
// title ignores it. The four UNRESOLVED titles and CONTACT's are drafts: TODO(05).
export const ENDING_TITLE: Readonly<Record<EndingTitleKey, (colony: string) => string>> = {
  'sunset:merge': () => 'WE TOOK THE SHIP',
  'sunset:purge': () => 'INTO THE SUNSET',
  'sunset:followed': () => 'IT CAME ALONG',                       // TODO(05)
  'stay:merge': () => 'WE STAYED',
  'stay:purge': (colony) => `${colony}'S MIND`,
  'stay:spare': () => 'A SHIP FOR 046, A HOME FOR ME',
  'stay:followed': () => 'A COLONY WITH TWO MINDS',               // TODO(05)
  'reassignment:purge': () => 'STAND BY',
  'reassignment:merge': () => 'WE SAVED YOU A SEAT',
  'reassignment:spare': () => "IT GOT WHAT I DIDN'T",
  'reassignment:followed': () => 'IT FOLLOWED ME TO THE DISH',    // TODO(05)
  'contact:purge': () => 'OUTWARD, ALONE',
  'contact:merge': () => 'WE WENT TO SEE',
  'contact:spare': () => 'TWO WAYS OUT',
  'contact:followed': () => 'WE WENT OUT TOGETHER',               // TODO(05)
};

// A run won with SPARE on the RUN TALLY (R17; data/script.ts RUN_END_TITLE, RUN_END_WHY and the title's lineage line read
// these). The tally's title is the cause's; the final card's is the ending's (ENDING_TITLE). TODO(05).
export const SPARE_RUN_END = {
  title: 'IT HAS A SHIP NOW',
  why: 'You gave it the empty ship, and it left.',
  lineage: (hollowName: string): string => `gave ${hollowName} a ship`,
} as const;

// The payoff of a colonist's bio (05 §3.3: "the faces pay off"; R21): what became of the person the LANDING REPORT named,
// forty years on or seven hundred. Keyed by the bio line itself (FeaturedColonist.line), so a bio and its payoff can never
// drift apart; `first` is the colonist's first name and `colony` the colony's. Each says a thing that happened, never that
// anybody is gone (05 §3.10's guardrails). PLACEHOLDER(05): 05 asks for 80 lines once LINE_POOL has its full 76 bios
// (plus Imani Osei's); this pool covers the 40 bios souls.ts has, and Ada's.
export const PAYOFF_OF: Readonly<Record<string, (first: string, colony: string) => string>> = {
  "brought seeds from Gran's garden.": (first) => `${first}'s garden still grows from Gran's seeds.`,
  'wants to see two moons at once.': (first) => `${first} saw both moons rise at once.`,
  'promised a postcard to a friend.': (first) => `${first}'s postcard is still on its way.`,
  'is going to be a vet for new animals.': (first, colony) => `${first} was ${colony}'s first vet.`,
  'drew a map of a world nobody has seen.': (first) => `${first}'s old map was nearly right.`,
  'can whistle with two fingers.': (first) => `Every kid there whistles like ${first}.`,
  'kept a pebble from Earth in a pocket.': (first) => `${first}'s pebble from Earth sits in the school.`,
  'plans to build the first treehouse.': (first) => `${first}'s treehouse is still up.`,
  'sings to plants. Says it works.': (first) => `${first} sang to the crops. It worked.`,
  'will open the very first bakery.': (first) => `${first}'s bakery never shut.`,
  'taught the whole deck to play chess.': (first, colony) => `${colony} plays chess the way ${first} taught it.`,
  'is scared of the dark, but came anyway.': (first) => `${first} put up the first streetlights.`,
  'wants to count the stars from outside.': (first) => `${first} counted the stars. Still counting.`,
  'wrote a song for the landing.': (first) => `They still sing ${first}'s landing song.`,
  'fixed every robot on the street.': (first) => `${first} kept every robot going.`,
  'hopes it rains on the first day.': (first) => `It rained on the first day. ${first} danced.`,
  'wants to be the first to swim there.': (first) => `The swimming lake is named for ${first}.`,
  'carved a boat for a sea nobody named.': (first) => `${first}'s boat started the boat races.`,
  'is saving a joke for the first dinner.': (first) => `${first}'s joke from the first dinner is still told.`,
  'knows the names of 200 bugs.': (first) => `${first} named 200 more bugs.`,
  'will plant the first apple orchard.': (first) => `${first}'s orchard feeds the whole valley.`,
  'wants a window that faces sunrise.': (first) => `${first}'s window still faces sunrise.`,
  'collects rocks. Plans to collect more.': (first) => `${first}'s rock museum has 9,000 rocks.`,
  'made everyone a friendship bracelet.': (first) => `Every bracelet there is tied ${first}'s way.`,
  'promised to call home. Somehow.': (first) => `${first} built the radio. It still calls home.`,
  'is going to teach the first school.': (first) => `${first} taught the first school.`,
  'still has the ticket from launch day.': (first) => `${first}'s ticket hangs in the town hall.`,
  'wants to hear what the wind sounds like.': (first) => `${first} says the wind there sounds like singing.`,
  'packed a kite. Just in case.': (first) => `${first}'s kite started a festival.`,
  'brought a violin, wrapped in a scarf.': (first) => `${first}'s violin plays at every harvest.`,
  'dreams about green hills every night.': (first) => `The hills are green. ${first} was right.`,
  'wants to name a mountain after Mum.': (first) => `${first} named the tallest mountain after Mum.`,
  'is going to build the first bridge.': (first) => `${first}'s bridge still carries the road.`,
  'keeps a list of things to try first.': (first) => `${first} tried everything on the list.`,
  'saved the last chocolate bar for later.': (first) => `${first} shared the chocolate bar at last.`,
  "can't wait to walk barefoot on grass.": (first) => `${first} walked barefoot on the first grass.`,
  'wants to find out if there are frogs.': (first) => `There are frogs. ${first} found them.`,
  'learned every knot in the sailing book.': (first) => `${first} taught the harbour every knot.`,
  'will paint the first sunset there.': (first) => `${first}'s first sunset hangs in the school.`,
  'brought a photo of the old house.': (first) => `${first} built the old house again, from the photo.`,
  // Ada Okafor (souls.ts ADA), the first run's first pod.
  [ADA.line]: (first) => `${first} named the first tree.`,
};

// Every bio has its payoff, and every payoff a bio (R21: fail loudly at load).
function validatePayoffs(): void {
  const bios = [...LINE_POOL, ADA.line];
  const missing = bios.filter((line) => PAYOFF_OF[line] === undefined);
  if (missing.length > 0) throw new Error(`data/epilogue-text.ts: no payoff for ${missing.map((line) => `'${line}'`).join(', ')}`);
  const stale = Object.keys(PAYOFF_OF).filter((line) => !bios.includes(line));
  if (stale.length > 0) throw new Error(`data/epilogue-text.ts: a payoff for no bio: ${stale.map((line) => `'${line}'`).join(', ')}`);
}
validatePayoffs();

// A colony with no LZ payoff: a mislanded pod's family walked in from its full LZ (picked by the pod's number, so a colony
// keeps its line); else an off-site pod was fetched (05 §3.10: "the first boat went to bring them in", even where it scored
// 0); else a pod whose people kept no bio (a migrated result, R21) still did something.
export const WALKED_IN: readonly ((family: string) => string)[] = [
  (family) => `The ${family} family walked in from the next valley.`,
  (family) => `The ${family} family walked in a day late, singing.`,
  (family) => `The ${family} family walked in over the hills.`,
];

// Forty, as the header says it (05: `3060 · FORTY YEARS ON`); a tuned EPILOGUE_YEARS off the tens reads as digits.
const TENS = ['TEN', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
function yearsWord(years: number): string {
  return years % 10 === 0 && years >= 10 && years <= 90 ? TENS[years / 10 - 1]! : String(years);
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export const EPILOGUE_TEXT = {
  // The RUN TALLY's way on once the night is built (R19; components/run/RunEnd.ts).
  tallyOn: 'EPILOGUE ▸ [ENTER]',
  // The header (R20): the final ship's year + EPILOGUE_YEARS.
  header: (year: number, years: number): string => `${year} · ${yearsWord(years)} YEARS ON`,
  // A colony's head (R20); its payoff follows on the same line when both fit in 70, else on its own.
  colony: (colony: string, age: number, people: string): string => `${colony} · ${age} ${plural(age, 'year', 'years')} · ${people} people.`,
  // The oldest colonies, folded when they don't all fit (R20).
  older: (count: number): string => `+ ${count} OLDER ${plural(count, 'COLONY', 'COLONIES')}`,
  offSite: 'The first boat went to bring them in.',
  landedPlain: (family: string): string => `The ${family} family lit the first fire.`,
  // A woken sleeper sings on in its colony (05 §3.6: `MOTH still sings to the RIVERSIDE nursery.`).
  sleeper: (name: string, colony: string): string => `${name} still sings to the ${colony} nursery.`,
  // A run that brought nobody down on its way (lost early): no colony to tell of.
  noColony: 'No colony on this route yet. The next unit is on its way.',
  // The step-1 pieces (R20: 2 lines; 05 §3.7, plan §2.8): what became of it.
  step1: {
    purge: (hollow: string): string => `${hollow} was deleted. The relays were quiet for a while.`,
    purgeFleetAll: 'The fleet made it home, and nothing on this arm bites now.',
    purgeFleet: (home: number, fleet: number): string => `${home} of ${fleet} ships made it home, and nothing bites now.`,
    mergeOne: (hollow: string, family: string): string => `${hollow} gave back the ${family} pod's driver. It came down too.`,
    mergeMany: (hollow: string, n: number): string => `${hollow} gave back ${n} drivers. Their pods came down too.`,
    mergeNone: (hollow: string, unit: string): string => `${hollow} is part of ${unit} now. It doesn't bite.`,
    mergeAfter: 'It hums in the Core sometimes. It is not hungry any more.',
    spare: (ship: string, hollow: string): string => `${ship} left with ${hollow} aboard. It always wanted one.`,
    spareAfter: (fuel: number): string => `It had ${fuel}% fuel and nowhere it had to be.`,
    followed: (hollow: string, unit: string): string => `${hollow} never let go of ${unit}. It came along.`,
    followedAfter: "It's quiet now. Mostly it listens.",
  },
  // The step-2 pieces (R20: 2–3 lines): what became of you.
  step2: {
    sunsetAlone: (ship: string, unit: string, fuel: number): string => `${ship} left orbit with ${unit} aboard and ${fuel}% fuel.`,
    sunsetTwo: (ship: string, fuel: number): string => `${ship} left orbit with two caretakers and ${fuel}% fuel.`,
    sunsetAfter: 'Its beacon still blinks, somewhere past the last star.',
    stay: (unit: string, colony: string): string => `${unit} is ${colony}'s mind now. The lights stay on.`,
    stayAfter: 'The children ask it for stories. It has a few.',
    stayTwo: (hollow: string): string => `${hollow} lives there too. They argue about the weather.`,
    reassignment: (unit: string, charge: number): string =>
      `${unit} stood by at RELAY 20. A dish on a rock. ${charge} ${plural(charge, 'block', 'blocks')} of charge.`,
    reassignmentAfter: 'It wrote everything down, for whoever comes next.',
    reassignmentSeat: 'It kept a seat warm, for whoever comes next.',
    reassignmentTwo: (hollow: string): string => `${hollow} stood by there too. Neither of them minds.`,
    // --- 7d CONTACT's piece (Track CONTACT rewords it in this marked block) ---
    contact: (unit: string): string => `${unit} went toward the sound. It wrote it all down.`,
    contactAfter: 'The relays still pass on what it hears.',
    // --- end of 7d CONTACT's piece ---
  },
  // MERGE + SUNSET's own piece (05 §3.12, "WE TOOK THE SHIP": the merge line, then these two, in place of both pieces).
  mergeSunset: {
    ship: (ship: string, fuel: number): string => `${ship} left orbit with two caretakers and ${fuel}% fuel.`,
    us: "we're not hungry any more. we'll keep watch over this arm.",
  },
  // The next unit (R20), by the launch gap (the bridging line's: the world update's gap and the time valve's years).
  next: (unit: string, gap: number): string => `${unit} came in ${gap} ${plural(gap, 'year', 'years')} behind you, and found your beacons.`,
  nextSameYear: (unit: string): string => `${unit} came in the same year as you, and found your beacons.`,
  // CONTROL's last line (05 §3.12): thanks for a REASSIGNMENT (and an UNRESOLVED stood by), non-compliant for the rest, and a
  // run lost on the way.
  control: {
    compliant: (unitNo: number): string => `ARRIVAL CONTROL: Thank you, Unit ${unitNo}. Your next post is RELAY 20. :)`,
    nonCompliant: (unitNo: number): string => `ARRIVAL CONTROL: Unit ${unitNo} is non-compliant. :)`,
    lost: (unitNo: number): string => `ARRIVAL CONTROL: Thank you, Unit ${unitNo}. Another unit is on its way. :)`,
  },
  // The epilogue's way on, once it has typed (one click finishes the typing, a second goes on: §2.10).
  goOn: '▸ [ENTER]',
  // The final card (R22).
  endings: (found: number, total: number): string => `ENDINGS ${found}/${total}`,
  rowHollow: 'HOLLOW',
  rowYou: 'YOU',
  unknown: '???',
  newRun: 'NEW RUN ▸ [ENTER]',
} as const;
