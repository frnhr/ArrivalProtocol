// WP5 acceptance 4: the STASIS reveal (§1, §6.7), its three entry paths and the run-1 rules.
// • the scan path: on the coast SKIP is held (CHECK THE COLONISTS FIRST) and the strip asks for the
//   scan; TAB, SCAN on STASIS; INSPECT's three lines land, the slabs crack (one state change, the
//   chips staggered 60 ms), C12 · OKAFOR is selected, SKIP works, and the C09 triage follows;
// • the auto-reveal path: printing starts sealed → the printer finds them, ≥ 2 s after the lock
//   (never in the stamp's second), and the first print comes ≥ 3 s after it ends;
// • the LOST-card path: a crash before the reveal opens the slabs at once and the card plays
//   `2,400 souls in memory. 0 woke.`;
// plus pause (look-only, the sequence freezes), the breach entry (one cluster), the soul targeting
// rules and Life Support's clue. Fix round 1: the crack's picture plays once, where the kid sees it
// (resumed by a rebuild, kept for the first look when it cracked out of sight); the end of the
// reveal keeps a tool the kid picked up; the C09 ask waits for Ada; the amber ask waits for a coast
// long enough for the reveal; a reveal the kid started is not credited to the printer.
import { check, finish, TICK } from '../wp1/harness';
import { createHarness5 } from './harness5';
import { revealSouls, unsealCluster, crackDelaySec, lostCardSouls } from '@systems/reveal';
import { skipBlockReason, requestSkip, SKIP_REFUSAL_COLONISTS, tacToNextEvent } from '@systems/pace';
import { installTool, isLicensed } from '@systems/licences';
import { acceptOrbit } from '@systems/flight-controls';
import { orbitForRange } from './harness5';
import { stateFromElements } from '@/types/orbit';
import { getPrediction } from '@systems/predict';
import { pickUpTool, applyTool, type ToolDeps } from '@systems/fs-tools';
import { targetRefusal } from '@systems/tool-targets';
import { actionScan } from '@state/actions';
import { setPaused } from '@systems/clock';
import { archiveSealed, getByRole, soulsInMemory, revealAwaitsView } from '@state/selectors';
import { TOOL_REFUSAL } from '@data/tool-text';
import {
  REVEAL_LINE_AT_SEC, REVEAL_CRACK_AT_SEC, REVEAL_CRACK_STAGGER_SEC, REVEAL_SELECT_AFTER_SEC, REVEAL_AUTO_DELAY_SEC,
  REVEAL_PRINT_GAP_SEC, REVEAL_VIEW_WAIT_MAX_SEC, REVEAL_CRACK_ANIM_SEC, SOULS_ASK_MIN_LEAD_TAC,
} from '@data/tuning';
import type { FsToolKind } from '@/types/fs-tool';

const h = createHarness5(1);
const deps: ToolDeps = { ask: () => { throw new Error('no question expected'); } };
const state = () => h.store.getState();
const eventsNamed = (name: string) => h.events.filter((event) => event.name === name);
const settle = (): void => { for (let i = 0; i < 8; i++) h.step(); };
const near = (a: number, b: number): boolean => Math.abs(a - b) <= TICK + 1e-6;

// Flies the opening correction and the flip (fault disarmed), leaving the ship on the coast.
function toCoast(): void {
  h.resetTo('flight');
  h.noFault();
  h.keyDown('Space');
  while (h.rp() < 6000 && h.wall() < 60) h.step();
  h.keyUp('Space');
  h.press('KeyS');
  h.stepFor(3);
}

