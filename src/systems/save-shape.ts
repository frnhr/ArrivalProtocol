// Slice 3c: Track SAVE owns this file (docs/phase3/impl/slice-3c-plan.md §5.2).
import type { ArmShip } from '@/types/map';

// The stored shapes' checks, shared by the archive (systems/meta.ts parseArm) and the run save (systems/save-codec.ts
// checkShape): small checkers that throw a ShapeError naming the path of the first field that is wrong. Strict, field by
// field (an extra key is a shape this build does not know; a missing one is never filled with a default), so a stored
// record is either read whole or refused loudly. Pure: no store, no storage.
//
// Two kinds of check:
// • written-out specs (rec, list, oneOf, …) for the records the save and the archive must read exactly: the map, every
//   ArmShip (checkArmShip, the one copy both keepers use), the route, the history, the run's own fields;
// • likeReference for the ship's slices and the threat memory, whose types are large and change with every slice: the
//   stored record must have exactly the keys a freshly built one has, and each primitive field the primitive type it has
//   there (or null). A slice that adds a field changes the reference with it, so the check never goes stale; a save made
//   before that field is a version bump (RUN_SAVE_VERSION) and a migration step, never a quiet default.

export class ShapeError extends Error {}

export type Check = (value: unknown, at: string) => void;

