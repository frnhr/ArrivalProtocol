// Track GEN: run 1's roll (02-map §3.14 as authored structure, slice-3a-plan §2.3, §4.3): the table's years under half-up
// rounding, the checks, the 907 routes and their best by length, the worked route, ALBATROSS only from ARES-VII, the
// classes, the reservations the table places and those its streams roll, the authored ships' written details, the
// generated ships' rolled ones (deterministic per seed, different across seeds), and every ShipDef valid.
import { check, finish } from '../landing/checks';
import { assembleRun1Arm, armChecks, bases, timingYear, finalYear, freshArm } from '@systems/map-generator';
import { ghostPlaceReached, freshMeta, recordRunStart, recordShipStart, recordRunEnd, parseMeta, loadMeta } from '@systems/meta';
import { WORLDS } from '@data/arm';
import { hopBetween, reachable } from '@systems/map-hop';
import { routes, bestRoute, routePods } from '@systems/map-route';
import { shipDefAt } from '@systems/map-run';
import { solLy, layerOf } from '@systems/map-geometry';
import { validateShipDef } from '@data/ships';
import { rootSlotRack, maxRootFor } from '@data/memory';
import { classicShip } from '@data/classic-five';
import { TEMPLATE_RULES } from '@data/flight-templates';
import { EXTRA_MODIFIERS_MAX_BY_LAYER, META_STORAGE_KEY } from '@data/tuning';
import { run1Map, WORKED_ROUTE } from './run1-fixture';
import type { UnitTrail } from '@/types/lineage';

const map = run1Map(7);
const arm = map.arm;
const by = (name: string) => {
  const ship = arm.find((candidate) => candidate.name === name);
  if (!ship) throw new Error(`no ${name} on run 1's arm`);
  return ship;
};

// Years (half up), the checks, the routes.
const base = bases(2300);
check('years: WAYFARER 2927 + 42.5 → 2970 (half up), LAST LIGHT 2970 + 26 + 20 → 3020', by('WAYFARER').approachYear === 2970
  && timingYear(base, 7, true, 0) === 2970 && by('LAST LIGHT').approachYear === 3020 && finalYear(arm, 19) === 3020);
check('…ALBATROSS keeps its authored 2365 (14 YRS EARLY from ARES-VII)', by('ALBATROSS').approachYear === 2365 && hopBetween(map, 0, 6).slackYears === 14);
check('checks 1–5 pass on run 1\'s arm', armChecks(arm).length === 0, JSON.stringify(armChecks(arm)));
const all = routes(map);
const best = bestRoute(map, true);
check('907 routes; the best by length 66 / 69 / 68 / 64 pods (5–8 ships)', all.length === 907
  && [5, 6, 7, 8].map((n) => routePods(map, best.get(n)!)).join() === '66,69,68,64');

// The worked route (§4.3).
const hops = WORKED_ROUTE.slice(1).map((to, i) => hopBetween(map, WORKED_ROUTE[i]!, to));
check('the worked route: LY 21/26/55/30/54, link 123/117/86/113/87, hits 3/4/8/4/8, ECC 1/3/4/6/5, slack 31/89/103/162/149',
  hops.map((h) => h.distanceLy).join() === '21,26,55,30,54' && hops.map((h) => h.linkBlocks).join() === '123,117,86,113,87'
  && hops.map((h) => h.transitHits).join() === '3,4,8,4,8' && hops.map((h) => h.eccFixes).join() === '1,3,4,6,5'
  && hops.map((h) => h.slackYears).join() === '31,89,103,162,149');
check('…SOL distances 8, 29, 55, 107, 129, 180', WORKED_ROUTE.map(solLy).join() === '8,29,55,107,129,180');
check('ALBATROSS is reachable only from ARES-VII', arm.filter((ship) => reachable(map, ship.slot, 6)).map((ship) => ship.slot).join() === '0');
check('classes FULL 7, COMPACT 7, TIGHT 6', ['FULL', 'COMPACT', 'TIGHT'].map((cls) => arm.filter((ship) => ship.memoryClass === cls).length).join() === '7,7,6');