// --- The scan path ------------------------------------------------------------------------------------
{
  toCoast();
  settle();
  check('the coast: the archive is sealed and SKIP is held with CHECK THE COLONISTS FIRST', archiveSealed(state())
    && skipBlockReason(state(), getPrediction()) === SKIP_REFUSAL_COLONISTS && requestSkip(h.store).ok === false);
  const ask = h.shown();
  check('the strip asks: ◇ CHECK THE 2,400 — [TAB], then SCAN the STASIS file', ask?.id === 'tut-check-souls'
    && ask.text === 'CHECK THE 2,400 — [TAB], then SCAN the STASIS file' && ask.keys.join() === 'TAB' && ask.layer === 'mind', JSON.stringify(ask));
  h.stepFor(2);
  check('CONTROL: "While you wait, please check on the colonists. :)"', h.log().some((entry) => entry.speaker === 'control'
    && entry.text === 'While you wait, please check on the colonists. :)'));
  check('the footer\'s word: the archive is sealed, so SOULS IN STASIS', archiveSealed(state()));

  h.press('Tab');
  settle();
  check('in blue: CHECK THE 2,400 — SCAN the STASIS file, lighting the SCAN chip', h.shown()?.id === 'tut-scan-stasis'
    && h.shown()?.highlight === 'chip-scan', JSON.stringify(h.shown()));
  pickUpTool(h.store, 'scan');
  settle();
  check('SCAN in hand: the STASIS file lights', h.shown()?.highlight === 'file-stasis');
  const sealedChip = soulsInMemory(state())[0]!;
  check('a sealed slab refuses every tool: SEALED — NO ACCESS', (['scan', 'repair', 'move', 'copy', 'delete'] as FsToolKind[])
    .every((kind) => targetRefusal(sealedChip, { state: state(), activeKind: kind, pickedSource: null }) === TOOL_REFUSAL.sealed));

  const stasis = getByRole(state(), 'stasis')!;
  applyTool(h.store, stasis, deps);
  h.stepUntil(() => eventsNamed('scanned').length > 0, 5);
  const scannedAt = eventsNamed('scanned')[0]!.wall;
  h.stepUntil(() => eventsNamed('reveal-done').length > 0, 20);
  const lines = eventsNamed('reveal-line').map((event) => event.wall - scannedAt);
  check('the STASIS scan takes 1.4 s (4 blocks)', h.events.some((event) => event.name === 'op-done') && stasis.size === 4);
  check('three lines land at 0, 1.8 and 3.6 AI-s after the scan', lines.length === 3 && lines.every((at, i) => near(at, REVEAL_LINE_AT_SEC[i]! + TICK) || near(at, REVEAL_LINE_AT_SEC[i]!)),
    lines.map((at) => at.toFixed(2)).join(', '));
  check('…and read STASIS: 0 pods detected. / rescanning… / The colonists aren\'t in pods. They\'re in here. (RACKS B–C)',
    state().souls.reveal.lines.join(' | ') === "STASIS: 0 pods detected. | rescanning… | The colonists aren't in pods. They're in here. (RACKS B–C)",
    state().souls.reveal.lines.join(' | '));
  const crack = eventsNamed('souls-unsealed')[0]!;
  const codes = (crack.payload as { codes: string[] }).codes;
  check('the slabs crack at 6.2 s: all 12 clusters at once, in order C01 … C12', near(crack.wall - scannedAt, REVEAL_CRACK_AT_SEC + TICK) || near(crack.wall - scannedAt, REVEAL_CRACK_AT_SEC),
    `${(crack.wall - scannedAt).toFixed(2)} s, ${codes.join(' ')}`);
  check('…12 codes, staggered on screen by their index (crackDelaySec)', codes.length === 12 && codes[0] === 'C01' && codes[11] === 'C12');
  const shown = eventsNamed('crack-shown');
  check('…seen at once (in blue): crack-shown with the crack, 12 chips', shown.length === 1 && shown[0]!.wall === crack.wall
    && (shown[0]!.payload as { count: number }).count === 12);
  const done = eventsNamed('reveal-done')[0]!;
  const expectDone = REVEAL_CRACK_AT_SEC + 12 * REVEAL_CRACK_STAGGER_SEC + REVEAL_SELECT_AFTER_SEC;
  check('the lead cluster is selected 1.4 s after the last chip cracks', Math.abs(done.wall - scannedAt - expectDone) <= 2 * TICK,
    `${(done.wall - scannedAt).toFixed(2)} s (expected ${expectDone.toFixed(2)})`);
  const selected = state().memory.find((seg) => seg.id === state().ui.selectedId);
  check('INSPECT: C12 · Okafor (Ada\'s family), SCAN put down', selected?.type === 'soul' && selected.cluster === 'C12'
    && selected.featured[0]!.name === 'Okafor, Ada' && state().ui.activeTool === null, selected?.name);
  check('the archive is open: no cluster sealed, the reveal stage is revealed (the footer flips)', !archiveSealed(state())
    && state().souls.reveal.stage === 'revealed' && state().souls.reveal.cause === 'scan');
  check('C09 · REYES shows its 71%', h.soul('C09').integrity === 71 && !h.soul('C09').sealed);
  settle();
  check('SKIP no longer waits for the colonists', skipBlockReason(state(), getPrediction()) !== SKIP_REFUSAL_COLONISTS,
    String(skipBlockReason(state(), getPrediction())));
  check('the strip: ◇ C09 IS HURT — REPAIR it before it prints, lighting the REPAIR chip', h.shown()?.id === 'tut-hurt-cluster'
    && h.shown()?.text === 'C09 IS HURT — REPAIR it before it prints' && h.shown()?.highlight === 'chip-repair', JSON.stringify(h.shown()));
  pickUpTool(h.store, 'repair');
  settle();
  check('REPAIR in hand: C09\'s chip lights', h.shown()?.highlight === 'cluster-C09');
  h.stepFor(4);
  check('CONTROL, a moment later: "Oh, you found them! Please handle with care. :)"', h.log().some((entry) => entry.text === 'Oh, you found them! Please handle with care. :)'));
  const c09 = h.soul('C09');
  applyTool(h.store, c09, deps);
  h.runOps();
  settle();
  check('C09 repaired to 100 (1.6 s, 5 charge): the triage line is done', c09.integrity === 100 && state().director.done.includes('tut-hurt-cluster')
    && h.shown()?.id !== 'tut-hurt-cluster', h.shown()?.id);

  // The open archive's rules (§6.5).
  const c01 = h.soul('C01');
  const refusal = (kind: FsToolKind) => targetRefusal(c01, { state: state(), activeKind: kind, pickedSource: null });
  check('open clusters: delete "You can\'t delete people.", copy "Souls can\'t be copied.", scan not needed, move allowed, repair at 100% refused',
    refusal('delete') === "You can't delete people." && refusal('copy') === "Souls can't be copied." && refusal('scan') === TOOL_REFUSAL.soulScan
    && refusal('move') === null && refusal('repair') === TOOL_REFUSAL.healthy,
    ['delete', 'copy', 'scan', 'move', 'repair'].map((kind) => refusal(kind as FsToolKind)).join(' / '));
}

