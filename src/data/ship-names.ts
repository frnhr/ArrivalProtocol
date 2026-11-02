// Slice 3c: Track WORLD owns this file (docs/phase3/impl/slice-3c-plan.md §5.1); SAVE and UI request changes by message.
import { NAME_MAX_CHARS } from '@data/tuning';
import { WORLDS } from '@data/arm';
import { FAMILY_POOL, FIRST_NAME_POOL, ARES_RUN1_FAMILIES } from '@data/souls';

// Every name the map shows (docs/phase3/05-story.md §3.11; slice-3a-plan §2.1): the ship pools, the ARES series, the
// final ships, the colonies, 046's written trail and the residents. 05 owns the words; validateNames runs at load.
// Track GEN owns this file after the foundation.

// The hand-written ships (run 1's, placed at their worlds by data/run1-arm.ts).
export const AUTHORED_SHIP_NAMES: readonly string[] = ['ARES-VII', 'HALCYON', 'KESTREL', 'VESPER', 'LAST LIGHT'];

// The 21 names generated ships draw from (05 §3.11), each at most NAME_MAX_CHARS. A name leaves the pool while a ship on
// the chart carries it; a ship is never named after its world.
export const GENERATED_SHIP_NAMES: readonly string[] = [
  'CORMORANT', 'PETREL', 'OSPREY', 'HERON', 'CURLEW', 'LAPWING', 'GANNET', 'PLOVER', 'SKYLARK', 'SHEARWATER', 'KITTIWAKE',
  'ALBATROSS', 'PATIENCE', 'GOOD HOPE', 'PROVIDENCE', 'BELLWETHER', 'TIDINGS', 'FAR WIND', 'MORNING STAR', 'STEADFAST',
  'WAYFARER',
];

// The final ships after LAST LIGHT (05 §3.11), by serial (slice 3c: the world update names each new final ship by the
// arm's serial, not by run, since a final ship nobody reached waits into the next run): LODESTAR first, then the same
// names with II and III. `FAR SHORE III` is 13 characters, over NAME_MAX_CHARS: left out (raised with 05's owner; the
// list wraps after HOMEWARD III, so no serial is ever without a name).
export const FINAL_SHIP_NAMES: readonly string[] = [
  'LODESTAR', 'EVENSONG', 'FAR SHORE', 'HOMEWARD',
  'LODESTAR II', 'EVENSONG II', 'FAR SHORE II', 'HOMEWARD II',
  'LODESTAR III', 'EVENSONG III', 'HOMEWARD III',
];

// The final ship of serial `serial`: LAST LIGHT is 0 (run 1's authored one), then the list in order, wrapping.
export function finalShipNameOfSerial(serial: number): string {
  if (!(Number.isInteger(serial) && serial >= 0)) throw new Error(`finalShipNameOfSerial: serial ${serial}`);
  return serial === 0 ? 'LAST LIGHT' : FINAL_SHIP_NAMES[(serial - 1) % FINAL_SHIP_NAMES.length]!;
}

// 3a's interim (a fresh roll for run `run` names its final ship as if one new final ship came every run): serial run − 1.
export function finalShipName(run: number): string {
  if (!(Number.isInteger(run) && run >= 1)) throw new Error(`finalShipName: run ${run}`);
  return finalShipNameOfSerial(run - 1);
}

// Roman numerals for the ARES series.
function roman(n: number): string {
  const steps: [number, string][] = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let left = n;
  let out = '';
  for (const [value, glyph] of steps) {
    while (left >= value) { out += glyph; left -= value; }
  }
  return out;
}

// The first ship of run `run` (05 §3.11): ARES-VII on run 1, ARES-VIII on run 2, … one for each core, to Kepler-186f.
// Roman numerals fit NAME_MAX_CHARS (12) up to ARES-LXXXVII (run 81); 05 says "up to ARES-LXXXVIII", which is 13
// characters. Past run 81 the series goes on in Arabic numerals, ARES-88 onward (slice 3c plan risk 6: a kid on run 82
// must not crash in the world update; raised with 05's owner), which stays within NAME_MAX_CHARS for any run a save can
// reach.
export const ARES_SERIES_RUNS = 81;
export function aresName(run: number): string {
  if (!(Number.isInteger(run) && run >= 1)) throw new Error(`aresName: run ${run}`);
  return run <= ARES_SERIES_RUNS ? `ARES-${roman(run + 6)}` : `ARES-${run + 6}`;
}

// The colonies (05 §3.11): the first pod down names the settlement, `{FAMILY} LANDING` half the time, else one of these.
// RIVERSIDE (ARES-VII) and FIRST LIGHT (LAST LIGHT) are run 1's written ones; the old-colony event's are from units long
// before.
export const COLONY_NAMES: readonly string[] = [
  'FIRSTFALL', 'LANTERN', 'GREENSTEP', 'STARFORD', 'HARBOUR', 'SALTMARSH', 'BRIGHTWELL', 'ORCHARD', 'NEWBRIDGE',
  'TWO MOONS', 'HOMESTEAD', 'WELLSPRING', 'KITEHILL', 'FAIRWEATHER',
];
export const WRITTEN_COLONY_NAMES: readonly string[] = ['RIVERSIDE', 'FIRST LIGHT'];
export const OLD_COLONY_NAMES: readonly string[] = ['OLDWELL', 'SUNDIAL', 'CANDLEWICK'];

