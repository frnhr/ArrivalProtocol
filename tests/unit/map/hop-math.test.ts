// Slice 3a F2: the beam's numbers (02-map §3.1, §3.3, §3.4, §3.14; slice-3a-plan §2.3, §4.3), pure. The worked route's
// LY, years, slack, hits, ECC and what lands (playtest 1: no links any more); integer half-up rounding (WAYFARER 2970, LAST LIGHT
// 3020); run 1's table (bases, timing, pods, classes); reachability (ALBATROSS only from ARES-VII, GOOD HOPE too late from
// CORMORANT, M3); 907 routes and the best by length; the card's seed ranges.
import { check, finish } from '../landing/checks';
import { hopBetween, hitsLanding, reachable, reachableFrom, transitHitsFor, eccFixesFor } from '@systems/map-hop';
import { bases, timingYear, finalYear, podsFor, memoryClassOf } from '@systems/map-generator';
import { routes, bestRoute, routePods, shipsLeft } from '@systems/map-route';
import { mapFacts, oneHopFromFinal } from '@systems/map-facts';
import { seedAllowance, hopNoise } from '@systems/map-noise';
import { RUN1_ROWS } from '@data/run1-arm';
import { WORLDS } from '@data/arm';
import { run1Map, WORKED_ROUTE } from './run1-fixture';

const map = run1Map();

// The worked route (02 §3.14 / plan §4.3).
const hops = WORKED_ROUTE.slice(1).map((to, i) => hopBetween(map, WORKED_ROUTE[i]!, to));
const col = (pick: (hop: (typeof hops)[number]) => number): string => hops.map(pick).join();
check('worked route LY 21, 26, 55, 30, 54', col((h) => h.distanceLy) === '21,26,55,30,54', col((h) => h.distanceLy));
check('…you get there 2321, 2378, 2522, 2655, 2871', col((h) => h.arriveYear) === '2321,2378,2522,2655,2871', col((h) => h.arriveYear));
check('…slack 31, 89, 103, 162, 149', col((h) => h.slackYears) === '31,89,103,162,149', col((h) => h.slackYears));
check('…hits 3, 4, 8, 4, 8', col((h) => h.transitHits) === '3,4,8,4,8', col((h) => h.transitHits));
check('…ECC 1, 3, 4, 6, 5', col((h) => h.eccFixes) === '1,3,4,6,5', col((h) => h.eccFixes));
check('…lands 2, 1, 4, 0, 3', hops.map((h) => hitsLanding(h, 0)).join() === '2,1,4,0,3');
check('…ECC counts against the extras too (CORMORANT + EMERGENCY 3 → 1)', hitsLanding(hops[3]!, 3) === 1 && hitsLanding(hops[0]!, 2) === 4);
check('…each hop carries the destination\'s room and floor (COMPACT 152/12, FULL 152/12)',
  hops[0]!.memoryClass === 'COMPACT' && hops[0]!.room === 152 && hops[0]!.chargeFloor === 12 && hops[2]!.memoryClass === 'FULL');
check('…every worked hop is reachable', hops.every((h) => reachable(map, h.from, h.to)));

// Half-up rounding, in integers.
check('hits round(d / 7): 21 → 3, 26 → 4, 55 → 8; ECC floor(slack / 25): 24 → 0, 25 → 1, late → 0',
  transitHitsFor(21) === 3 && transitHitsFor(26) === 4 && transitHitsFor(55) === 8 && eccFixesFor(24) === 0 && eccFixesFor(25) === 1 && eccFixesFor(-5) === 0);
const base = bases(2300);
check('layer bases from 2300: 2300, 2352, 2467, 2612, 2712, 2817, 2927', base.slice(1, 8).join() === '2300,2352,2467,2612,2712,2817,2927', base.join());
check('WAYFARER (late, layer 7): 2927 + 42.5 → 2970, half up', timingYear(base, 7, true, 0) === 2970);
check('LAST LIGHT: WAYFARER 2970 + 26 + 20, up to a multiple of 5 → 3020', finalYear(map.arm, 19) === 3020 && finalYear(map.arm, 19, 3021) === 3021);

// Run 1's table.
const nonArks = RUN1_ROWS.filter((row) => row.kind === 'light' || row.kind === 'standard');
check('every light and standard ship on its layer base (jitter 0 on run 1), late ones offset half up',
  nonArks.every((row) => timingYear(base, WORLDS[row.slot]!.layer, row.late, 0) === row.approachYear),
  nonArks.filter((row) => timingYear(base, WORLDS[row.slot]!.layer, row.late, 0) !== row.approachYear).map((row) => row.name).join());