export function shapeFail(at: string, why: string): never {
  throw new ShapeError(`${at} ${why}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const whole: Check = (value, at) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) shapeFail(at, 'is not a whole number');
};

export const int: Check = (value, at) => {
  if (typeof value !== 'number' || !Number.isInteger(value)) shapeFail(at, 'is not an integer');
};

export const num: Check = (value, at) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) shapeFail(at, 'is not a number');
};

export const str: Check = (value, at) => {
  if (typeof value !== 'string') shapeFail(at, 'is not text');
};

export const name: Check = (value, at) => {
  if (typeof value !== 'string' || value === '') shapeFail(at, 'is not a name');
};

export const bool: Check = (value, at) => {
  if (typeof value !== 'boolean') shapeFail(at, 'is not true or false');
};

export const isNull: Check = (value, at) => {
  if (value !== null) shapeFail(at, 'is not null');
};

// Any JSON value (a record whose own checks are elsewhere: a ShipDef's landing, which validateShipDef reads).
export const anyRecord: Check = (value, at) => {
  if (!isRecord(value)) shapeFail(at, 'is not a record');
};

export function nullable(check: Check): Check {
  return (value, at) => { if (value !== null) check(value, at); };
}

export function oneOf(...allowed: readonly (string | number | boolean | null)[]): Check {
  return (value, at) => {
    if (!allowed.includes(value as never)) shapeFail(at, `'${String(value)}' is not one of ${allowed.join(', ')}`);
  };
}

export function list(item: Check): Check {
  return (value, at) => {
    if (!Array.isArray(value)) shapeFail(at, 'is not a list');
    value.forEach((entry, i) => item(entry, `${at}[${i}]`));
  };
}

// A record with exactly these keys, each checked.
export function rec(fields: Readonly<Record<string, Check>>): Check {
  const keys = Object.keys(fields);
  return (value, at) => {
    if (!isRecord(value)) shapeFail(at, 'is not a record');
    const have = Object.keys(value);
    const missing = keys.filter((key) => !have.includes(key));
    const extra = have.filter((key) => !keys.includes(key));
    if (missing.length > 0) shapeFail(at, `is missing ${missing.join(', ')}`);
    if (extra.length > 0) shapeFail(at, `has unknown fields (${extra.join(', ')})`);
    for (const key of keys) fields[key]!(value[key], `${at}.${key}`);
  };
}

// A record whose keys are some of `keys`, each value checked (ArmShip.podRacks: a COMPACT ship has no rack D).
export function partialRec(keys: readonly string[], item: Check): Check {
  return (value, at) => {
    if (!isRecord(value)) shapeFail(at, 'is not a record');
    for (const [key, entry] of Object.entries(value)) {
      if (!keys.includes(key)) shapeFail(at, `has an unknown field ${key}`);
      item(entry, `${at}.${key}`);
    }
  };
}

// The stored record has exactly the reference's keys, and each field whose reference value is a number, text or a flag
// has that type (or null: a field that is null at creation and set later, or the other way). Nested records are left to
// the constructors the resume runs (see the header).
export function likeReference(reference: Readonly<Record<string, unknown>>): Check {
  const keys = Object.keys(reference);
  return (value, at) => {
    if (!isRecord(value)) shapeFail(at, 'is not a record');
    const have = Object.keys(value);
    const missing = keys.filter((key) => !have.includes(key));
    const extra = have.filter((key) => !keys.includes(key));
    if (missing.length > 0) shapeFail(at, `is missing ${missing.join(', ')}`);
    if (extra.length > 0) shapeFail(at, `has unknown fields (${extra.join(', ')})`);
    for (const key of keys) {
      const want = reference[key];
      const got = value[key];
      if (got === null || want === null || typeof want === 'object') continue;
      if (typeof got !== typeof want) shapeFail(`${at}.${key}`, `is ${typeof got}, not ${typeof want}`);
    }
  };
}

// Every number in a stored value is finite, except a sticky ghost burst's end (BurnState.ghost.endTSec, the codec's one
// tagged Infinity): JSON can't hold the others, so one there means a tag in the wrong place (or an edited save).
export function finiteNumbers(value: unknown, at: string, allowInfinityAt: string): void {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    if (value === Infinity && at.endsWith(`.${allowInfinityAt}`)) return;
    shapeFail(at, `is ${String(value)}`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, i) => finiteNumbers(entry, `${at}[${i}]`, allowInfinityAt));
    return;
  }
  if (isRecord(value)) for (const [key, entry] of Object.entries(value)) finiteNumbers(entry, `${at}.${key}`, allowInfinityAt);
}

// --- ArmShip (types/map.ts): the one check both keepers use (the archive's stored arm, the save's run.map.arm) ----------

const POD_RACKS = ['B', 'C', 'D'] as const;

const checkReservations = rec({
  resident: nullable(rec({ kind: oneOf('corrupted', 'left', 'sleeping'), shown: oneOf('faulty', 'unknown'), name })),
  unknownEvent: oneOf(null, 'old-colony', 'gone-resident', 'signal'),
  fragments: whole,
  site: oneOf('good', 'poor'),
  tracePlace: isNull,
});

const checkArmShipFields = rec({
  slot: whole,
  id: name,
  name,
  kind: oneOf('first', 'light', 'standard', 'ark', 'final'),
  template: oneOf('impact-a', 'wide', 'wide-b', 'capture', 'impact-b'),
  pods: whole,
  memoryClass: oneOf('FULL', 'COMPACT', 'TIGHT'),
  approachYear: whole,
  late: bool,
  timedAgainstStart: whole,
  reportedRun: whole,
  runsOnChart: whole,
  attempt: whole,
  modifiers: list(oneOf('impact-course', 'too-wide', 'sensor-damage', 'debris', 'engine-fault', 'radiation-belt')),
  omega0: num,
  debrisRack: oneOf(null, ...POD_RACKS),
  arrivalDamage: list(rec({ role: oneOf('sensor', 'thrust-ctrl'), maxIntegrity: num })),
  landing: anyRecord,
  podRacks: partialRec(POD_RACKS, str),
  lead: whole,
  authored: oneOf(null, 'ares-vii', 'halcyon', 'kestrel', 'vesper', 'last-light'),
  reserved: checkReservations,
});

// One stored ArmShip, field by field, and in its own slot (index = slot). Its ShipDef (validateShipDef(shipDefOf(…))) is
// the caller's next step: the archive checks the arm's content versions before it (a ship made by other content may not
// build, and that is a content reset, not a corrupt archive).
export function checkArmShip(value: unknown, at: string, slot: number): asserts value is ArmShip {
  checkArmShipFields(value, at);
  const ship = value as ArmShip;
  if (ship.slot !== slot) shapeFail(`${at}.slot`, `is ${ship.slot}, but the ship sits in slot ${slot}`);
}

// --- The map's history and departures (types/lineage.ts), shared by the archive's arm and the save's map --------------

export const LEAVE_REASONS = ['done', 'first-past', 'drifted', 'aged', 'resolved', 'off-pattern-ark', 'made-room', 'unreachable'] as const;

export const checkDepartures = list(rec({
  slot: whole, name, reason: oneOf(...LEAVE_REASONS), words: oneOf(null, 'colony', 'no-colony', 'core-coming', 'own-way'),
}));

export const checkHistory = rec({
  gap: whole,
  valveYears: whole,
  finalSerial: whole,
  lastUnitNumber: nullable(whole),
  departures: checkDepartures,
  colonies: list(rec({ run: whole, unit: whole, slot: whole, year: whole, landed: whole, name })),
  routes: list(rec({ run: whole, unit: whole, slots: list(whole) })),
});
