// WP1 acceptance 5: a 0.8 km/s OUT burn at r 12,000 raises rp by more than 2,500 km
// (velocity-frame radial). Also pins the inverse: the old radius-vector radial barely moves rp.
import { createHarness, check, finish } from './harness';
import { integrateStep } from '@systems/orbit-sim';
import { elementsFromState, type Vec2 } from '@/types/orbit';

const harness = createHarness(5);
const store = harness.store;

harness.reset();
const mu = store.getState().level.planet.mu;
const r0 = Math.hypot(store.getState().orbit.x, store.getState().orbit.y);
const rpBefore = harness.rp();
check('starts at r 12,000 on the OUT preset', Math.abs(r0 - 12000) < 1 && store.getState().burn.sasMode === 'radial-out',
  `r ${r0.toFixed(1)}, preset ${store.getState().burn.sasMode}`);

harness.keyDown('Space');
while (store.getState().burn.dvDeliveredKmS < 0.8 && harness.status() === 'approaching') harness.step();
harness.keyUp('Space');
const dv = store.getState().burn.dvDeliveredKmS;
const rise = harness.rp() - rpBefore;
check('0.8 km/s OUT raises rp by > 2,500 km', rise > 2500, `Δv ${dv.toFixed(3)} km/s → rp ${rpBefore.toFixed(0)} → ${harness.rp().toFixed(0)} (+${rise.toFixed(0)} km)`);

// Contrast: the same Δv along the raw radius vector (the pre-WP1 "radial") from the same start.
{
  harness.reset();
  const o = store.getState().orbit;
  const pos: Vec2 = { x: o.x, y: o.y };
  const vel: Vec2 = { x: o.vx, y: o.vy };
  const accel = store.getState().level.aNominalKmS2;
  const steps = Math.round(0.8 / accel);
  for (let i = 0; i < steps; i++) {
    const radius = Math.hypot(pos.x, pos.y);
    integrateStep(pos, vel, 1, mu, (accel * pos.x) / radius, (accel * pos.y) / radius);
  }
  const rpRaw = elementsFromState({ x: pos.x, y: pos.y, vx: vel.x, vy: vel.y }, mu).rp;
  check('radius-vector radial would raise rp far less', rpRaw - rpBefore < rise / 2,
    `radius-vector: +${(rpRaw - rpBefore).toFixed(0)} km vs velocity-frame +${rise.toFixed(0)} km`);
}

finish();