// Reservations.
const residents = arm.filter((ship) => ship.reserved.resident !== null);
check('the table\'s residents: WARDEN corrupted on GANNET (faulty), PROVIDENCE corrupted and hidden, a sleeper on CURLEW',
  by('GANNET').reserved.resident?.kind === 'corrupted' && by('GANNET').reserved.resident?.shown === 'faulty' && by('GANNET').reserved.resident?.name === 'WARDEN'
  && by('PROVIDENCE').reserved.resident?.kind === 'corrupted' && by('PROVIDENCE').reserved.resident?.shown === 'unknown'
  && by('CURLEW').reserved.resident?.kind === 'sleeping' && by('CURLEW').reserved.resident!.name !== '');
check('…the corrupted residents\' ships are CAPTURE with no extra modifier', ['GANNET', 'PROVIDENCE'].every((name) => by(name).template === 'capture'
  && by(name).modifiers.length === 0));
const left = arm.filter((ship) => ship.reserved.resident?.kind === 'left');
check('five departed residents, one in layer 2, the gone-resident `?` ship among them', left.length === 5
  && left.some((ship) => layerOf(ship.slot) === 2) && left.some((ship) => ship.reserved.unknownEvent === 'gone-resident'), left.map((s) => s.name).join());
const unknown = arm.filter((ship) => ship.reserved.unknownEvent !== null);
const layerOk = (kind: string, from: number, to: number): boolean => unknown.some((ship) => ship.reserved.unknownEvent === kind && layerOf(ship.slot) >= from && layerOf(ship.slot) <= to);
check('three `?` ships in three layers: old colony 3–5, gone resident 3–6, signal 5–7, none authored', unknown.length === 3
  && new Set(unknown.map((ship) => layerOf(ship.slot))).size === 3 && layerOk('old-colony', 3, 5) && layerOk('gone-resident', 3, 6)
  && layerOk('signal', 5, 7) && unknown.every((ship) => ship.authored === null));
check('five fragments: 2 on the signal ship, 1 on the gone-resident ship, 2 in departed residents\' notes (layers 3–7)',
  arm.reduce((sum, ship) => sum + ship.reserved.fragments, 0) === 5 && unknown.find((s) => s.reserved.unknownEvent === 'signal')!.reserved.fragments === 2
  && arm.filter((ship) => ship.reserved.fragments > 0).every((ship) => layerOf(ship.slot) >= 3));
check('no resident on the first, the final or an authored ship; names all different', residents.every((ship) => ship.authored === null)
  && new Set(residents.map((ship) => ship.reserved.resident!.name)).size === residents.length);
check('POOR site data only from layer 5', arm.every((ship) => ship.reserved.site === 'good' || layerOf(ship.slot) >= 5));

// The authored ships keep their written details.
const ares = shipDefAt(map, 0);
check('ARES-VII: COMPACT, `P P P _40` / `_64`, the written layer-1 row (one WIDE site, GENTLE, RIVERSIDE), a fresh unit',
  ares.memoryClass === 'COMPACT' && ares.memory.podRacks.B === 'P P P _40' && ares.memory.podRacks.C === '_64' && ares.memory.podRacks.D === undefined
  && JSON.stringify(ares.landing) === JSON.stringify(classicShip(0).landing) && ares.memory.aiFiles !== null && ares.memory.drivers.hurt[0]?.pod === 2);
const halcyon = shipDefAt(map, 2);
check('HALCYON: 5 pods COMPACT, Sensor 62 without the label, GENTLE GRASSLAND', halcyon.pods === 5 && halcyon.memoryClass === 'COMPACT'
  && halcyon.arrivalDamage[0]?.maxIntegrity === 62 && !halcyon.modifiers.includes('sensor-damage') && halcyon.landing.terrain === 'GRASSLAND'
  && halcyon.landing.forgiveness === 'gentle');
const kestrel = shipDefAt(map, 5);
check('KESTREL: 6 pods COMPACT, no slot, HARSH ocean, LZs 3·3 WIDE, no arcs, SENSOR DAMAGE and DEBRIS on rack B',
  kestrel.pods === 6 && kestrel.memoryClass === 'COMPACT' && rootSlotRack(kestrel) === null && kestrel.landing.forgiveness === 'harsh'
  && kestrel.landing.lzs.map((lz) => `${lz.pods}${lz.width}`).join() === '3wide,3wide' && kestrel.landing.noGo.length === 0
  && kestrel.zones.some((zone) => zone.kind === 'debris' && zone.rack === 'B') && kestrel.arrivalDamage[0]?.maxIntegrity === 45);
