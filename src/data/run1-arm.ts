import type { ShipKind, MemoryClass, TemplateId, ModifierId, Reservations, PodRackName } from '@/types/map';
import type { ArrivalDamage } from '@data/ships';
import type { ShipLandingDef, ForgivenessClass, TerrainWord, NoGoArcDef } from '@/types/landing';
import { WORLDS, FIRST_SLOT, END_SLOTS } from '@data/arm';
import { CLASSIC_FIVE } from '@data/classic-five';

// RUN 1's ARM (docs/phase3/02-map.md §3.14; slice-3a-plan §2.3, §4.3): §3.14's table as AUTHORED STRUCTURE (who is where,
// when, how big, which class, the reservations), the same for every player's first run. Everything else on a generated
// ship (its template unless written here, extra modifiers, landing roll, families, omega0) is rolled from its ShipKey
// (armSeed, 1, slot, 0) by Track GEN's map-generator assembleRun1Arm. The five authored ships keep their written details
// (RUN1_AUTHORED) and take run 1's sizes. Cross-checked against docs/phase3/map-sim/ (example.py's run1): the years,
// LAST LIGHT's 3020 under half-up rounding, the classes (FULL 7, COMPACT 7, TIGHT 6), 907 routes.
// Track GEN owns this file after the foundation.

export interface Run1Row {
  slot: number;
  name: string;
  kind: ShipKind;
  approachYear: number;
  late: boolean;
  pods: number;
  memoryClass: MemoryClass;
  authored: 'ares-vii' | 'halcyon' | 'kestrel' | 'vesper' | 'last-light' | null;
  // A template the table fixes (the authored ships' own; a corrupted resident's slot takes CAPTURE, 02 §3.5), else null:
  // rolled from those its layer allows.
  template: TemplateId | null;
  // The reservations the table places (02 §3.14: the corrupted residents on GANNET and PROVIDENCE, WARDEN on GANNET, the
  // sleeper on CURLEW); what is left out is rolled from the named streams (fragments, POOR site data, the `?` ships). A
  // resident's name null is rolled from 05's pools (data/ship-names.ts) by its stream.
  reserved: { resident?: Run1Resident | null; unknownEvent?: Reservations['unknownEvent'] };
}

export type Run1Resident = Omit<NonNullable<Reservations['resident']>, 'name'> & { name: string | null };

function row(
  slot: number, name: string, kind: ShipKind, approachYear: number, pods: number, memoryClass: MemoryClass,
  extra: Partial<Pick<Run1Row, 'late' | 'authored' | 'template' | 'reserved'>> = {},
): Run1Row {
  return {
    slot, name, kind, approachYear, pods, memoryClass,
    late: extra.late ?? false, authored: extra.authored ?? null, template: extra.template ?? null, reserved: extra.reserved ?? {},
  };
}

const LATE = { late: true } as const;

export const RUN1_ROWS: readonly Run1Row[] = [
  row(0, 'ARES-VII', 'first', 2300, 3, 'COMPACT', { authored: 'ares-vii', template: 'impact-a' }),
  row(1, 'PETREL', 'light', 2361, 3, 'TIGHT', LATE),
  row(2, 'HALCYON', 'standard', 2352, 5, 'COMPACT', { authored: 'halcyon', template: 'wide' }),
  row(3, 'OSPREY', 'standard', 2352, 5, 'COMPACT'),
  row(4, 'HERON', 'light', 2512, 4, 'TIGHT', LATE),
  row(5, 'KESTREL', 'standard', 2467, 6, 'COMPACT', { authored: 'kestrel', template: 'wide-b' }),
  row(6, 'ALBATROSS', 'ark', 2365, 15, 'FULL'),
  row(7, 'CURLEW', 'standard', 2612, 7, 'COMPACT', { reserved: { resident: { kind: 'sleeping', shown: 'unknown', name: null } } }),
  row(8, 'LAPWING', 'light', 2672, 4, 'TIGHT', LATE),
  row(9, 'GANNET', 'standard', 2612, 7, 'COMPACT', {
    template: 'capture', reserved: { resident: { kind: 'corrupted', shown: 'faulty', name: 'WARDEN' } },
  }),
  row(10, 'PLOVER', 'standard', 2712, 8, 'COMPACT'),
  row(11, 'VESPER', 'ark', 2625, 16, 'FULL', { authored: 'vesper', template: 'capture', reserved: { resident: null } }),
  row(12, 'SKYLARK', 'light', 2750, 4, 'TIGHT', LATE),
  row(13, 'SHEARWATER', 'light', 2857, 5, 'TIGHT', LATE),
  row(14, 'KITTIWAKE', 'standard', 2817, 9, 'FULL'),
  row(15, 'CORMORANT', 'standard', 2817, 9, 'FULL'),
  row(16, 'PROVIDENCE', 'standard', 2927, 10, 'FULL', {
    template: 'capture', reserved: { resident: { kind: 'corrupted', shown: 'unknown', name: null } },
  }),
  row(17, 'GOOD HOPE', 'ark', 2830, 16, 'FULL'),
  row(18, 'WAYFARER', 'light', 2970, 5, 'TIGHT', LATE),
  row(19, 'LAST LIGHT', 'final', 3020, 16, 'FULL', { authored: 'last-light', template: 'impact-b', reserved: { resident: null } }),
];

