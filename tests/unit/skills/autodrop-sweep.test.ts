// BALANCE_ONLY: AUTODROP v0–v3 over run 1's arm ships × a quiet and a busy kid, whole landings (plan §8.3; information).
// Slice 4c, Track DROP. Each ship (HALCYON 5 pods, CORMORANT 9, VESPER 16) locked mid-band as it arrived (its own transit
// damage: VESPER's Sensor Interp, drivers hurt by the hops), HOLLOW asleep, landed by a kid who obeys the strip:
// • v0: by hand (landing/harness-landing followLanding: [L] when the strip names it);
// • v1: holds [L] while the strip says `hold [L]` (and lets go when it stops saying it: review M1), [L] by hand otherwise;
// • v2: [G] with the prefilled split at every pass (the strip's `· [G] AUTODROP`), [F] between windows;
// • v3: [G] when the strip offers the plan, [F] per gap;
// • v2 and v3: [L] by hand where the strip asks for it (a WIDE DROP window, a never-fits LZ: what they leave).
// The busy kid also REPAIRs every damaged file it can, a thread each, the whole landing ("hack or drop": R8); the healed
// kid lands a ship whose drivers and instruments are all at 100 (the windows AUTODROP can fly: sure parts).
// Per row: pods landed in an LZ with room (%), points, mislanded, the windows used, the wall s of the landing, and how often
// AUTODROP's claim found no thread (`'autodrop-wait'`). 03 wants the gap between v3 and none "really felt" on the ark.
// Slice 8 Step 0 (slice-8-plan §2.3, OD 9; slice-4cde Measurements: "slice 8 should judge it with a sloppy kid"): a fourth
// kid, sloppy, the quiet kid's keys with a 1.2 s reaction to every strip line, who misses the first cue of a window one time
// in three (it acts again only once that cue has gone and come back), on its own seeded stream per row. SWEEP_KIDS picks the
// kids (default healed, quiet, busy: today's rows). BALANCE_JSON writes `drop.Δpods.<ship>.<kid>.v<n>` (landed % at that
// version less the same kid's v0, on the same ship) and `drop.worst` (the lowest of them).
import { check, finish } from '../landing/checks';
import { writeMetrics } from '../support/balance-out';
import { createRng } from '@systems/rng';
import { createHarness7 } from '../wp7/harness7';
import { armLanding, ARM } from './autodrop-arm';
import { ensureLandingKeys, followLanding } from '../landing/harness-landing';
import type { GameState } from '@state/schema';
import type { SkillVersion } from '@/types/skill';
import { actionRepair } from '@state/actions';
import { canStartOp, getOpsBySeg } from '@systems/ops-core';
import { getPrediction } from '@systems/predict';
import { skipBlockReason } from '@systems/pace';
import { landingResult } from '@systems/landing-rules';
import { endLanding } from '@systems/landing';
import { BAND_OK_MIN } from '@data/tuning';

const h = createHarness7(1);
ensureLandingKeys(h);
const st = (): Readonly<GameState> => h.store.getState();
const shown = (): string => st().director.shown?.text ?? '';
const MAX_WALL = 1500;

const SHIPS = [
  { name: 'HALCYON', route: [ARM.ARES, ARM.HALCYON] },
  { name: 'CORMORANT', route: [ARM.ARES, ARM.HALCYON, ARM.KESTREL, ARM.VESPER, ARM.CORMORANT] },
  { name: 'VESPER', route: [ARM.ARES, ARM.HALCYON, ARM.KESTREL, ARM.VESPER] },
] as const;

// The busy kid: a REPAIR on every damaged file it can start (drivers, instruments, the skill), whenever a thread is free.
function busy(): void {
  if (st().clock.paused || !st().run.licences.includes('repair')) return;
  for (const seg of st().memory) {
    if (!('integrity' in seg) || seg.integrity >= BAND_OK_MIN || seg.state === 'repairing') continue;
    if (getOpsBySeg(seg.id).length > 0 || !canStartOp()) continue;
    actionRepair(h.store, seg);
  }
}

interface Row { ship: string; version: number; kid: string; landedPct: number; points: number; mislanded: number; wall: number; waits: number; volleys: number }
const rows: Row[] = [];

