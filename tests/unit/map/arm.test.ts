// Slice 3a F2: the arm as data (02-map §3.2; slice-3a-plan §4.1) and 05 §3.11's names. validateArm's three checks pass
// on the real arm and catch a broken one; §4.1's measured ranges hold; the name rule holds and catches a clash.
import { check, finish } from '../landing/checks';
import { WORLDS, RING_LY, END_SLOTS, FIRST_SLOT, armProblems, validateArm, type WorldDef } from '@data/arm';
import { distLy, solLy, layerOf, ringsWithin, ringsCrossed } from '@systems/map-geometry';
import { nameClashes, shipNameLists, validateNames, aresName, finalShipName, ARES_SERIES_RUNS } from '@data/ship-names';
import { BEAM_RANGE_LY, NAME_MAX_CHARS } from '@data/tuning';

let threw = false;
try { validateArm(); validateNames(); } catch { threw = true; }
check('the real arm and its names pass their load checks', !threw && armProblems(WORLDS).length === 0);
check('20 worlds in 8 layers: w0 alone in layer 1, w19 New Haven the one end slot, three lanes in layers 2–7',
  WORLDS.length === 20 && FIRST_SLOT === 0 && END_SLOTS.join() === '19' && WORLDS[19]!.name === 'New Haven'
  && [2, 3, 4, 5, 6, 7].every((layer) => WORLDS.filter((w) => w.layer === layer).map((w) => w.lane).join() === 'inner,centre,outer'));

// §4.1's measurements.
const pairs = WORLDS.flatMap((a) => WORLDS.filter((b) => b.slot > a.slot).map((b) => ({ a, b, gap: Math.abs(a.layer - b.layer), d: distLy(a.slot, b.slot) })));
const one = pairs.filter((p) => p.gap === 1);
const two = pairs.filter((p) => p.gap === 2);
const three = pairs.filter((p) => p.gap >= 3);
check('one-layer pairs: at most 45 LY', Math.max(...one.map((p) => p.d)) === 45, String(Math.max(...one.map((p) => p.d))));
check('two-layer pairs: 45–70 LY, 31 of 42 in range',
  Math.min(...two.map((p) => p.d)) >= 45 && Math.max(...two.map((p) => p.d)) <= 70 && two.length === 42 && two.filter((p) => p.d <= BEAM_RANGE_LY).length === 31,
  `${Math.min(...two.map((p) => p.d))}–${Math.max(...two.map((p) => p.d))}, ${two.filter((p) => p.d <= BEAM_RANGE_LY).length} of ${two.length}`);
check('three-layer pairs: at least 70 LY', Math.min(...three.map((p) => p.d)) >= 70, String(Math.min(...three.map((p) => p.d))));
const clearance = Math.min(...WORLDS.flatMap((w) => RING_LY.map((ring) => Math.abs(Math.hypot(w.x, w.y) - ring))));
check('ring clearance ≥ 9.0 LY', clearance >= 9, clearance.toFixed(1));
check('SOL distances along the worked route: 8, 29, 55, 107, 129, 180', [0, 2, 5, 11, 15, 19].map(solLy).join() === '8,29,55,107,129,180');
check('layers by slot', layerOf(0) === 1 && layerOf(1) === 2 && layerOf(18) === 7 && layerOf(19) === 8);
check('rings: KESTREL (55 LY) is past rings 1–2, VESPER (107) past 1–4; a two-layer hop crosses two',
  ringsWithin(55).join() === '0,1' && ringsWithin(107).join() === '0,1,2,3' && ringsCrossed(55, 107).join() === '2,3');

// The checks catch a broken arm.
const moved = (slot: number, x: number, y: number): WorldDef[] => WORLDS.map((w) => (w.slot === slot ? { ...w, x, y } : w));
const far = armProblems(moved(4, 70, -40));
check('…a one-layer pair out of range fails', far.some((p) => p.rule === 'one-layer-out-of-range'), JSON.stringify(far.map((p) => p.detail)));
const close = armProblems(moved(10, 60, 20));
check('…a pair three layers apart within range fails', close.some((p) => p.rule === 'three-layers-in-range'), JSON.stringify(close.map((p) => p.detail)));
const ringed = armProblems(moved(5, 45, 0));
check('…a world on a ring fails', ringed.some((p) => p.rule === 'near-ring'), JSON.stringify(ringed.map((p) => p.detail)));

// Names (05 §3.11).
const lists = shipNameLists();
check('every ship name fits NAME_MAX_CHARS, ARES-VIII … ARES-LXXXVII and the final ships included',
  lists.ships!.every((name) => name.length <= NAME_MAX_CHARS) && aresName(2) === 'ARES-VIII' && aresName(ARES_SERIES_RUNS) === 'ARES-LXXXVII');
check('the final ship by run: LAST LIGHT, then LODESTAR, EVENSONG …', finalShipName(1) === 'LAST LIGHT' && finalShipName(2) === 'LODESTAR' && finalShipName(3) === 'EVENSONG');
check('Sol is no longer a colonist first name (SOL is Earth on the chart)', !lists.firstNames!.includes('Sol'));
const clash = nameClashes({ ...lists, firstNames: [...lists.firstNames!, 'Sol'], colonies: [...lists.colonies!, 'KESTREL'] });
check('…the rule catches SOL vs Sol and a colony named after a ship',
  clash.some((c) => c.a === 'Sol' || c.b === 'Sol') && clash.some((c) => c.a === 'KESTREL' || c.b === 'KESTREL'), JSON.stringify(clash));
check('…a whole word inside a name clashes, a fragment does not', nameClashes({ a: ['STAR'], b: ['MORNING STAR'] }).length === 1
  && nameClashes({ a: ['STAR'], b: ['STARFORD'] }).length === 0);
finish();
