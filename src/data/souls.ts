// The colonist name pools for the pods' sleepers (the file keeps its phase-2 name: many modules import it).
import type { Colonist } from '@/types/segment';
import type { Rng } from '@systems/rng';
import {
  FEATURED_PER_POD, COLONIST_LINE_MAX_CHARS, FAMILY_MAX_CHARS, MAX_LINE_CHARS,
} from '@data/tuning';

// The colonists (§6.7, 01-landing §3.8). Every pod carries a family of 200 people, and INSPECT and the
// LANDING REPORT name three of them. They must read as people, not data: a name, an age, one line about
// who they are (what they packed, what they want to do first) and the first thing they say on the
// ground. The run-1 ship-1 families are fixed (§6.7), so the story the design tells, Ada in POD 01
// next to the thing in the memory, is the one every first run plays. Everything else is drawn from
// the pools below with the ship's seeded stream (ShipDef.memory.drivers.familiesSeedStream).

// One pod's people: its family and the colonists INSPECT names.
export interface PodRoster {
  family: string;
  featured: Colonist[];
}

// The first run's ARES-VII, in pod order POD 01–03 (01-landing §2). POD 01 is the story's pod: its
// driver sits right after HOLLOW's root, and POD 02 BRANDT arrives hurt.
export const ARES_RUN1_FAMILIES: readonly string[] = ['Okafor', 'Brandt', 'Al-Sayed'];

// The person the first run is about (§1): her family's pod is HOLLOW's first bite, and she is first
// in the LANDING REPORT's credits. Her first words are the only line in the game nobody else says.
export const ADA: Readonly<Omit<Colonist, 'name'> & { first: string }> = {
  first: 'Ada',
  age: 11,
  line: 'wants to name the first tree.',
  firstWords: 'Is it morning?',
};

// A ship whose first families are written down (ship 1 on run 1): the family per pod in order,
// and the lead pod's first colonist.
export interface ScriptedRoster {
  families: readonly string[];
  leadIndex: number;  // 0-based pod index of the lead pod (POD 01 → 0)
  lead: typeof ADA;
}

// --- Seeded pools ------------------------------------------------------------------------------
// Families from everywhere (a fleet that left from the whole Earth), short enough for a chip.
export const FAMILY_POOL: readonly string[] = [
  'Achebe', 'Bauer', 'Castillo', 'Dlamini', 'Eriksen', 'Ferreira', 'Gallo', 'Haddad',
  'Ibarra', 'Jansen', 'Kowalski', 'Laurent', 'Moreau', 'Nguyen', 'Ortega', 'Petrov',
  'Quispe', 'Rossi', 'Sato', 'Tanaka', 'Udeh', 'Varga', 'Weber', 'Xu',
  'Yilmaz', 'Zhou', 'Adeyemi', 'Bianchi', 'Chowdhury', 'Dubois', 'Esposito', 'Fischer',
  'Gupta', 'Hoang', 'Iqbal', 'Jovanovic', 'Kim', 'Lopez', 'Mbeki', 'Novak',
  "O'Brien", 'Park', 'Rahman', 'Silva', 'Walsh', 'Yamada',
];

// Suvi replaced Sol (05-story.md §3.11's name rule: SOL is Earth on the chart; data/ship-names.ts validateNames).
export const FIRST_NAME_POOL: readonly string[] = [
  'Amara', 'Ben', 'Chiara', 'Dev', 'Elif', 'Finn', 'Grace', 'Hiro', 'Isla', 'Jonah',
  'Kiri', 'Leo', 'Maya', 'Nico', 'Omar', 'Priya', 'Quentin', 'Rosa', 'Sami', 'Tova',
  'Uma', 'Vik', 'Wren', 'Xander', 'Yara', 'Zane', 'Kofi', 'Lena', 'Mateo', 'Noor',
  'Oskar', 'Pita', 'Ravi', 'Sofia', 'Tomas', 'Ulla', 'Vera', 'Wei', 'Yusuf', 'Zara',
  'Arjun', 'Bea', 'Cyrus', 'Dara', 'Emil', 'Fatima', 'Gus', 'Hana', 'Ivo', 'Jada',
  'Kai', 'Lucia', 'Malik', 'Nell', 'Otto', 'Pia', 'Rumi', 'Suvi', 'Teo', 'Viola',
];

