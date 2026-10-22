// WP12 part 2: key caps on a phone (§9 WP12 item 3: no keyboard, so a cap names the on-screen control). capPieces
// is pure: this renders its pieces the way each stylesheet shows them and checks the words a kid reads. The desktop
// rendering must give back the text exactly (nothing changes above 768 px). Exits non-zero on failure.
import { capPieces, type CapOptions } from '@components/hud/keycaps';
import { splitKeyCaps } from '@systems/flight-hud';

let failures = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// What the desktop shows: every piece, caps as [KEY].
const desktop = (text: string, options: CapOptions = {}): string =>
  capPieces(splitKeyCaps(text), options).map((piece) => (piece.cap ? `[${piece.text}]` : piece.text)).join('');
// What a phone shows: own caps and the marked words dropped, the rest of the caps as [TOUCH NAME]; HTML collapses
// runs of spaces, and so does this.
const phone = (text: string, options: CapOptions = {}): string =>
  capPieces(splitKeyCaps(text), options)
    .filter((piece) => !piece.phoneDrops && !piece.cap?.own)
    .map((piece) => (piece.cap ? `[${piece.cap.touch ?? piece.text}]` : piece.text))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

const cases: { text: string; options?: CapOptions; want: string; why: string }[] = [
  { text: 'DON\'T HIT THE PLANET — hold [SPACE]', want: 'DON\'T HIT THE PLANET — hold [BURN]', why: 'the opening line names the BURN button' },
  { text: '▼ TOO LOW — press [D] (OUT)', want: '▼ TOO LOW — press [OUT]', why: 'a preset cap names the preset, once' },
  { text: 'WAIT — brake at ▼ in 0:35 · [F] SKIP', want: 'WAIT — brake at ▼ in 0:35 · [▸▸] SKIP', why: 'SKIP is the ▸▸ button' },
  { text: 'WAIT — brake at ▼ in 0:35 · or [B] AUTO', want: 'WAIT — brake at ▼ in 0:35 · or [AUTO]', why: '[B] AUTO says AUTO once' },
  { text: '[TAB] BACK — hold [SPACE]', options: { tab: 'SHIP' }, want: '[SHIP] BACK — hold [BURN]', why: '[TAB] names the line\'s screen' },
  { text: 'THE COLONISTS ARE IN MEMORY — press [TAB] to see them', options: { tab: 'MIND' }, want: 'THE COLONISTS ARE IN MEMORY — press [MIND] to see them', why: 'into the MIND' },
  { text: 'PAUSED — press [P] to resume', want: 'PAUSED — press [❚❚] to resume', why: 'pause is the ❚❚ button' },
  { text: 'turn to OUT with [Q]/[E]', want: 'turn to OUT with [↺]/[↻]', why: 'MANUAL\'s turn buttons' },
  // A control's own key on its own button.
  { text: 'HOLD [SPACE] · BURN', options: { own: 'SPACE' }, want: 'HOLD · BURN', why: 'BURN drops its own SPACE, keeps the dot between words' },
  { text: 'PAUSED · [P] TO RESUME', options: { own: 'SPACE' }, want: 'PAUSED · [❚❚] TO RESUME', why: 'another key on BURN is still named' },
  { text: '[D] OUT', options: { own: 'D' }, want: 'OUT', why: 'a preset button is its word' },
  { text: 'AUTO · [B]', options: { own: 'B' }, want: 'AUTO', why: 'a cap ending the text takes its dot' },
  { text: 'AUTO READY · PRESS [B]', options: { own: 'B' }, want: 'AUTO READY', why: '…and PRESS' },
  { text: 'BRAKES IN 0:12 · [B] OFF', options: { own: 'B' }, want: 'BRAKES IN 0:12 · OFF', why: 'mid-text it keeps the dot' },
  { text: '[SPACE] TAKES OVER', options: { own: 'SPACE' }, want: 'TAKES OVER', why: 'a cap opening the text takes the space after it' },
  { text: 'CONTINUE ▸ [SPACE]', options: { own: 'SPACE' }, want: 'CONTINUE ▸', why: 'the report\'s button' },
  { text: 'click or [SPACE] to go on', options: { own: 'SPACE' }, want: 'click to go on', why: '`or` goes with the dropped key' },
  { text: 'RECEIVING TRANSMISSION — click or [SPACE] to skip', options: { own: 'SPACE' }, want: 'RECEIVING TRANSMISSION — click to skip', why: 'the boot is not a burn' },
  { text: 'RELEASE [SPACE]! — next: brake at ▼ in 0:04', want: 'RELEASE [BURN]! — next: brake at ▼ in 0:04', why: 'RELEASE names the button to let go of' },
];
for (const { text, options, want, why } of cases) {
  check(`desktop unchanged: ${text}`, desktop(text, options) === text, desktop(text, options));
  const shown = phone(text, options);
  check(`phone: ${why}`, shown === want, `'${shown}' (want '${want}')`);
}

console.log(`---- ${failures === 0 ? 'all passed' : `${failures} failed`}`);
process.exit(failures === 0 ? 0 : 1);