// The sloppy kid (slice 8): the quiet kid's keys, each after SLOPPY_REACTION_SEC of the same line, and a window's first cue
// missed one time in three.
const SLOPPY_REACTION_SEC = 1.2;
const SLOPPY_MISS = 1 / 3;
function flySloppy(version: 0 | SkillVersion, rngSeed: number): { wall: number } {
  const start = h.wall();
  const rng = createRng(rngSeed);
  let held = false;
  let seen: { text: string; at: number } | null = null;
  let wasOpen = false;
  let missing = false;
  let missedText: string | null = null;
  while (st().run.phase === 'landing' && st().landing.ended === null && h.wall() - start < MAX_WALL) {
    h.step();
    const text = shown();
    const generic = text.replace(/\d+/g, '#');
    if (seen === null || seen.text !== generic) seen = { text: generic, at: h.wall() };
    const open = st().landing.window !== null;
    if (open && !wasOpen) missing = rng() < SLOPPY_MISS;
    wasOpen = open;
    const cue = /hold \[L\]|press \[L\]|\[G\]/.test(text);
    if (missing && cue && missedText === null) missedText = generic;
    if (missedText !== null && generic !== missedText) { missing = false; missedText = null; }
    if (missedText !== null) continue;
    if (h.wall() - seen.at < SLOPPY_REACTION_SEC - 1e-9) continue;
    const ad = st().landing.autodrop;
    if (version === 1) {
      if (!held && /hold \[L\]/.test(text)) { h.keyDown('KeyL'); held = true; continue; }
      if (held && (!ad.held || !/hold \[L\]/i.test(text))) { h.keyUp('KeyL'); held = false; continue; }
      if (!held && /press \[L\]/.test(text)) { h.press('KeyL'); seen = null; continue; }
    } else if (version !== 0 && ad.armed === null && /\[G\]/.test(text)) {
      h.press('KeyG');
      continue;
    } else if (/press \[L\]/.test(text)) {
      h.press('KeyL');
      seen = null;
      continue;
    }
    if (!held && st().clock.skipWarp === null && /\[F\]/.test(text) && skipBlockReason(st(), getPrediction()) === null) { h.press('KeyF'); seen = null; }
  }
  if (held) h.keyUp('KeyL');
  if (st().run.phase === 'landing' && st().landing.ended === null) endLanding(h.store);
  return { wall: h.wall() - start };
}

function fly(version: 0 | SkillVersion, kidBusy: boolean): { wall: number } {
  const start = h.wall();
  const tick = (): void => { if (kidBusy) busy(); };
  if (version === 0) {
    followLanding(h, { maxWall: MAX_WALL, onTick: tick });
    return { wall: h.wall() - start };
  }
  let held = false;
  while (st().run.phase === 'landing' && st().landing.ended === null && h.wall() - start < MAX_WALL) {
    h.step();
    tick();
    const text = shown();
    const ad = st().landing.autodrop;
    if (version === 1) {
      if (!held && /hold \[L\]/.test(text)) { h.keyDown('KeyL'); held = true; continue; }
      // Review M1: it lets go when the strip stops saying HOLD (AUTODROP let go of a window it has nothing more to fly in, or
      // the volley is over), as a real kid would, and presses [L] by hand where the strip then asks for it.
      if (held && (!ad.held || !/hold \[L\]/i.test(text))) { h.keyUp('KeyL'); held = false; continue; }
      if (!held && /press \[L\]/.test(text)) { h.press('KeyL'); continue; }
    } else if (ad.armed === null && /\[G\]/.test(text)) {
      h.press('KeyG');
      continue;
    } else if (/press \[L\]/.test(text)) {
      // What AUTODROP v2/v3 leaves (a WIDE DROP window, a never-fits LZ) the kid launches by hand.
      h.press('KeyL');
      continue;
    }
    if (!held && st().clock.skipWarp === null && /\[F\]/.test(text) && skipBlockReason(st(), getPrediction()) === null) h.press('KeyF');
  }
  if (held) h.keyUp('KeyL');
  if (st().run.phase === 'landing' && st().landing.ended === null) endLanding(h.store);
  return { wall: h.wall() - start };
}