const vesper = shipDefAt(map, 11);
check('VESPER: a 16-pod ark, FULL, a slot, ENGINE FAULT (Thrust 31), ROUGH with two lava arcs, LZs 6·5·5, no resident',
  vesper.kind === 'ark' && vesper.pods === 16 && vesper.memoryClass === 'FULL' && rootSlotRack(vesper) !== null
  && vesper.arrivalDamage.some((rule) => rule.role === 'thrust-ctrl' && rule.maxIntegrity === 31) && vesper.landing.forgiveness === 'rough'
  && vesper.landing.noGo.filter((arc) => arc.word === 'LAVA').length === 2 && vesper.landing.lzs.map((lz) => lz.pods).join() === '6,5,5'
  && by('VESPER').reserved.resident === null);
const lastLight = shipDefAt(map, 19);
check('LAST LIGHT: 16 pods FULL, the belt, New Haven\'s written landing and layout', lastLight.final && lastLight.pods === 16
  && JSON.stringify(lastLight.landing) === JSON.stringify(classicShip(4).landing)
  && JSON.stringify(lastLight.memory.podRacks) === JSON.stringify(classicShip(4).memory.podRacks) && lastLight.zones.some((zone) => zone.kind === 'belt'));

// The generated ships.
const generated = arm.filter((ship) => ship.authored === null);
check('every ShipDef of the arm passes validateShipDef', arm.every((ship) => { validateShipDef(shipDefAt(map, ship.slot)); return true; }));
check('generated templates are allowed in their layer; extras within 02 §3.5\'s count', generated.every((ship) => {
  const rule = TEMPLATE_RULES[ship.template];
  const extras = ship.modifiers.filter((mod) => !rule.inherent.includes(mod));
  return rule.fromLayer <= layerOf(ship.slot) && extras.length <= EXTRA_MODIFIERS_MAX_BY_LAYER[layerOf(ship.slot)]!;
}));
check('a root slot on every ship from layer 4 and on the final ship, none needed before', arm.every((ship) =>
  layerOf(ship.slot) < 4 || rootSlotRack(shipDefAt(map, ship.slot)) !== null));
const cormorant = shipDefAt(map, 15);
const words = (['B', 'C', 'D'] as const).flatMap((rack) => cormorant.memory.podRacks[rack]?.split(' ') ?? []);
const slotAt = words.indexOf('S');
check('risk 1: CORMORANT (forced boarding) has VESPER\'s geometry: `P _2 S _1 P`, the lead the GAP-1 neighbour, room for the root',
  words.slice(slotAt - 2, slotAt + 3).join(' ') === 'P _2 S _1 P' && cormorant.memory.drivers.lead === words.slice(0, slotAt + 3).filter((w) => w === 'P').length
  && maxRootFor(cormorant) === 14, words.join(' '));
check('the same seed rolls the same arm; another seed other details on the same structure',
  JSON.stringify(assembleRun1Arm(7)) === JSON.stringify(arm)
  && assembleRun1Arm(8).map((ship) => `${ship.name}${ship.approachYear}${ship.pods}`).join() === arm.map((ship) => `${ship.name}${ship.approachYear}${ship.pods}`).join()
  && JSON.stringify(assembleRun1Arm(8).map((ship) => ship.landing)) !== JSON.stringify(arm.map((ship) => ship.landing)));
check('the Debris guarantee: KESTREL is a DEBRIS ship among the layer-3 ships reachable from ARES-VII',
  [4, 5, 6].some((slot) => reachable(map, 0, slot) && arm[slot]!.modifiers.includes('debris')));

// A fresh roll (run ≥ 2, risk 4): ARES-(VI + run) at w0, the final name by run, names never a world's, never twice.
const run3 = freshArm(5, 3, 2300);
check('a fresh roll for run 3: ARES-IX at Kepler-186f, EVENSONG at New Haven (written row, no FIRST LIGHT), names unique',
  run3[0]!.name === 'ARES-IX' && run3[19]!.name === 'EVENSONG' && run3[19]!.landing.colonyFirstRun === null
  && new Set(run3.map((ship) => ship.name)).size === 20 && run3.every((ship) => !WORLDS.some((world) => world.name.toUpperCase() === ship.name)));
