// WP12 part 2 (§9 WP12 item 3): the 768 px phone breakpoint stays in sync between the stylesheets and
// src/utils/viewport.ts. CSS cannot import the TS constant, so this reads every width media query in src/styles and
// checks it against MOBILE_MAX_PX: the phone side is `max-width: 768px`, the desktop side `min-width: 769px`. The only
// other widths allowed are named sub-steps inside one side (a narrow phone at 400, the 1440 desktop's 1439), each
// listed here with why. Exits non-zero on failure.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOBILE_MAX_PX } from '@/utils/viewport';

const STYLES = fileURLToPath(new URL('../../../src/styles', import.meta.url));
// Sub-steps that are not the phone/desktop split itself.
const SUB_STEPS: Record<string, string> = {
  'max-width:400px': 'a narrow phone inside the phone layout (smaller chips and dock)',
  'max-width:1439px': 'a desktop narrower than 1440 (soul counts and wide chips tighten)',
};

let failures = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

check('viewport.ts: MOBILE_MAX_PX is 768 (§9 WP12 item 3)', MOBILE_MAX_PX === 768, String(MOBILE_MAX_PX));

const phone = `max-width:${MOBILE_MAX_PX}px`;
const desktop = `min-width:${MOBILE_MAX_PX + 1}px`;
const found = new Map<string, string[]>();
for (const file of readdirSync(STYLES).filter((name) => name.endsWith('.css'))) {
  const css = readFileSync(join(STYLES, file), 'utf8');
  for (const match of css.matchAll(/@media([^{]*)\{/g)) {
    for (const width of match[1]!.matchAll(/\((min|max)-width\s*:\s*(\d+)px\)/g)) {
      const key = `${width[1]}-width:${width[2]}px`;
      const line = css.slice(0, match.index).split('\n').length;
      found.set(key, [...(found.get(key) ?? []), `${file}:${line}`]);
    }
  }
}
for (const [key, where] of found) {
  const known = key === phone || key === desktop || key in SUB_STEPS;
  check(`@media (${key}) is the phone/desktop split or a named sub-step`, known, where.join(', '));
}
check(`the phone side (${phone}) is used`, found.has(phone));
check(`the desktop side (${desktop}) is used`, found.has(desktop));
// A sub-step must sit wholly on one side of the split.
for (const key of Object.keys(SUB_STEPS)) {
  const px = Number(/(\d+)px/.exec(key)![1]);
  check(`sub-step ${key} does not straddle ${MOBILE_MAX_PX}px`, px < MOBILE_MAX_PX || px > MOBILE_MAX_PX + 1);
}

console.log(`---- ${failures === 0 ? 'all passed' : `${failures} failed`}`);
process.exit(failures === 0 ? 0 : 1);