// The authored ships' written details on the arm (slice-3a-plan §2.1, §2.3). A field left out is rolled like any ship's.
// Landing parts are 01-landing §3.15's roller inputs: a whole written landing (`landing`), or the class, terrain, LZ split
// and the no-go policy the roller must honour.
export interface AuthoredOverride {
  modifiers: readonly ModifierId[];
  arrivalDamage: readonly ArrivalDamage[];
  landing: ShipLandingDef | null;                     // written whole (ARES-VII's layer-1 row, LAST LIGHT's New Haven)
  forgiveness: ForgivenessClass | null;
  terrain: TerrainWord | null;
  lzPods: readonly number[] | null;                   // the LZ split, in angle order
  allWide: boolean;                                   // every LZ WIDE (Brine: HARSH, so off-site scores nothing)
  noGo: readonly NoGoArcDef[] | 'none' | null;        // written arcs, none at all, or rolled (null)
  podRacks: Partial<Record<PodRackName, string>> | null;  // a written layout, else 01 §3.16's layoutPods
  lead: number | null;
  debrisRack: 'B' | 'C' | null;                       // the written run's debris rack (KESTREL's pods are all in B)
}

const classic = (id: string) => {
  const ship = CLASSIC_FIVE.find((candidate) => candidate.id === id);
  if (!ship) throw new Error(`run1-arm: no classic ship '${id}'`);
  return ship;
};

const NONE: AuthoredOverride = {
  modifiers: [], arrivalDamage: [], landing: null, forgiveness: null, terrain: null, lzPods: null, allWide: false, noGo: null,
  podRacks: null, lead: null, debrisRack: null,
};

export const RUN1_AUTHORED: Readonly<Record<NonNullable<Run1Row['authored']>, AuthoredOverride>> = {
  // ARES-VII: the written layer-1 row (one WIDE site, GENTLE, POD 02 at 44%, RIVERSIDE) and the fresh unit; COMPACT with
  // its three pods at the start of rack B.
  'ares-vii': {
    ...NONE, landing: classic('ares-vii').landing, podRacks: { B: 'P P P _40', C: '_64' }, lead: classic('ares-vii').memory.drivers.lead,
  },
  // HALCYON: Sensor Interp arrives at 62 (ship 2's lesson, slice-2-plan risk 10) and Tessaly is GENTLE grassland.
  'halcyon': { ...NONE, arrivalDamage: classic('halcyon').arrivalDamage, forgiveness: 'gentle', terrain: 'GRASSLAND' },
  // KESTREL: SENSOR DAMAGE and DEBRIS as written; Brine is HARSH ocean, two WIDE sites of 3, no no-go arcs; the written
  // run's debris names rack B, where its pods are.
  'kestrel': {
    ...NONE, modifiers: ['sensor-damage', 'debris'], arrivalDamage: classic('kestrel').arrivalDamage, forgiveness: 'harsh',
    terrain: 'OCEAN', lzPods: [3, 3], allWide: true, noGo: 'none', debrisRack: 'B',
  },
  // VESPER: ENGINE FAULT (Thrust Ctrl at 31%), never a resident; Cinder is ROUGH volcanic with its two lava arcs, three
  // sites of 6 · 5 · 5 at the written centres (the arcs are placed against LZ-B's and the NARROW LZ-C's written edges, so
  // the whole landing is written: rolled centres would leave the arcs beside nothing).
  'vesper': {
    ...NONE, modifiers: ['engine-fault'], arrivalDamage: classic('vesper').arrivalDamage,
    landing: {
      ...classic('vesper').landing,
      lzs: classic('vesper').landing.lzs.map((lz, index) => ({ ...lz, pods: [6, 5, 5][index]! })),
    },
  },
  // LAST LIGHT: the New Haven row as today (16 pods, FULL, the belt, the cliffs, FIRST LIGHT) and its written layout.
  'last-light': {
    ...NONE, modifiers: ['radiation-belt'], landing: classic('last-light').landing, podRacks: classic('last-light').memory.podRacks,
    lead: classic('last-light').memory.drivers.lead,
  },
};

// The table's own invariants, at load: one row per world in slot order, the first and final kinds in their slots, names
// unique, the authored ships where 02 §3.2 puts them.
function validateRun1Rows(): void {
  const fail = (why: string): never => { throw new Error(`run1-arm: ${why}`); };
  if (RUN1_ROWS.length !== WORLDS.length) fail(`${RUN1_ROWS.length} rows for ${WORLDS.length} worlds`);
  RUN1_ROWS.forEach((entry, index) => {
    if (entry.slot !== index) fail(`row ${index} is slot ${entry.slot}`);
    if ((entry.kind === 'first') !== (index === FIRST_SLOT)) fail(`${entry.name}: the first kind is the first slot's alone`);
    if ((entry.kind === 'final') !== END_SLOTS.includes(index)) fail(`${entry.name}: the final kind is the end slots' alone`);
    if ((entry.kind === 'light') !== (entry.memoryClass === 'TIGHT')) fail(`${entry.name}: light ships are TIGHT, and only they`);
    if (entry.late && entry.kind !== 'light' && entry.kind !== 'standard') fail(`${entry.name}: only light and standard ships are late`);
  });
  if (new Set(RUN1_ROWS.map((entry) => entry.name)).size !== RUN1_ROWS.length) fail('a name is used twice');
  const where: Record<string, number> = { 'ares-vii': 0, halcyon: 2, kestrel: 5, vesper: 11, 'last-light': 19 };
  for (const [id, slot] of Object.entries(where)) {
    if (RUN1_ROWS[slot]?.authored !== id) fail(`${id} is not in slot ${slot} (02 §3.2)`);
  }
}

validateRun1Rows();