// Who they are, in one line (≤ COLONIST_LINE_MAX_CHARS). Things a kid would say about a person:
// what they packed, what they want to do first, what they are good at. None names an age, so any
// line fits any colonist.
export const LINE_POOL: readonly string[] = [
  "brought seeds from Gran's garden.",
  'wants to see two moons at once.',
  'promised a postcard to a friend.',
  'is going to be a vet for new animals.',
  'drew a map of a world nobody has seen.',
  'can whistle with two fingers.',
  'kept a pebble from Earth in a pocket.',
  'plans to build the first treehouse.',
  'sings to plants. Says it works.',
  'will open the very first bakery.',
  'taught the whole deck to play chess.',
  'is scared of the dark, but came anyway.',
  'wants to count the stars from outside.',
  'wrote a song for the landing.',
  'fixed every robot on the street.',
  'hopes it rains on the first day.',
  'wants to be the first to swim there.',
  'carved a boat for a sea nobody named.',
  'is saving a joke for the first dinner.',
  'knows the names of 200 bugs.',
  'will plant the first apple orchard.',
  'wants a window that faces sunrise.',
  'collects rocks. Plans to collect more.',
  'made everyone a friendship bracelet.',
  'promised to call home. Somehow.',
  'is going to teach the first school.',
  'still has the ticket from launch day.',
  'wants to hear what the wind sounds like.',
  'packed a kite. Just in case.',
  'brought a violin, wrapped in a scarf.',
  'dreams about green hills every night.',
  'wants to name a mountain after Mum.',
  'is going to build the first bridge.',
  'keeps a list of things to try first.',
  'saved the last chocolate bar for later.',
  "can't wait to walk barefoot on grass.",
  'wants to find out if there are frogs.',
  'learned every knot in the sailing book.',
  'will paint the first sunset there.',
  'brought a photo of the old house.',
];

// The first thing they say on the ground (the LANDING REPORT's credits, the first touchdown's radio line). "Is it morning?" is Ada's
// alone.
export const FIRST_WORDS_POOL: readonly string[] = [
  'Did we make it?',
  'Are we there yet?',
  'Why is the sky that colour?',
  'I had the longest dream.',
  'Can I see outside?',
  'Is my brother here?',
  'My feet feel funny.',
  'Is it warm out there?',
  'Who flew us here?',
  'How long was I asleep?',
  "I'm so hungry.",
  'Is it real?',
  'Does it smell like rain?',
  'Are there birds?',
  'Can we go out now?',
  'Hello? Is anyone there?',
  'I can hear the wind!',
  'Did someone keep us safe?',
  'Thank you.',
  'Is the sun bigger here?',
];

// What someone says after a HARD landing (a failing driver, §3.8): gentle, never frightening (§1 tone guardrails).
// PLACEHOLDER: 05-story writes the hard and off-site pools. The LANDING REPORT says these in place of the colonist's
// own first words, so a hard landing is heard, not just counted; no two credits on a ship say the same line, so there
// are at least PODS_MAX of them (data/ships.ts checks every ship's pod count against it).
export const HARD_WORDS_POOL: readonly string[] = [
  'That was a bumpy one!',
  'Is everyone all right?',
  'My ears are still ringing.',
  'I think I bit my tongue.',
  'Remind me to walk next time.',
  'Did we bounce?',
  'That was louder than I thought.',
  'I can still feel the thump.',
  'Who was driving?',
  'Everything is upside down.',
  'My bag went flying.',
  'Was that the ground?',
  'Hold on, the room is spinning.',
  'We made it. Just.',
  'I dropped my pebble!',
  'Can we do that more softly?',
];