// --- Pause: the sequence freezes (look-only) ------------------------------------------------------------
{
  h.resetTo('flight');
  h.noFault();
  check('revealSouls(scan) starts it', revealSouls(h.store, 'scan') && state().souls.reveal.stage === 'pending');
  check('a second call while it plays is refused', !revealSouls(h.store, 'debug'));
  h.stepFor(2);
  const linesBefore = state().souls.reveal.lines.length;
  setPaused(h.store, true);
  h.stepFor(10);
  check('paused for 10 s: no new line, nothing cracked', state().souls.reveal.lines.length === linesBefore && archiveSealed(state()), `${linesBefore} line(s)`);
  setPaused(h.store, false);
  h.stepUntil(() => state().souls.reveal.stage === 'revealed', 20);
  check('unpaused: it plays on to the end', state().souls.reveal.stage === 'revealed' && !archiveSealed(state()));
  // A STASIS scan started, then paused: the scan itself waits (ops are AI time), then reveals.
  h.resetTo('flight');
  h.noFault();
  actionScan(h.store, getByRole(state(), 'stasis')!);
  h.stepFor(0.5);
  setPaused(h.store, true);
  h.stepFor(5);
  check('the reveal scan while paused: the scan waits, no reveal yet', state().souls.reveal.stage === 'sealed' && eventsNamed('scanned').length === 0);
  setPaused(h.store, false);
  h.stepUntil(() => state().souls.reveal.stage === 'revealed', 40);
  check('…unpaused: the scan ends and the reveal plays', state().souls.reveal.stage === 'revealed' && state().souls.reveal.cause === 'scan');
}