check('…freshArm refuses run 1 (run 1\'s arm is assembleRun1Arm\'s)', (() => { try { freshArm(5, 1, 2300); return false; } catch { return true; } })());

// The ghost by layer (slice-3a-plan §2.9; the review's M3): the layer of the ship where the last unit's run ended, the first
// boot at or past it; never by the ship's name (a fresh arm puts names on other worlds). Slice 3c's archive v2 reads that
// ship from the trail's last stop (systems/lineage.ts ghostPlaceReached; Track WORLD moves it to the grey cross).
const at = (slots: number[]) => ({ ...map, route: slots.map((slot, i) => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween(map, slots[i - 1]!, slot) })) });
const trailTo = (slot: number): UnitTrail => ({
  unit: 47, run: 1, startYear: 2300,
  stops: [{ slot, shipName: 'CORMORANT', year: 2817, outcome: null, landed: 0, colony: null, writer: null }],
  lost: null,
});
const reached = (slots: number[], lastUnit: { shipName: string; trail: UnitTrail | null }): boolean =>
  ghostPlaceReached({ map: at(slots), shipIndex: slots.length - 1, lastUnit: null }, lastUnit);
check('the ghost by layer: lost in layer 6 → not at VESPER (layer 5), at KITTIWAKE (layer 6, another ship of that layer)',
  !reached([0, 2, 5, 11], { shipName: 'CORMORANT', trail: trailTo(15) }) && reached([0, 2, 5, 11, 14], { shipName: 'CORMORANT', trail: trailTo(15) }));
check('…by the trail\'s layer, not the name: a layer-3 trail named CORMORANT speaks at KESTREL',
  reached([0, 2, 5], { shipName: 'CORMORANT', trail: trailTo(5) }) && !reached([0, 2], { shipName: 'CORMORANT', trail: trailTo(5) }));
check('…never at ship 1; a record with no trail speaks at the final ship',
  !reached([0], { shipName: 'ARES-VII', trail: trailTo(0) }) && reached([0, 2], { shipName: 'ARES-VII', trail: trailTo(0) })
  && !reached([0, 2, 5, 11, 15], { shipName: 'CORMORANT', trail: null }) && reached([0, 2, 5, 11, 15, 19], { shipName: 'CORMORANT', trail: null }));
// …and the archive keeps the trail: at each ship's start (activeRun, so an abandoned run has it) and at the run's end
// (lastUnit); a record with none parses; a bad one is corrupt.
{
  const progress = { unit: 47, shipName: 'CORMORANT', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: trailTo(15) };
  const started = recordShipStart(recordRunStart(freshMeta(), { ...progress, shipName: 'ARES-VII', trail: trailTo(0) }, 0), progress);
  const ended = recordRunEnd(started, { ...progress, cause: 'flagship-lost', score: 0 });
  check('the archive records the trail: activeRun at a ship\'s start, lastUnit at the run\'s end, and it round-trips',
    started.activeRun?.trail?.stops.at(-1)?.slot === 15 && ended.lastUnit?.trail?.stops.at(-1)?.slot === 15
    && JSON.stringify(parseMeta(JSON.stringify(ended)).lastUnit?.trail) === JSON.stringify(trailTo(15)));
  const store: Record<string, string> = {};
  const storage = () => ({ getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: () => {} });
  store[META_STORAGE_KEY] = JSON.stringify(started);
  const recovered = loadMeta(storage as never);
  const none = JSON.parse(JSON.stringify(ended)) as { lastUnit: Record<string, unknown> };
  none.lastUnit.trail = null;
  const bad = JSON.parse(JSON.stringify(ended)) as { lastUnit: { trail: Record<string, unknown> } };
  bad.lastUnit.trail.stops = 'six';
  check('…an abandoned run keeps it; a record with none parses (the final ship then); a bad one is corrupt',
    recovered.ok && recovered.recovered && recovered.meta.lastUnit?.trail?.stops.at(-1)?.slot === 15
    && parseMeta(JSON.stringify(none)).lastUnit?.trail === null
    && (() => { try { parseMeta(JSON.stringify(bad)); return false; } catch { return true; } })());
}
finish();