// Ages: a ship carries whole families, so a third of the people INSPECT names are children (the
// player is twelve), most are grown-ups, some are old. Each band is picked with its weight, then
// an age inside it.
const AGE_BANDS: readonly { weight: number; min: number; max: number }[] = [
  { weight: 0.35, min: 4, max: 16 },
  { weight: 0.45, min: 19, max: 58 },
  { weight: 0.2, min: 61, max: 88 },
];

// --- Rolling a ship's roster ---------------------------------------------------------------------

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

// Deals from a shuffled pool, reshuffling when it runs out: lines and first words may repeat
// across a big ship, never next to each other in one pod's three.
function dealer<T>(pool: readonly T[], rng: Rng): () => T {
  let deck: T[] = [];
  return () => {
    if (deck.length === 0) deck = shuffled(pool, rng);
    return deck.pop()!;
  };
}

// The bands' weights sum to 1 (validated below), so the last band takes whatever the others
// did not: float rounding in the running subtraction can never fall off the end.
function rollAge(rng: Rng): number {
  let pick = rng();
  let band = AGE_BANDS[AGE_BANDS.length - 1]!;
  for (const candidate of AGE_BANDS.slice(0, -1)) {
    if (pick < candidate.weight) { band = candidate; break; }
    pick -= candidate.weight;
  }
  return band.min + Math.floor(rng() * (band.max - band.min + 1));
}

// A child's age (the first age band): a returning unit's ship 1 has no Ada, but its lead pod's first
// colonist is still a kid (data/memory.ts), so the bite next to the root is still about someone like her.
export function rollChildAge(rng: Rng): number {
  const band = AGE_BANDS[0]!;
  return band.min + Math.floor(rng() * (band.max - band.min + 1));
}

export function colonistName(family: string, first: string): string {
  return `${family}, ${first}`;
}

// The roster of a ship's `podCount` pods, in address order. A scripted ship keeps its written
// families and lead colonist; everything else is seeded. First names never repeat within a ship (60
// names cover the 16 pods × 3 of the biggest ship), so every person INSPECT names is someone else.
export function rollRoster(podCount: number, rng: Rng, scripted: ScriptedRoster | null): PodRoster[] {
  if (scripted && scripted.families.length !== podCount) {
    throw new Error(`rollRoster: the script names ${scripted.families.length} families for ${podCount} pods`);
  }
  const families = scripted ? [...scripted.families] : shuffled(FAMILY_POOL, rng).slice(0, podCount);
  if (families.length < podCount) throw new Error(`rollRoster: only ${FAMILY_POOL.length} families for ${podCount} pods`);
  const firstNames = shuffled(FIRST_NAME_POOL.filter((name) => name !== scripted?.lead.first), rng);
  if (firstNames.length < podCount * FEATURED_PER_POD) {
    throw new Error(`rollRoster: ${firstNames.length} first names for ${podCount * FEATURED_PER_POD} colonists`);
  }
  const nextLine = dealer(LINE_POOL.filter((line) => line !== scripted?.lead.line), rng);
  const nextWords = dealer(FIRST_WORDS_POOL, rng);

  return families.map((family, index) => {
    const featured: Colonist[] = [];
    if (scripted && index === scripted.leadIndex) {
      const { first, age, line, firstWords } = scripted.lead;
      featured.push({ name: colonistName(family, first), age, line, firstWords });
    }
    // A pool reshuffles when it runs out, so the same line can come up twice in a row: draw again,
    // so the three people of one family never say the same thing.
    const fresh = (deal: () => string, taken: (colonist: Colonist) => string): string => {
      let pick = deal();
      while (featured.some((colonist) => taken(colonist) === pick)) pick = deal();
      return pick;
    };
    while (featured.length < FEATURED_PER_POD) {
      featured.push({
        name: colonistName(family, firstNames.pop()!),
        age: rollAge(rng),
        line: fresh(nextLine, (colonist) => colonist.line),
        firstWords: fresh(nextWords, (colonist) => colonist.firstWords),
      });
    }
    return { family, featured };
  });
}

