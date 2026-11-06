// Slice 4: Track TREE owns this file (docs/phase3/impl/slice-4-plan.md §5.2): LastUnit.skills' reader. Others ask by
// message.
// The archive's record, read field by field (phase 3 slice 3c; moved out of systems/meta.ts in the review fixes, minor 6):
// pure, no store, no storage, no world, so the run save's codec (systems/save-codec.ts) reads the last unit a saved run
// holds without importing the stateful archive. MetaCorrupt names what is wrong; systems/meta.ts parseMeta builds the whole
// record from these.
import type { ShipOutcome } from '@state/schema';
import type {
  LastCause, LastUnit, UnitStats, UnitTrail, TrailStop, TrailLost, ColonyRecord, RouteRecord, NotableEvent,
} from '@/types/lineage';
import type { SkillId, SkillVersion, LockLevel, SkillRecord } from '@/types/skill';
import { SKILL_IDS, SKILL_TREE } from '@data/skills';

// How a unit's run ended, as the next run remembers it (§4.5's causes; the type is types/lineage.ts LastCause). (WP8's
// interim 'reassigned' is gone with that fleet: a record that holds it reads ARCHIVE CORRUPT.)
export const LAST_CAUSES: readonly LastCause[] = [
  'won-purge', 'won-merge', 'unresolved', 'flagship-lost', 'overwritten', 'stayed', 'abandoned', 'signal-lost',
];

export class MetaCorrupt extends Error {}