check('pods by kind and layer match the table (ALBATROSS 15, the arks of layers 5 and 7 capped at 16)',
  RUN1_ROWS.every((row) => podsFor(row.kind, WORLDS[row.slot]!.layer) === row.pods),
  RUN1_ROWS.filter((row) => podsFor(row.kind, WORLDS[row.slot]!.layer) !== row.pods).map((row) => row.name).join());
check('classes by the rule: FULL 7, COMPACT 7, TIGHT 6',
  RUN1_ROWS.every((row) => memoryClassOf(row.kind, row.pods) === row.memoryClass)
  && ['FULL', 'COMPACT', 'TIGHT'].map((cls) => RUN1_ROWS.filter((row) => row.memoryClass === cls).length).join() === '7,7,6');

// Reachability.
check('ARES-VII sees 6 ships (the three of layer 2, ALBATROSS and two more of layer 3)', reachableFrom(map, 0).length === 6, reachableFrom(map, 0).join());
check('ALBATROSS is reachable only from ARES-VII', [1, 2, 3].every((from) => !reachable(map, from, 6)) && reachable(map, 0, 6));
check('…TOO LATE from the layer-2 ships by 35, 18 and 11 years', [1, 2, 3].map((from) => -hopBetween(map, from, 6).slackYears).join() === '35,18,11',
  [1, 2, 3].map((from) => hopBetween(map, from, 6).slackYears).join());
check('GOOD HOPE is TOO LATE from CORMORANT by 15', hopBetween(map, 15, 17).slackYears === -15 && !reachable(map, 15, 17));
check('never back or sideways: a layer-2 ship cannot reach another', !reachable(map, 2, 3) && !reachable(map, 5, 2));
check('M3: a final ship is one hop from CORMORANT, not from VESPER (83 LY)', oneHopFromFinal(map, 15) && !oneHopFromFinal(map, 11));
const kestrelFacts = mapFacts(map, 2, 5, 3);
const cormorantFacts = mapFacts(map, 11, 15, 5);
check('map facts: KESTREL at depth 3 keeps the scripted Telemetry seed; CORMORANT is forced-boarding ground; LAST LIGHT is final',
  kestrelFacts.beamSeeds.kind === 'scripted' && cormorantFacts.oneHopFromFinal && !cormorantFacts.isFinal && mapFacts(map, 15, 19, 6).isFinal);

// Routes.
const all = routes(map);
check('run 1 has 907 routes', all.length === 907, String(all.length));
const best = bestRoute(map, true);
check('best route by length: 5 ships 66 pods, 6 ships 69, 7 ships 68, 8 ships 64',
  [5, 6, 7, 8].map((n) => routePods(map, best.get(n)!)).join() === '66,69,68,64', [5, 6, 7, 8].map((n) => routePods(map, best.get(n) ?? [])).join());
check('every ship is on some route', WORLDS.every((w) => all.some((route) => route.includes(w.slot))));
check('ships left after ARES-VII: 4–7 (routes of 5–8 ships); after CORMORANT at least 1; none after LAST LIGHT',
  shipsLeft(map, 0).join() === '4,7' && shipsLeft(map, 15)[0] === 1 && shipsLeft(map, 19).join() === '0,0', `${shipsLeft(map, 0)} / ${shipsLeft(map, 15)}`);

// Noise and seeds (04 §3.4's table).
check('no clouds: every hop CLEAN', hopNoise([], 0, 2) === 0 && hopNoise([{ x: 18, y: 2, r: 12, strength: 2 }, { x: 20, y: 0, r: 15, strength: 2 }], 0, 2) === 3);
const noisy = (noise: 0 | 1 | 2 | 3) => ({ act: 'seeds' as const, beamSeeds: { kind: 'noise' as const, noise } });
check('seed allowances: none into a calm ship, then 0 / 0–2 / 0–3 / 0–3 by the noise',
  seedAllowance({ act: 'calm', beamSeeds: { kind: 'noise', noise: 3 } }, false) === null
  && [0, 1, 2, 3].map((noise) => { const r = seedAllowance(noisy(noise as 0 | 1 | 2 | 3), false)!; return `${r.min}-${r.max}`; }).join() === '0-0,0-2,0-3,0-3');
const scriptedSource = { act: 'seeds' as const, beamSeeds: { kind: 'scripted' as const, firstRun: [{ role: 'telemetry' as const }], later: 2 as const } };
check('…the tutorial run\'s scripted seed is exactly 1 (m1), a later run rolls the hop\'s noise',
  JSON.stringify(seedAllowance(scriptedSource, true)) === '{"min":1,"max":1}' && JSON.stringify(seedAllowance(scriptedSource, false)) === '{"min":0,"max":3}');
finish();