// How the game names a colonist, in INSPECT and in the LANDING REPORT: first name first, like a
// person and not a record (`Ada Okafor`). Names are stored `Family, First` (colonistName).
export function creditName(colonist: Colonist): string {
  const comma = colonist.name.indexOf(', ');
  if (comma < 0) throw new Error(`creditName: '${colonist.name}' is not 'Family, First'`);
  return `${colonist.name.slice(comma + 2)} ${colonist.name.slice(0, comma)}`;
}

// How INSPECT introduces a colonist, as a sentence about a person: `Ada Okafor, 11, wants to name
// the first tree.` (every line is what they do or want, so it follows the name and age).
export function colonistIntro(colonist: Colonist): string {
  return `${creditName(colonist)}, ${colonist.age}, ${colonist.line}`;
}

// The pools are checked once at load: every name fits its chip and every intro fits a line, with
// the longest family and first name together, and nothing repeats. A bad entry would surface as a
// cut-off name in the middle of the LANDING REPORT; here it fails the page instead.
function validateSouls(): void {
  const fail = (why: string): never => { throw new Error(`data/souls.ts: ${why}`); };
  const unique = (name: string, list: readonly string[]): void => {
    if (new Set(list).size !== list.length) fail(`${name} has duplicates`);
  };
  unique('FAMILY_POOL', FAMILY_POOL);
  unique('ARES_RUN1_FAMILIES', ARES_RUN1_FAMILIES);
  unique('FIRST_NAME_POOL', FIRST_NAME_POOL);
  unique('LINE_POOL', LINE_POOL);
  unique('FIRST_WORDS_POOL', FIRST_WORDS_POOL);
  unique('HARD_WORDS_POOL', HARD_WORDS_POOL);
  for (const words of [...FIRST_WORDS_POOL, ...HARD_WORDS_POOL, ADA.firstWords]) {
    if (words.length > COLONIST_LINE_MAX_CHARS) fail(`first words '${words}' are longer than ${COLONIST_LINE_MAX_CHARS}`);
  }
  for (const family of [...FAMILY_POOL, ...ARES_RUN1_FAMILIES]) {
    if (family.length > FAMILY_MAX_CHARS) fail(`family '${family}' is longer than ${FAMILY_MAX_CHARS}`);
  }
  for (const family of ARES_RUN1_FAMILIES) {
    if (FAMILY_POOL.includes(family)) fail(`'${family}' is both scripted and in the pool`);
  }
  for (const line of [...LINE_POOL, ADA.line]) {
    if (line.length > COLONIST_LINE_MAX_CHARS) fail(`line '${line}' is longer than ${COLONIST_LINE_MAX_CHARS}`);
  }
  if (FIRST_WORDS_POOL.includes(ADA.firstWords)) fail(`Ada's first words are hers alone`);
  // A hard-landing line must never be someone's own first words: the credits tell them apart by the words.
  for (const words of HARD_WORDS_POOL) {
    if (FIRST_WORDS_POOL.includes(words) || words === ADA.firstWords) fail(`'${words}' is both a hard-landing line and someone's first words`);
  }
  const longest = (list: readonly string[]): string => list.reduce((a, b) => (b.length > a.length ? b : a), '');
  const worst = colonistIntro({
    name: colonistName(longest([...FAMILY_POOL, ...ARES_RUN1_FAMILIES]), longest([...FIRST_NAME_POOL, ADA.first])),
    age: Math.max(...AGE_BANDS.map((band) => band.max)),
    line: longest([...LINE_POOL, ADA.line]),
    firstWords: '',
  });
  if (worst.length > MAX_LINE_CHARS) fail(`the longest intro '${worst}' is over ${MAX_LINE_CHARS} chars`);
  const totalWeight = AGE_BANDS.reduce((sum, band) => sum + band.weight, 0);
  if (Math.abs(totalWeight - 1) > 1e-9) fail(`AGE_BANDS weights sum to ${totalWeight}, not 1`);
}
validateSouls();
