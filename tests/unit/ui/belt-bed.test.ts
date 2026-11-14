// Playtest 1 note 22 (plan §3.11, OPEN-DECISIONS 137): the belt sounds like flat white noise plus static, one continuous
// voice (audio.ts setBeltLevel) whose level follows the depth, with the geiger's ticks only on a hit. Before, it was a
// burst of static every 1.4–3 s (each one rising, holding, falling and fluttering: the "horse huffing") with a Poisson
// stream of geiger ticks under the whole belt. DOM-free and audio-free (headless suites never unlock the context): the
// bed's level as audio-cues computes it each tick (beltBedLevel), and the cue table's source read as text, so the bursts
// and the stream cannot come back unseen. The sound itself is measured in the page by measureCue('beltBed') (?debug).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, finish } from '../landing/checks';
import { createInitialState } from '@state/initial';
import { beltBedLevel } from '@systems/audio-cues';
import { BELT_BED_EDGE_DBFS, BELT_BED_PEAK_DBFS, BELT_BED_TAU_SEC, BELT_STATIC_CLICKS_HZ } from '@data/tuning';

const state = createInitialState({ seed: 1, phase: 'flight' });
state.level.zones = [{ kind: 'belt', id: 'test-belt', rIn: 12000, rOut: 16000, racks: ['A', 'B'] }];
const at = (x: number, paused = false): number | null => {
  state.orbit.x = x;
  state.orbit.y = 0;
  state.clock.paused = paused;
  return beltBedLevel(state);
};

check('outside the belt: silent (null)', at(20000) === null, `${at(20000)}`);
check('at the belt\'s edge: depth 0, the bed at its edge level', at(12000) === 0, `${at(12000)}`);
check('a quarter of the way in: 0.25', Math.abs((at(12500) ?? -1) - 0.25) < 1e-9, `${at(12500)}`);
check('midway: 1, the bed at its loudest', Math.abs((at(14000) ?? -1) - 1) < 1e-9, `${at(14000)}`);
check('paused inside the belt: silent (the world stands)', at(14000, true) === null);
state.clock.paused = false;
state.run.phase = 'report';
check('between ships: silent', at(14000) === null);

check('the bed rises with the depth, from the edge\'s level to the middle\'s, quietly',
  BELT_BED_EDGE_DBFS < BELT_BED_PEAK_DBFS && BELT_BED_PEAK_DBFS <= -20 && BELT_BED_EDGE_DBFS >= -40,
  `${BELT_BED_EDGE_DBFS} → ${BELT_BED_PEAK_DBFS} dBFS`);
check('the level follows the depth as a fade (τ ≥ 0.2 s), never a step', BELT_BED_TAU_SEC >= 0.2, `${BELT_BED_TAU_SEC}`);
check('the static is dense enough to crackle, not tick (≥ 200 clicks a second)', BELT_STATIC_CLICKS_HZ >= 200, `${BELT_STATIC_CLICKS_HZ}`);

// The cue table and the synth, as text.
const ROOT = join(import.meta.dirname, '..', '..', '..');
const cues = readFileSync(join(ROOT, 'src/systems/audio-cues.ts'), 'utf8');
const audio = readFileSync(join(ROOT, 'src/systems/audio.ts'), 'utf8');
const geigerPlays = [...cues.matchAll(/play\('geiger'/g)].length;
const hitHandler = /on\('zone-hit'[\s\S]*?\}\),/.exec(cues)?.[0] ?? '';
check('the geiger plays in one place only: a belt hit\'s flurry', geigerPlays === 1 && /play\('geiger'/.test(hitHandler), `${geigerPlays} plays`);
check('the bursts are gone: no beltStatic cue in the table or the synth', !/beltStatic/.test(cues) && !/beltStatic/.test(audio));
check('audio-cues drives the bed every tick', /setBeltLevel\(beltBedLevel\(state\)\)/.test(cues));
const bed = /function buildBeltVoice[\s\S]*?\n\}/.exec(audio)?.[0] ?? '';
check('the bed has no envelope of its own: no LFO, ramp or sweep in its voice',
  bed.length > 0 && !/createOscillator|linearRamp|exponentialRamp|sweep\(|setValueCurve/.test(bed), `${bed.length} chars`);
check('the bed is white noise (highpass 250, lowpass 6 kHz) plus a static loop (bandpass 3 kHz)',
  /'highpass', 250/.test(bed) && /'lowpass', 6000/.test(bed) && /'bandpass', 3000/.test(bed));

finish();
