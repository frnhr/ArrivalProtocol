// WP12 part 2: the lines the objective strip can show, for the phone check that every one fits its two lines at
// 390 px (tests/e2e/scenarios/phone.mjs runs this first and reads the JSON it writes). Two sources, as the earlier packages test them:
// • every script.ts template rendered with the worst-case placeholders (tests/unit/wp2/say.test.ts's set);
// • the flight guidance on random states (tests/unit/wp1/guidance.test.ts's fuzz), also with a dead Autopilot (the
//   [Q]/[E] wordings are the longest).
// Writes tests/.out/e2e/strip-corpus.json: the distinct texts, longest first.
// Usage: node_modules/.bin/tsx --tsconfig tsconfig.json tests/unit/wp12/p2/strip-corpus.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHarness } from '../../wp1/harness';
import { buildFlightContext, flightObjective, STRANDED_LINE, ACCEPT_ONLY_LINE, KEEP_TO_EMPTY_LINE } from '@systems/guidance';
import { computePrediction } from '@systems/predict';
import { createRng } from '@systems/rng';
import { stateFromElements } from '@/types/orbit';
import { LINES, REFUSAL_LINES, BEATS, GUIDE_RULES, WORST_CASE_VARS, type LineVars } from '@data/script';
import type { TextCtx } from '@systems/director';
import type { SasMode } from '@state/schema';

const texts = new Set<string>();
const ctx: TextCtx = { vars: WORST_CASE_VARS };
for (const template of Object.values(LINES)) texts.add((template as (vars: LineVars) => string)(WORST_CASE_VARS));
for (const refusal of Object.values(REFUSAL_LINES)) texts.add(refusal.text);
for (const beat of BEATS) beat.lines.forEach((line) => texts.add(line.text(ctx)));
for (const rule of GUIDE_RULES) texts.add(rule.text(ctx));
// The lines the earlier packages named as cut on a phone (LEAD_NOTES: `For WP12`), and BEAM OUT's offer for each reason
// (both screens' wordings: WP12 fix round 2).
texts.add(STRANDED_LINE).add(ACCEPT_ONLY_LINE).add(KEEP_TO_EMPTY_LINE).add('NOT ENOUGH FUEL — the ship will fly past');
for (const why of ['fuel', 'too-late', 'no-engine'] as const) texts.add(LINES.beamOutOffer(why)).add(LINES.beamOutOfferTab(why));

const harness = createHarness(21);
const store = harness.store;
const rng = createRng(1203);
const modes: SasMode[] = ['off', 'prograde', 'retrograde', 'radial-in', 'radial-out'];
for (let i = 0; i < 2500; i++) {
  harness.reset();
  const mu = store.getState().level.planet.mu;
  const rp = 2000 + rng() * 14000;
  const e = rng() * 1.5;
  const nuMax = e < 1 ? Math.PI : Math.acos(-1 / e) * 0.95;
  const nu = (rng() * 2 - 1) * nuMax;
  const s = stateFromElements(rp, e, rng() * 6.28, nu, mu);
  if (Math.hypot(s.x, s.y) <= store.getState().level.planet.R + 1) continue;
  const firing = rng() < 0.5;
  store.mutate((d) => {
    d.orbit.x = s.x; d.orbit.y = s.y; d.orbit.vx = s.vx; d.orbit.vy = s.vy;
    d.burn.firing = firing; d.burn.firingSource = firing ? 'player' : null;
    d.burn.missedIdleTac = rng() < 0.3 ? 30 : 0;
    d.burn.sasMode = modes[Math.floor(rng() * modes.length)] ?? 'off';
    d.burn.fuelPct = rng() < 0.2 ? 0 : rng() * 100;
    d.burn.closedIdleAiSec = rng() < 0.2 ? 20 : 0;
    d.burn.presetAligning = rng() < 0.3;
    d.burn.acceptOnly = rng() < 0.08;
    d.clock.tSec = rng() * 50;
  });
  const pred = computePrediction(store.getState());
  const context = buildFlightContext(store.getState(), pred);
  const objective = flightObjective(context);
  if (objective) texts.add(objective.text);
  const turnWords = flightObjective({ ...context, presetsAvailable: false });
  if (turnWords) texts.add(turnWords.text);
  // WP12 fix round 1: the same rows seen from the MIND, where a ship line asking for a burn says [TAB] first (guidance.ts
  // fromMind). In blue the kid's own burn is always let go (mode.ts), so these contexts do not fire.
  // A debris cloud on the path (KESTREL's TOO WIDE lines carry its countdown), on both screens.
  const fromMind = { ...context, inMind: true, firing: false, thrustOn: false };
  const debris = { rack: 'C', dodgeInTac: 12.3 };
  for (const variant of [fromMind, { ...context, debris }, { ...fromMind, debris }]) {
    for (const presetsAvailable of [true, false]) {
      const line = flightObjective({ ...variant, presetsAvailable });
      if (line) texts.add(line.text);
    }
  }
}

// A template called with the wrong placeholder type reads `[object Object]` / `NaN`: not a line the game shows.
const sorted = [...texts].filter((text) => text.length > 0 && !/\[object |NaN|undefined/.test(text)).sort((a, b) => b.length - a.length);
const out = fileURLToPath(new URL('../../../.out/e2e/strip-corpus.json', import.meta.url));
mkdirSync(fileURLToPath(new URL('../../../.out/e2e/', import.meta.url)), { recursive: true });
writeFileSync(out, JSON.stringify(sorted, null, 1));
console.log(`${sorted.length} distinct strip texts, the longest ${sorted[0]?.length} characters: '${sorted[0]}' → ${out}`);