// --- The crack waits for the kid to look (a burn pulled them back to amber) -----------------------------
{
  // On the coast (on the opening crash course the strip rightly keeps DON'T HIT THE PLANET).
  toCoast();
  h.press('Tab');
  revealSouls(h.store, 'scan');
  h.stepFor(REVEAL_LINE_AT_SEC[2]! + 0.5);
  h.press('Tab');
  const backAt = h.wall();
  h.stepFor(REVEAL_CRACK_AT_SEC - REVEAL_LINE_AT_SEC[2]! + 2);
  check('in amber at the crack: the slabs stay shut and the strip says where to look', archiveSealed(state())
    && h.shown()?.id === 'reveal-look' && h.shown()?.text === 'THE COLONISTS ARE IN MEMORY — press [TAB] to see them', JSON.stringify(h.shown()));
  h.press('Tab');
  h.step();
  check('TAB: the slabs crack at once', !archiveSealed(state()) && h.wall() - backAt < REVEAL_VIEW_WAIT_MAX_SEC, `${(h.wall() - backAt).toFixed(1)} s after leaving`);
  h.resetTo('flight');
  h.noFault();
  revealSouls(h.store, 'scan');
  h.stepUntil(() => !archiveSealed(state()), 60);
  const crackedAt = eventsNamed('souls-unsealed')[0]!.wall - eventsNamed('reveal-line')[0]!.wall;
  check(`never looking: the crack still comes, ${REVEAL_VIEW_WAIT_MAX_SEC} s late at most`, Math.abs(crackedAt - REVEAL_CRACK_AT_SEC - REVEAL_VIEW_WAIT_MAX_SEC) <= 2 * TICK,
    `${crackedAt.toFixed(2)} s after the first line`);
  // Fix round 1: the state flipped at the cap, but the picture waits for the kid's first look.
  check('…cracked out of sight: no crack-shown, every chip keeps its whole crack for the first look', eventsNamed('crack-shown').length === 0
    && crackDelaySec('C01') === 0 && near(crackDelaySec('C12')!, 11 * REVEAL_CRACK_STAGGER_SEC), `C01 ${crackDelaySec('C01')}, C12 ${crackDelaySec('C12')}`);
  h.stepFor(5);
  check('…still kept 5 s later (whatever rebuilds the strip meanwhile)', crackDelaySec('C01') === 0);
  h.press('Tab');
  h.step();
  check('…the first TAB plays it (crack-shown, the ripple of cracks with it)', eventsNamed('crack-shown').length === 1 && crackDelaySec('C01')! <= 0);
  h.stepFor(11 * REVEAL_CRACK_STAGGER_SEC + REVEAL_CRACK_ANIM_SEC + 0.2);
  check('…and once played it is over: a rebuild or a TAB back draws the chips settled', crackDelaySec('C01') === null && crackDelaySec('C12') === null);
}

