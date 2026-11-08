// LEAD-2 review round 3, on KESTREL with its zones: F at the opening, then SPACE held as `TOO WIDE — hold [SPACE] ·
// m:ss to dodge DEBRIS C` asks, during the SKIP. Round 2 dropped that press and its hold, so a kid who kept holding as the
// strip said never burned, and rack C was hit in 4 of 4 rows (tests/unit/lead2/verify2/probes/kestrel-skip-dodge-now.log). Now
// the press stops the SKIP and burns on the same tick, the dodge holds, and WP9's dodge rules are unchanged (a SKIP
// still lands SKIP_END_LEAD_TAC before the deadline: tests/unit/lead2/dodge-rules.test.ts). Rows: HOLLOW asleep and awake
// (the real run), SPACE 1, 3, 5 and 6 s into the SKIP (the last one 0:16 before the deadline).
import '../../support/classic-world';
import { check, finish } from '../../wp1/harness';
import { createHarness9 } from '../../wp9/harness9';

const h = createHarness9(5);
const state = () => h.store.getState();
const line = (): string => h.objective()?.text ?? '';

const rows: string[] = [];
let bad = '';
for (const hollowAsleep of [true, false]) {
  for (const intoSkipSec of [1, 3, 5, 6]) {
    h.kestrel(5, { hollowAsleep, sensorHealed: true });
    for (let i = 0; i < 4; i++) h.step();
    h.press('KeyF');
    let wall = 0;
    while (wall < intoSkipSec && state().clock.skipWarp !== null) { h.step(); wall += 0.05; }
    const skipping = state().clock.skipWarp !== null;
    const press = line().match(/press \[([WASD])\]/)?.[1];
    if (press) h.press(`Key${press}`);
    const lineAtPress = line();
    h.keyDown('Space');
    const firingAtPress = state().burn.firing && state().clock.skipWarp === null;
    // Held as long as the strip asks for it (KEEP HOLDING, hold [SPACE]), let go at RELEASE, then the flight's RETRO.
    let released = false;
    const start = h.wall();
    while (h.wall() - start < 300 && h.status() === 'approaching') {
      h.step();
      if (state().hazards.hitIds.length > 0) break;
      if (!released && /^RELEASE/.test(line())) { h.keyUp('Space'); h.press('KeyS'); released = true; }
      if (released && !/dodge/.test(line()) && state().clock.pace !== 'tactical') break;
    }
    if (!released) h.keyUp('Space');
    const hit = state().hazards.hitIds.length > 0;
    const row = `HOLLOW ${hollowAsleep ? 'asleep' : 'awake'}, ${intoSkipSec} s into the SKIP (skipping ${skipping}, "${lineAtPress}"): `
      + `burning at the press ${firingAtPress}, released ${released}, rack C ${hit ? 'HIT' : 'not hit'}, then "${line()}"`;
    rows.push(row);
    if (!(skipping && /^TOO WIDE — .*hold \[SPACE\] · \d+:\d\d to dodge DEBRIS C$/.test(lineAtPress) && firingAtPress && released && !hit)) bad ||= row;
  }
}
check('KESTREL: SPACE held during the opening SKIP as TOO WIDE asks burns at once, and the dodge holds (rack C not hit)',
  bad === '', bad || rows.join(' | '));

finish();