export function corrupt(why: string): never {
  throw new MetaCorrupt(`archive: ${why}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function wholeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) corrupt(`${field} is not a whole number`);
  return value;
}

export function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') corrupt(`${field} is not a name`);
  return value;
}

export function flag(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') corrupt(`${field} is not true or false`);
  return value;
}

export function list_(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) corrupt(`${field} is not a list`);
  return value;
}

// A record with exactly these keys (archive v2 is strict: an extra key is a shape this build does not know).
export function exactRecord(value: unknown, field: string, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) corrupt(`${field} is not a record`);
  const extra = Object.keys(value).filter((key) => !keys.includes(key));
  if (extra.length > 0) corrupt(`${field} has unknown fields (${extra.join(', ')})`);
  return value;
}

const SHIP_OUTCOMES: readonly ShipOutcome[] = ['locked', 'partial', 'stranded', 'escaped', 'crashed', 'abandoned', 'emergency'];

export function lastCause(value: unknown, field: string): LastCause {
  if (typeof value !== 'string' || !(LAST_CAUSES as readonly string[]).includes(value)) corrupt(`${field} '${String(value)}' is unknown`);
  return value as LastCause;
}

export function parseTrailStop(value: unknown, field: string): TrailStop {
  const stop = exactRecord(value, field, ['slot', 'shipName', 'year', 'outcome', 'landed', 'colony', 'writer']);
  const outcome = stop.outcome;
  if (outcome !== null && !(SHIP_OUTCOMES as readonly unknown[]).includes(outcome)) corrupt(`${field}.outcome '${String(outcome)}' is unknown`);
  let writer: TrailStop['writer'] = null;
  if (stop.writer !== null) {
    const w = exactRecord(stop.writer, `${field}.writer`, ['name', 'age']);
    writer = { name: text(w.name, `${field}.writer.name`), age: wholeNumber(w.age, `${field}.writer.age`) };
  }
  return {
    slot: wholeNumber(stop.slot, `${field}.slot`),
    shipName: stop.shipName === null ? null : text(stop.shipName, `${field}.shipName`),
    year: wholeNumber(stop.year, `${field}.year`),
    outcome: outcome as ShipOutcome | null,
    landed: wholeNumber(stop.landed, `${field}.landed`),
    colony: stop.colony === null ? null : text(stop.colony, `${field}.colony`),
    writer,
  };
}

export function parseTrail(value: unknown, field: string): UnitTrail | null {
  if (value === null) return null;
  const trail = exactRecord(value, field, ['unit', 'run', 'startYear', 'stops', 'lost']);
  let lost: TrailLost | null = null;
  if (trail.lost !== null) {
    const l = exactRecord(trail.lost, `${field}.lost`, ['slot', 'year', 'pastLy', 'cause']);
    if (typeof l.pastLy !== 'number' || !Number.isFinite(l.pastLy) || l.pastLy < 0) corrupt(`${field}.lost.pastLy is not a distance`);
    lost = { slot: wholeNumber(l.slot, `${field}.lost.slot`), year: wholeNumber(l.year, `${field}.lost.year`), pastLy: l.pastLy, cause: lastCause(l.cause, `${field}.lost.cause`) };
  }
  const stops = list_(trail.stops, `${field}.stops`).map((stop, i) => parseTrailStop(stop, `${field}.stops[${i}]`));
  if (stops.length === 0) corrupt(`${field}.stops is empty`);
  return {
    unit: wholeNumber(trail.unit, `${field}.unit`), run: wholeNumber(trail.run, `${field}.run`),
    startYear: wholeNumber(trail.startYear, `${field}.startYear`), stops, lost,
  };
}

export function parseColony(value: unknown, field: string): ColonyRecord {
  const c = exactRecord(value, field, ['run', 'unit', 'slot', 'year', 'landed', 'name']);
  return {
    run: wholeNumber(c.run, `${field}.run`), unit: wholeNumber(c.unit, `${field}.unit`), slot: wholeNumber(c.slot, `${field}.slot`),
    year: wholeNumber(c.year, `${field}.year`), landed: wholeNumber(c.landed, `${field}.landed`), name: text(c.name, `${field}.name`),
  };
}

export function parseRoute(value: unknown, field: string): RouteRecord {
  const r = exactRecord(value, field, ['run', 'unit', 'slots']);
  return {
    run: wholeNumber(r.run, `${field}.run`), unit: wholeNumber(r.unit, `${field}.unit`),
    slots: list_(r.slots, `${field}.slots`).map((slot, i) => wholeNumber(slot, `${field}.slots[${i}]`)),
  };
}

const EVENT_KINDS: readonly NotableEvent['kind'][] = ['deal-accepted', 'best-colony', 'ship-lost'];

export function parseEvent(value: unknown, field: string): NotableEvent {
  const e = exactRecord(value, field, ['kind', 'slot', 'shipName', 'value']);
  if (!(EVENT_KINDS as readonly unknown[]).includes(e.kind)) corrupt(`${field}.kind '${String(e.kind)}' is unknown`);
  return { kind: e.kind as NotableEvent['kind'], slot: wholeNumber(e.slot, `${field}.slot`), shipName: text(e.shipName, `${field}.shipName`), value: wholeNumber(e.value, `${field}.value`) };
}

export function unitList(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length === 0) corrupt(`${field} is not a list of units`);
  return value.map((unit, i) => wholeNumber(unit, `${field}[${i}]`));
}

export function unitStats(value: unknown, field: string): UnitStats {
  if (!isRecord(value)) corrupt(`${field} is not a record`);
  return { moves: wholeNumber(value.moves, `${field}.moves`), deletes: wholeNumber(value.deletes, `${field}.deletes`) };
}

// The last unit as the archive reads it (field by field; MetaCorrupt names what is wrong): the run save reads the copy its
// RunState holds (run.lastUnit) through it too.
export function parseLastUnit(value: unknown): LastUnit | null {
  if (value === null) return null;
  const unit = exactRecord(value, 'lastUnit', ['number', 'landed', 'shipName', 'cause', 'stats', 'hollowUnits', 'trail', 'skills']);
  return {
    number: wholeNumber(unit.number, 'lastUnit.number'),
    landed: wholeNumber(unit.landed, 'lastUnit.landed'),
    shipName: text(unit.shipName, 'lastUnit.shipName'),
    cause: lastCause(unit.cause, 'lastUnit.cause'),
    stats: unitStats(unit.stats, 'lastUnit.stats'),
    hollowUnits: unitList(unit.hollowUnits, 'lastUnit.hollowUnits'),
    trail: parseTrail(unit.trail, 'lastUnit.trail'),
    skills: parseSkillRecords(unit.skills, 'lastUnit.skills'),
  };
}

function parseSkillRecords(value: unknown, field: string): SkillRecord[] | null {
  if (value === null) return null;
  const records = list_(value, field).map((record, i) => parseSkillRecord(record, `${field}[${i}]`));
  if (new Set(records.map((record) => record.skill)).size !== records.length) corrupt(`${field} names a skill twice`);
  return records;
}

const SKILL_VERSIONS: readonly unknown[] = [1, 2, 3];
const LOCK_LEVELS: readonly unknown[] = [0, 1, 2];

// One skill the last unit ended with (slice 4, types/skill.ts SkillRecord): a known skill at a version 1–3 and a lock 0–2
// (a lock only on AUTOBURN), each skill once, and an accuracy 0–100 or null.
export function parseSkillRecord(value: unknown, field: string): SkillRecord {
  const r = exactRecord(value, field, ['skill', 'version', 'lock', 'accuracy']);
  if (!(SKILL_IDS as readonly unknown[]).includes(r.skill)) corrupt(`${field}.skill '${String(r.skill)}' is unknown`);
  if (!SKILL_VERSIONS.includes(r.version)) corrupt(`${field}.version is not 1, 2 or 3`);
  if (!LOCK_LEVELS.includes(r.lock)) corrupt(`${field}.lock is not 0, 1 or 2`);
  const skill = r.skill as SkillId;
  if (r.lock !== 0 && SKILL_TREE[skill].locks.length === 0) corrupt(`${field}.lock: ${skill} has no LOCK RANGE`);
  if (r.accuracy !== null && (typeof r.accuracy !== 'number' || !Number.isFinite(r.accuracy) || r.accuracy < 0 || r.accuracy > 100)) {
    corrupt(`${field}.accuracy is not a percentage or null`);
  }
  return { skill, version: r.version as SkillVersion, lock: r.lock as LockLevel, accuracy: r.accuracy as number | null };
}
