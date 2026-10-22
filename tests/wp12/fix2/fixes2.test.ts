// WP12 fix round 2: the review findings fixed in code that runs without a DOM.
// • The NAV PLOT labels' collision pass (major; minor 4): the drawn path's cost over a label does not change when the
//   prediction's points slide along the same curve (they start at the ship, so they slid every frame), and a label
//   that only touches something keeps its side (hitsClearlyLess). The live check is label-hops-check.mjs.
// • BEAM OUT's offer seen from the MIND (minor 2): `… — [TAB], press BEAM OUT` with TAB lit, as fromMind words ship
//   lines; amber keeps its own words; every reason fits the strip.
import { check, finish } from '../../wp1/harness';
import { createHarness7 } from '../../wp7/harness7';
import { pathArea, hitsClearlyLess, type PathObstacle } from '@components/tools-view/NavPlotWindow';
import { beamOutView } from '@systems/beam-out';
import { getPrediction } from '@systems/predict';
import { setMode } from '@systems/mode';
import { LINES } from '@data/script';
import { MAX_LINE_CHARS } from '@data/tuning';
import type { Vec2 } from '@/types/orbit';

// --- The path's cost over a label ----------------------------------------------------------------------------------
// An arc of radius 90 around the plot's centre (160, 160), drawn a point per degree as the predictor does, starting at a
// ship that moved a fraction of a degree between two frames.
const arc = (phaseDeg: number, reach: number): PathObstacle => {
  const points: Vec2[] = [];
  for (let deg = phaseDeg; deg <= 300; deg += 1) {
    const angle = (deg * Math.PI) / 180;
    points.push({ x: 160 + 90 * Math.cos(angle), y: 160 - 90 * Math.sin(angle) });
  }
  const segments = points.slice(1).map((to, index) => ({ from: points[index]!, to }));
  return { segments, reach };
};
// Label boxes across the arc, beside it with an edge in its band, and clear of it.
const boxes = [
  { name: 'across the line', box: { left: 200, top: 97, right: 260, bottom: 107 } },
  { name: 'beside it, its edge in the band', box: { left: 60, top: 150, right: 69, bottom: 175 } },
  { name: 'clear of it', box: { left: 140, top: 140, right: 180, bottom: 150 } },
];
for (const reach of [1.5, 4.8]) {
  for (const { name, box } of boxes) {
    const costs = [0, 0.25, 0.5, 0.75].map((phase) => pathArea(box, arc(phase, reach)));
    const spread = Math.max(...costs) - Math.min(...costs);
    check(`the path's cost over a label ${name} (reach ${reach}) holds still as the points slide along the curve`,
      spread <= 0.02 * Math.max(...costs) + 1e-6, costs.map((cost) => cost.toFixed(2)).join(' '));
  }
}
const across = pathArea(boxes[0]!.box, arc(0, 1.5));
check('…a label across the line costs about the band over it (its height and the band\'s reach, times the band\'s width)',
  across > 10 * 3 * 0.8 && across < (10 + 2 * 1.5) * 3 * 1.6, across.toFixed(1));
check('…and one clear of it costs nothing', pathArea(boxes[2]!.box, arc(0, 1.5)) === 0);
check('…no path (NO SIGNAL), no cost', pathArea(boxes[0]!.box, null) === 0);

// --- Keeping a side ------------------------------------------------------------------------------------------------
check('a label that touches the band by under 1 unit² keeps its side (ship 1\'s ▼, the major)', !hitsClearlyLess(0, 0.4, 1));
check('…as does one touching it by a sliver (20 units²)', !hitsClearlyLess(0, 20, 1));
check('…one the path crosses moves to a clear side (FLYBY on HALCYON, about 60 units²)', hitsClearlyLess(0, 60, 1));
check('…as does one that hits clearly more than another side (START BURN, 330 against 187)', hitsClearlyLess(187, 330, 1));
check('…on a phone\'s bigger labels the sliver scales with them (1.5 × the font: 2.25 × the area)', !hitsClearlyLess(0, 50, 1.5)
  && hitsClearlyLess(0, 60, 1.5));

// --- BEAM OUT's offer from the MIND ---------------------------------------------------------------------------------
const reasons = ['fuel', 'too-late', 'no-engine'] as const;
const tabLines = reasons.map((why) => LINES.beamOutOfferTab(why));
check(`every BEAM OUT reason has a [TAB] wording for the MIND, within the strip (≤ ${MAX_LINE_CHARS})`,
  tabLines.every((text, index) => text.length <= MAX_LINE_CHARS && text.startsWith(LINES.beamOutOffer(reasons[index]!).split(' — ')[0]!)
    && text.endsWith(' — [TAB], press BEAM OUT')), tabLines.join(' | '));

// A dive too steep for any burn, close to the ground (beam-out-hopeless.test.ts's TOO LATE case), on HALCYON.
const h = createHarness7(3);
const state = (): ReturnType<typeof h.store.getState> => h.store.getState();
h.shipAlone(1, 3);
h.setIntegrity('engine-io', 100);
const radius = state().level.planet.R + 300;
h.store.mutate((d) => { d.burn.fuelPct = 100; d.orbit.x = radius; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
h.step();
h.step();
const view = beamOutView(state(), getPrediction());
check('setup: a doomed dive, BEAM OUT offered (TOO LATE)', view.look === 'offered' && view.hopeless === 'too-late', JSON.stringify(view));
h.stepFor(0.3);
const amber = state().director.shown;
check('amber: the strip says press BEAM OUT, no key, the button lit', amber?.id === 'beam-out-offer'
  && amber.text === LINES.beamOutOffer('too-late') && amber.keys.length === 0 && amber.highlight === 'beam-out', amber?.text ?? 'none');
setMode(h.store, 'memory');
h.step();
const blue = state().director.shown;
check('blue: `TOO LATE to miss the planet — [TAB], press BEAM OUT`, TAB lit, the same row', blue?.id === 'beam-out-offer'
  && blue.text === LINES.beamOutOfferTab('too-late') && blue.keys.length === 1 && blue.keys[0] === 'TAB', blue?.text ?? 'none');
setMode(h.store, 'tools');
h.step();
check('…and back in amber its own words again, at once (the same row)', state().director.shown?.text === LINES.beamOutOffer('too-late'),
  state().director.shown?.text ?? 'none');

finish();