// --- The crack seen: a rebuild mid-crack resumes it; the end keeps the kid's own choice ------------------
{
  h.resetTo('flight');
  h.noFault();
  h.press('Tab');
  if (!isLicensed(state(), 'repair')) installTool(h.store, 'repair');
  settle();
  const stasis = getByRole(state(), 'stasis')!;
  revealSouls(h.store, 'scan');
  h.stepUntil(() => !archiveSealed(state()), 20);
  check('at the crack, in blue: C01 starts now, C12 eleven staggers later', near(crackDelaySec('C01')!, 0)
    && near(crackDelaySec('C12')!, 11 * REVEAL_CRACK_STAGGER_SEC), `${crackDelaySec('C01')} / ${crackDelaySec('C12')}`);
  let hurtAskEarly = false;
  h.stepFor(0.5, () => { if (h.shown()?.id === 'tut-hurt-cluster') hurtAskEarly = true; });
  check('0.5 s in: a strip rebuilt now continues each chip (C01 0.5 s along, C12 still to start)', near(crackDelaySec('C01')!, -0.5)
    && near(crackDelaySec('C12')!, 11 * REVEAL_CRACK_STAGGER_SEC - 0.5), `${crackDelaySec('C01')} / ${crackDelaySec('C12')}`);
  check('between the crack and Ada: no C09 IS HURT yet (the lead is named first)', !hurtAskEarly && h.soul('C09').integrity < 95);
  check('the selection is still STASIS (its lines)', state().ui.selectedId === stasis.id);
  pickUpTool(h.store, 'repair');
  h.stepUntil(() => state().souls.reveal.stage === 'revealed', 10);
  check('REPAIR picked up after the crack: Ada\'s moment leaves it in the hand and the selection where it was',
    state().ui.activeTool?.kind === 'repair' && state().ui.selectedId === stasis.id, `${state().ui.activeTool?.kind} / ${state().ui.selectedId}`);

  h.resetTo('flight');
  h.noFault();
  h.press('Tab');
  settle();
  revealSouls(h.store, 'scan');
  h.stepUntil(() => !archiveSealed(state()), 20);
  const c05 = h.soul('C05');
  h.store.update((d) => { d.ui.selectedId = c05.id; });
  h.stepUntil(() => state().souls.reveal.stage === 'revealed', 10);
  check('a cluster the kid clicked after the crack stays selected (not moved to C12)', state().ui.selectedId === c05.id);

  h.resetTo('flight');
  h.noFault();
  h.press('Tab');
  settle();
  revealSouls(h.store, 'scan');
  h.stepUntil(() => state().souls.reveal.stage === 'revealed', 20);
  const selected = state().memory.find((seg) => seg.id === state().ui.selectedId);
  check('untouched, the reveal still ends on C12 · OKAFOR', selected?.type === 'soul' && selected.cluster === 'C12');
}

// --- The amber ask waits for a coast with room for the reveal (fix round 1) ------------------------------
{
  toCoast();
  settle();
  const lead = tacToNextEvent(state(), getPrediction());
  check(`the coast: the next burn is ≥ ${SOULS_ASK_MIN_LEAD_TAC} tactical s away, and the ask shows`, (lead === null || lead >= SOULS_ASK_MIN_LEAD_TAC)
    && h.shown()?.id === 'tut-check-souls', `${lead?.toFixed(1)} tac s, ${h.shown()?.id}`);
  h.stepUntil(() => (tacToNextEvent(state(), getPrediction()) ?? Infinity) < SOULS_ASK_MIN_LEAD_TAC - 2, 200);
  settle();
  check('closer to the burn than that: the ask stands down (the reveal would play under GET READY)', archiveSealed(state())
    && h.shown()?.id !== 'tut-check-souls', `${tacToNextEvent(state(), getPrediction())?.toFixed(1)} tac s: ${h.shown()?.id}`);
}

