// LEAD-1 review round 1 (spec minor): in blue, the MIND CLEAR hint re-advertised the hours-long SKIP that the
// amber strip had stopped offering (`MIND CLEAR — press [F] to SKIP to ▼` over `WAIT — brake at ▼ in 35364:27 ·
// or ACCEPT ORBIT`; .tmp/review/LEAD-1/spec/probes/blue-skip-hint.ts). The hint now only repeats a SKIP the
// flight line itself offers (its F key), and on a loop no burn can save SKIP is refused outright.
import { check, finish } from '../../wp1/harness';
import { createHarness4 } from '../../wp4/harness4';
import { getPrediction } from '@systems/predict';
import { STRANDED_LINE } from '@systems/guidance';
import { setMode } from '@systems/mode';
import { text, idle, stepUntil } from '../../wp1-rules/flows';
import { MIND_CLEAR_IDLE_SEC } from '@data/tuning';

// The reviewer's blue-skip-hint probe: let go at CAPTURED, 60 s, the tank set to 10%, then idle in the MIND.
{
  const h4 = createHarness4(1);
  h4.resetTo('flight');
  h4.noFault();
  h4.keyDown('Space');
  stepUntil(h4, () => /^RELEASE/.test(text(h4)), 30);
  h4.keyUp('Space');
  stepUntil(h4, () => /TURN AROUND/.test(text(h4)), 5);
  h4.press('KeyS');
  stepUntil(h4, () => /^WAIT/.test(text(h4)), 10);
  h4.press('KeyF');
  stepUntil(h4, () => /HOLD \[SPACE\] NOW/.test(text(h4)), 120);
  h4.keyDown('Space');
  stepUntil(h4, () => getPrediction().outcome === 'closed', 30);
  h4.keyUp('Space');
  idle(h4, 60);
  h4.store.mutate((d) => { d.burn.fuelPct = 10; });
  idle(h4, 2);
  const amber = h4.shown();
  setMode(h4.store, 'memory');
  const seen = new Set<string>();
  const end = h4.wall() + MIND_CLEAR_IDLE_SEC + 4;
  while (h4.wall() < end) { h4.step(); seen.add(`${h4.shown()?.id}: ${h4.shown()?.text}`); }
  check('blue, idle on the hopeless loop: the strip keeps the stranded line, never `MIND CLEAR — press [F] to SKIP`',
    amber?.text === STRANDED_LINE && ![...seen].some((line) => line.startsWith('hint-mind-clear')) && [...seen].some((line) => line.includes(STRANDED_LINE)),
    `amber "${amber?.text}"; blue: ${[...seen].join(' | ')}`);
}

finish();