const KIDS = (process.env.SWEEP_KIDS ?? 'healed,quiet,busy').split(',');
if (!KIDS.every((kid) => ['healed', 'quiet', 'busy', 'sloppy'].includes(kid))) throw new Error(`SWEEP_KIDS=${process.env.SWEEP_KIDS}: healed, quiet, busy or sloppy`);
for (const [shipIndex, ship] of SHIPS.entries()) {
  if (!(process.env.SWEEP_SHIPS ?? ship.name).split(',').includes(ship.name)) continue;
  for (const kid of KIDS) {
    for (const version of [0, 1, 2, 3] as const) {
      armLanding(h, ship.route, { autodrop: version === 0 ? null : version, demos: [0.05, -0.05], healDrivers: kid === 'healed', healInstruments: kid === 'healed' });
      const waitsBefore = h.events.filter((event) => event.name === 'autodrop-wait').length;
      const volleysBefore = h.events.filter((event) => event.name === 'autodrop-volley').length;
      const { wall } = kid === 'sloppy' ? flySloppy(version, 1000 + 10 * shipIndex + version) : fly(version, kid === 'busy');
      const end = h.wall() + 120;
      while (st().run.phase === 'landing' && h.wall() < end) h.step();
      const tally = landingResult(st(), 'locked');
      const mislanded = tally.lzs.reduce((sum, lz) => sum + lz.mislanded, 0);
      rows.push({
        ship: ship.name, version, kid, landedPct: Math.round((100 * tally.landedInLz) / Math.max(1, tally.colonistsAboard)), points: tally.points,
        mislanded: mislanded / 200, wall: Math.round(wall),
        waits: h.events.filter((event) => event.name === 'autodrop-wait').length - waitsBefore,
        volleys: h.events.filter((event) => event.name === 'autodrop-volley').length - volleysBefore,
      });
      const row = rows.at(-1)!;
      console.log(`INFO  ${row.ship.padEnd(9)} ${row.kid.padEnd(5)} v${row.version}: landed ${String(row.landedPct).padStart(3)}% · ${row.points} pts · ${row.mislanded} mislanded · ${row.wall} wall s · ${row.volleys} volleys · ${row.waits} thread waits`);
    }
  }
}
check('every landing ended', rows.length % (4 * KIDS.length) === 0 && rows.length > 0);
if (KIDS.includes('quiet')) check('AUTODROP never lands fewer colonists than the strip-following kid by hand on the same ship (quiet kid)',
  SHIPS.filter((ship) => rows.some((r) => r.ship === ship.name)).every((ship) => [1, 2, 3].every((v) => rows.find((r) => r.ship === ship.name && r.kid === 'quiet' && r.version === v)!.landedPct
    >= rows.find((r) => r.ship === ship.name && r.kid === 'quiet' && r.version === 0)!.landedPct - 10)),
  rows.filter((r) => r.kid === 'quiet').map((r) => `${r.ship} v${r.version} ${r.landedPct}%`).join(' · '));
// Slice 8 Step 0: each version against the same kid's v0 on the same ship (landed %), for the balance report.
const deltas = rows.filter((row) => row.version > 0).map((row) => {
  const v0 = rows.find((other) => other.ship === row.ship && other.kid === row.kid && other.version === 0)!;
  return { id: `drop.Δpods.${row.ship}.${row.kid}.v${row.version}`, delta: row.landedPct - v0.landedPct };
});
for (const kid of KIDS) {
  console.log(`INFO  ${kid.padEnd(6)} against v0: ${deltas.filter((one) => one.id.includes(`.${kid}.`)).map((one) => `${one.id.replace('drop.Δpods.', '').replace(`.${kid}`, '')} ${one.delta >= 0 ? '+' : ''}${one.delta}%`).join(' · ')}`);
}
writeMetrics('autodrop-sweep', {
  ...Object.fromEntries(deltas.map((one) => [one.id, one.delta])),
  'drop.worst': deltas.length === 0 ? null : Math.min(...deltas.map((one) => one.delta)),
}, { kids: KIDS.join(','), ships: [...new Set(rows.map((row) => row.ship))].join(',') });
finish();