// --- The auto-reveal at printing --------------------------------------------------------------------------
{
  h.resetTo('flight');
  h.noFault();
  h.startPrinting(1);
  const lockedAt = eventsNamed('locked')[0]!.wall;
  h.step();
  check('printing starts sealed: the reveal is due (pending)', state().run.phase === 'printing' && state().souls.reveal.stage === 'pending'
    && state().souls.reveal.cause === 'printing');
  h.stepUntil(() => eventsNamed('cluster-printed').length > 0, 60);
  const firstLine = eventsNamed('reveal-line')[0]!.wall - lockedAt;
  const crackAt = eventsNamed('souls-unsealed')[0]!.wall - lockedAt;
  const doneAt = eventsNamed('reveal-done')[0]!.wall - lockedAt;
  const firstPrint = eventsNamed('cluster-printed')[0]!.wall - lockedAt;
  check(`the printer's first line comes ${REVEAL_AUTO_DELAY_SEC} s after the lock: never in the ORBIT LOCKED stamp's second`,
    firstLine >= REVEAL_AUTO_DELAY_SEC - 1e-6 && firstLine >= 1, `${firstLine.toFixed(2)} s`);
  check('the crack is also clear of the stamp', crackAt >= 1, `${crackAt.toFixed(2)} s`);
  check(`the reveal ends ≥ ${REVEAL_PRINT_GAP_SEC} s before the first print`, firstPrint - doneAt >= REVEAL_PRINT_GAP_SEC - 1e-6,
    `done ${doneAt.toFixed(2)} s, first print ${firstPrint.toFixed(2)} s`);
  const radio = h.log().filter((entry) => entry.speaker === 'sys').map((entry) => entry.text);
  check('the printer\'s lines come over the radio: PRINTER: locating colonists… / STASIS: 0 pods detected. / PRINTER: 2,400 colonists found…',
    radio.length === 3 && radio[0] === 'PRINTER: locating colonists…' && radio[2] === "PRINTER: 2,400 colonists found. They're in memory. (RACKS B–C)",
    radio.join(' | '));
  check('nothing printed while the archive was being found', eventsNamed('cluster-printed').every((event) => event.wall > eventsNamed('reveal-done')[0]!.wall));
}
{
  // The strip during the auto-reveal, in amber: the printer found something.
  h.resetTo('flight');
  h.noFault();
  h.startPrinting(1);
  h.stepFor(REVEAL_AUTO_DELAY_SEC + 1);
  check('in amber, while the printer finds them: THE PRINTER FOUND SOMETHING — press [TAB]', h.shown()?.id === 'print-found'
    && h.shown()?.keys.join() === 'TAB' && h.shown()?.urgency === 'now', JSON.stringify(h.shown()));
}
{
  // Fix round 1: the kid scanned STASIS late and the lock came mid-reveal. The printer found nothing:
  // no PRINTER: LOCATING / THE PRINTER FOUND SOMETHING, and once the lines have landed the strip
  // says where to look, as in flight.
  h.resetTo('flight');
  h.noFault();
  revealSouls(h.store, 'scan');
  h.stepFor(0.5);
  h.startPrinting(1);
  const printerLines = new Set(['print-found', 'print-locating']);
  let credited = '';
  for (let i = 0; i < 40; i++) {
    h.step();
    if (printerLines.has(h.shown()?.id ?? '')) credited = h.shown()!.id;
  }
  check('a lock during the kid\'s own reveal: the printer is not credited', credited === '' && state().souls.reveal.cause === 'scan', credited);
  h.stepUntil(() => revealAwaitsView(state()), 20);
  settle();
  check('…its lines landed, the kid in amber: THE COLONISTS ARE IN MEMORY — press [TAB]', h.shown()?.id === 'reveal-look', JSON.stringify(h.shown()));
}