// 046's written trail on run 1 (05 §3.11; slice-3a-plan §1.1 item 20): where it got there first, and when. Each world
// reads `UNIT-046 GETS THERE FIRST` until the galaxy year passes its year; the trail ends in a grey cross past Calder.
export interface TrailMark {
  colony: string | null;   // null: the grey cross (where 046 was lost: RELAY 19)
  slot: number;
  year: number;
}
export const UNIT_046_TRAIL: readonly TrailMark[] = [
  { colony: 'WAYPOINT', slot: 0, year: 2299 },
  { colony: 'MERIDIAN', slot: 1, year: 2350 },
  { colony: 'TALLGRASS', slot: 4, year: 2464 },
  { colony: null, slot: 8, year: 2598 },
];

// The residents (05 §3.11): the ship-AI pool for corrupted and gone residents, and the sleepers'.
export const RESIDENT_NAMES: readonly string[] = ['WARDEN', 'STEWARD', 'KEEPER', 'HELM', 'BOSUN', 'PURSER', 'LOOKOUT', 'PILOT'];
export const SLEEPER_NAMES: readonly string[] = ['MOTH', 'PIP', 'BARNABY', 'LUMEN'];

// Names on the chart that are no pool's: Earth is SOL.
const OTHER_NAMES: readonly string[] = ['SOL'];

// Does `whole` contain `part` as whole words (ignoring case)? `FAR WIND` is in `THE FAR WIND`, not in `FARWINDS`.
function containsWords(whole: string, part: string): boolean {
  const escaped = part.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9'])${escaped}($|[^a-z0-9'])`).test(whole.toLowerCase());
}

export interface NameClash {
  a: string;
  b: string;
  lists: [string, string];
}

// 05 §3.11's rule: a name in one list never equals, or appears as a whole word inside, a name in another list, ignoring
// case; resident names never equal a colonist first name; the chart's SOL is no colonist's first name either. Plus the
// screen's rule: every ship name fits NAME_MAX_CHARS. Pure (the suites feed it clashing lists); validateNames throws.
export function nameClashes(lists: Readonly<Record<string, readonly string[]>>): NameClash[] {
  const clashes: NameClash[] = [];
  const keys = Object.keys(lists);
  keys.forEach((keyA, i) => {
    for (const keyB of keys.slice(i + 1)) {
      if ((keyA === 'firstNames') !== (keyB === 'firstNames')) {
        const other = keyA === 'firstNames' ? keyB : keyA;
        if (other !== 'residents' && other !== 'others') continue;
      }
      for (const a of lists[keyA]!) {
        for (const b of lists[keyB]!) {
          if (containsWords(a, b) || containsWords(b, a)) clashes.push({ a, b, lists: [keyA, keyB] });
        }
      }
    }
  });
  return clashes;
}

export function shipNameLists(): Record<string, readonly string[]> {
  return {
    worlds: WORLDS.map((def) => def.name),
    ships: [
      ...AUTHORED_SHIP_NAMES, ...GENERATED_SHIP_NAMES, ...FINAL_SHIP_NAMES,
      ...Array.from({ length: ARES_SERIES_RUNS - 1 }, (_, i) => aresName(i + 2)),
    ],
    colonies: [...COLONY_NAMES, ...WRITTEN_COLONY_NAMES, ...OLD_COLONY_NAMES],
    trail: UNIT_046_TRAIL.flatMap((mark) => (mark.colony === null ? [] : [mark.colony])),
    residents: [...RESIDENT_NAMES, ...SLEEPER_NAMES],
    families: [...FAMILY_POOL, ...ARES_RUN1_FAMILIES],
    firstNames: FIRST_NAME_POOL,
    others: OTHER_NAMES,
  };
}

export function validateNames(): void {
  const lists = shipNameLists();
  const clashes = nameClashes(lists);
  if (clashes.length > 0) throw new Error(`names: ${clashes.map((c) => `${c.a} (${c.lists[0]}) / ${c.b} (${c.lists[1]})`).join('; ')}`);
  const long = lists.ships!.filter((name) => name.length > NAME_MAX_CHARS);
  if (long.length > 0) throw new Error(`names: ${long.join(', ')} longer than ${NAME_MAX_CHARS} characters`);
  const generated = new Set(GENERATED_SHIP_NAMES);
  if (generated.size !== GENERATED_SHIP_NAMES.length) throw new Error('names: a generated ship name is listed twice');
  for (const def of WORLDS) {
    if (generated.has(def.name.toUpperCase())) throw new Error(`names: ${def.name} is a world and a ship`);
  }
}

validateNames();
