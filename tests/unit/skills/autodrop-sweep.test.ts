// BALANCE_ONLY: AUTODROP v0–v3 over run 1's arm ships × a quiet and a busy kid, whole landings (plan §8.3; information).
// Slice 4c, Track DROP. Each ship (HALCYON 5 pods, CORMORANT 9, VESPER 16) locked mid-band as it arrived (its own transit
// damage: VESPER's Sensor Interp, drivers hurt by the hops), HOLLOW asleep, landed by a kid who obeys the strip:
// • v0: by hand (landing/harness-landing followLanding: [L] when the strip names it);
// • v1: holds [L] while the strip says `hold [L]` (and lets go when the window closes), [L] by hand otherwise;
// • v2: [G] with the prefilled split at every pass (the strip's `· [G] AUTODROP`), [F] between windows;
// • v3: [G] when the strip offers the plan, [F] per gap;
// • v2 and v3: [L] by hand where the strip asks for it (a WIDE DROP window, a never-fits LZ: what they leave).
// The busy kid also REPAIRs every damaged file it can, a thread each, the whole landing ("hack or drop": R8); the healed
// kid lands a ship whose drivers and instruments are all at 100 (the windows AUTODROP can fly: sure parts).
// Per row: pods landed in an LZ with room (%), points, mislanded, the windows used, the wall s of the landing, and how often
// AUTODROP's claim found no thread (`'autodrop-wait'`). 03 wants the gap between v3 and none "really felt" on the ark.
import { check, finish } from '../landing/checks';
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
      if (held && (!ad.held || (st().landing.window === null && Object.values(ad.sent).some((n) => n > 0)))) { h.keyUp('KeyL'); held = false; continue; }
      if (!held && /press \[L\]/.test(text)) { h.press('KeyL'); continue; }
    } else if (ad.armed === null && /\[G\]/.test(text)) {
      h.press('KeyG');
      continue;
    } else if (ad.armed === null && /press \[L\]/.test(text)) {
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

for (const ship of SHIPS) {
  for (const kid of ['healed', 'quiet', 'busy'] as const) {
    for (const version of [0, 1, 2, 3] as const) {
      armLanding(h, ship.route, { autodrop: version === 0 ? null : version, demos: [0.05, -0.05], healDrivers: kid === 'healed', healInstruments: kid === 'healed' });
      const waitsBefore = h.events.filter((event) => event.name === 'autodrop-wait').length;
      const volleysBefore = h.events.filter((event) => event.name === 'autodrop-volley').length;
      const { wall } = fly(version, kid === 'busy');
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
check('every landing ended', rows.length === SHIPS.length * 12);
check('AUTODROP never lands fewer colonists than the strip-following kid by hand on the same ship (quiet kid)',
  SHIPS.every((ship) => [1, 2, 3].every((v) => rows.find((r) => r.ship === ship.name && r.kid === 'quiet' && r.version === v)!.landedPct
    >= rows.find((r) => r.ship === ship.name && r.kid === 'quiet' && r.version === 0)!.landedPct - 10)),
  rows.filter((r) => r.kid === 'quiet').map((r) => `${r.ship} v${r.version} ${r.landedPct}%`).join(' · '));
finish();