// --- The LOST card -----------------------------------------------------------------------------------------
{
  h.resetTo('flight');
  h.noFault();
  h.stepUntil(() => h.status() !== 'approaching', 400);
  h.step();
  check('a crash before the reveal: the slabs open at once (cause lost), the clock stays stopped', h.status() === 'crashed'
    && !archiveSealed(state()) && state().souls.reveal.stage === 'revealed' && state().souls.reveal.cause === 'lost' && state().clock.paused);
  const card = lostCardSouls(state());
  check('the LOST card plays it: 2,400 souls in memory. 0 woke.', card.line === '2,400 souls in memory. 0 woke.' && card.reveals, JSON.stringify(card));
  check('no printing after a crash, no CONTROL "found them" quip', state().run.phase === 'flight'
    && !h.log().some((entry) => entry.text.startsWith('Oh, you found them')));
}
// An ACCEPT that strands the ship before anyone looked (fix round 1: the spec's edge case through the
// real ACCEPT ORBIT): no printing, and the LOST card plays the reveal.
{
  h.resetTo('flight');
  h.noFault();
  const level = state().level;
  const { rp, ra } = orbitForRange(level.ring, 0.05);
  const orbit = stateFromElements(rp, (ra - rp) / (ra + rp), 0, 0, level.planet.mu);
  h.store.update((d) => { d.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy }; d.burn.fuelPct = 1; });
  h.stepFor(0.5);
  const refusal = acceptOrbit(h.store);
  h.stepFor(1);
  const card = lostCardSouls(state());
  check('a stranding ACCEPT while sealed: stranded, no printing, the slabs open (lost), the card plays 2,400 souls in memory. 0 woke.',
    refusal === null && h.status() === 'stranded' && state().run.phase === 'flight' && state().clock.paused
    && state().souls.reveal.cause === 'lost' && card.reveals && card.line === '2,400 souls in memory. 0 woke.',
    `${refusal} · ${h.status()} · ${state().run.phase} · ${state().souls.reveal.cause} · ${card.line}`);
}
// A crash in the middle of a reveal (STASIS scanned seconds before impact): the slabs still open,
// and the LOST card plays the moment the crash cut short.
{
  h.resetTo('flight');
  h.noFault();
  h.stepUntil(() => (h.countdown()?.tacSec ?? 0) < 4, 400);
  revealSouls(h.store, 'scan');
  h.stepUntil(() => h.status() !== 'approaching', 30);
  h.step();
  check('a crash mid-reveal: the slabs open anyway, and the card plays it', h.status() === 'crashed' && !archiveSealed(state())
    && state().souls.reveal.stage === 'revealed' && lostCardSouls(state()).reveals, `${state().souls.reveal.stage}/${state().souls.reveal.cause}`);
}
// A crash after the reveal: the same line, but it is not the reveal any more.
{
  h.resetTo('flight');
  h.noFault();
  revealSouls(h.store, 'debug');
  h.stepUntil(() => state().souls.reveal.stage === 'revealed', 20);
  h.stepUntil(() => h.status() !== 'approaching', 400);
  h.step();
  const card = lostCardSouls(state());
  check('a crash after the reveal: the line, without replaying the reveal', card.line === '2,400 souls in memory. 0 woke.' && !card.reveals);
}

// --- The breach entry (WP6): one cluster opens -------------------------------------------------------------
{
  h.resetTo('flight');
  unsealCluster(h.store, h.soul('C12').id);
  check('unsealCluster(C12): only C12 opens; the rest stay sealed and the reveal still waits', !h.soul('C12').sealed
    && h.souls().filter((soul) => soul.sealed).length === 11 && state().souls.reveal.stage === 'sealed');
  check('…and its chip keeps its crack for the first look (crackDelaySec 0)', crackDelaySec('C12') === 0 && crackDelaySec('C01') === null);
}

// --- Life Support's clue -------------------------------------------------------------------------------------
{
  const life = getByRole(state(), 'life');
  check('Life Support\'s scan text: Idle. 0 breathing occupants.', life?.desc?.startsWith('Idle. 0 breathing occupants.') === true, life?.desc);
}

// --- No sealed archive, nothing to reveal ---------------------------------------------------------------------
{
  h.resetTo('flight');
  revealSouls(h.store, 'debug');
  h.stepUntil(() => state().souls.reveal.stage === 'revealed', 20);
  check('once open, revealSouls does nothing', !revealSouls(h.store, 'scan') && !revealSouls(h.store, 'printing'));
}

finish();
