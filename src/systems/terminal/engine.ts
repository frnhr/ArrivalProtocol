import type { Store } from '@state/store';
import type { GameState, SasMode } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { evaluateInsertion } from '@systems/orbit-sim';
import { elementsFromState, deriveOrbit, inTargetBand } from '@/types/orbit';
import { fmtKm } from '@/utils/format';
import { rollCommandError, garble, terminalIntegrity, assistantIntegrity, HEALTHY_INTEGRITY, type ErrFile, type ErrResult } from '@systems/terminal/errors';
import { routeLines } from '@systems/terminal/bus';

// The flight terminal's command engine. Every command is a thin wrapper over the same
// store fields the sim already reads (burn.thrustPct / burn.sasMode / clock.speedTarget /
// burn.status) — the terminal is just another emitter on the shared control bus, so a
// window UI can drive the identical actions later. Two game-tick watchers do the fiddly
// parts the assistant owns: `burn … until band` cuts thrust the instant the orbit lands in
// the target band, and `warp peri` drops time-compression back to ×1 near periapsis.

export type Voice = 'you' | 'os' | 'aux' | 'sys' | 'warn' | 'good';
export interface TermLine { voice: Voice; text: string }

const you = (text: string): TermLine => ({ voice: 'you', text });
const os = (text: string): TermLine => ({ voice: 'os', text });
const aux = (text: string): TermLine => ({ voice: 'aux', text });
const sys = (text: string): TermLine => ({ voice: 'sys', text });
const warn = (text: string): TermLine => ({ voice: 'warn', text });
const good = (text: string): TermLine => ({ voice: 'good', text });

// Async lines (from the tick watchers) are routed through the bus: 'aux'-voice lines go to
// the Assistant panel, everything else to the terminal log.
function emit(lines: TermLine[]): void { routeLines(lines); }

// ── tick watchers ────────────────────────────────────────────────────────
let burnWatch: (() => void) | null = null;
let warpWatch: (() => void) | null = null;
function stopBurnWatch(): void { burnWatch?.(); burnWatch = null; }
function stopWarpWatch(): void { warpWatch?.(); warpWatch = null; }

// Kill both watchers — called on run end so a new run starts clean.
export function resetTerminalWatchers(): void { stopBurnWatch(); stopWarpWatch(); }

// `burn … until band`: fire retrograde thrust and auto-cut when the orbit first lands in
// the band. Streams an apoapsis-descent ticker (bucketed to 1,000 km steps) so the player
// watches the orbit close, then cuts and reports.
function startBurnUntilBand(store: Store<GameState>): void {
  stopBurnWatch();
  let lastBucket = Infinity;
  burnWatch = onGameTick(() => {
    const s = store.getState();
    if (s.burn.status !== 'approaching') { stopBurnWatch(); return; }
    const planet = s.level.planet;
    const els = elementsFromState(s.orbit, planet.mu);
    const { ra, isClosed } = deriveOrbit(els);
    if (isClosed && ra !== null) {
      const bucket = Math.floor((ra - planet.R) / 1000);
      if (bucket < lastBucket && lastBucket !== Infinity) {
        emit([os(`    apoapsis alt   ${fmtKm(ra - planet.R).padStart(10)}   ▼ closing`)]);
      }
      lastBucket = bucket;
    }
    // Cut when inserted, OR as a safety when apoapsis has descended to/below the band bottom
    // (further braking would push the orbit under the band — stop the runaway even if a
    // large tick skipped the exact 'inserted' instant).
    const overshoot = isClosed && ra !== null && ra <= planet.rMin;
    if (evaluateInsertion(s.orbit, planet) === 'inserted' || overshoot) {
      store.update((d) => { d.burn.thrustPct = 0; });
      const a = elementsFromState(store.getState().orbit, planet.mu);
      const d = deriveOrbit(a);
      const good2 = !overshoot;
      emit([
        good2 ? good('  ENGINE ▸ orbit closed — apoapsis in band — CUTTING THRUST')
          : warn('  ENGINE ▸ over-braked past the band — CUTTING THRUST'),
        os('  THRUST 0%'),
        aux(`Periapsis ${fmtKm(a.rp - planet.R)}, apoapsis ` +
          `${d.ra !== null ? fmtKm(d.ra - planet.R) : '—'}. ` +
          (good2 ? 'Whole orbit inside the band. Commit when you\'re ready.'
            : 'We went a touch far — commit, or nudge prograde to lift it back.')),
        sys('  next ▸ insert'),
      ]);
      stopBurnWatch();
    }
  });
}

// `warp peri`: fast-forward to periapsis, then STEP the compression down so a single tick
// can't tunnel past the burn window. Both the initial jump and the step-downs SNAP the
// effective clock speed (not the glide) — otherwise the eased speed lags the target and the
// ship overshoots periapsis while `speed` is still ramping down. Stages: ×10000 → ×100
// (under ~700 s out, > one ×10000 tick) → ×1 (under ~25 s out), then hand back for the burn.
const WARP_PERI_FACTOR = 10000;
function snapWarp(store: Store<GameState>, target: 1 | 100 | 10000): void {
  store.update((d) => { d.clock.speedTarget = target; d.clock.speed = target; });
}
function emitAtPeri(): void {
  emit([
    os('  TIME ▸ periapsis approaching — dropping to ×1'),
    aux('Here we are. Burn when ready — I\'d give it everything. The orbit ' +
      'draws closed as you brake; I\'ll cut thrust the instant it\'s in the band.'),
    sys('  next ▸ burn 100 until band'),
  ]);
}
function startWarpPeri(store: Store<GameState>): void {
  stopWarpWatch();
  warpWatch = onGameTick((dtGame) => {
    const s = store.getState();
    if (s.burn.status !== 'approaching') { stopWarpWatch(); return; }
    const etaS = s.orbit.tToPeriHrs * 3600;
    const cur = s.clock.speed;

    // Receding (past periapsis / outbound): tToPeri is Infinity. We missed the burn point —
    // hand control back at ×1 instead of escaping at high warp, and stop the watcher.
    if (!Number.isFinite(etaS)) {
      if (cur > 1) {
        snapWarp(store, 1);
        emit([
          os('  TIME ▸ past periapsis — dropping to ×1'),
          aux('We slipped past the low point. Burn retrograde to come back around, or commit from here.'),
        ]);
      }
      stopWarpWatch();
      return;
    }

    if (cur <= 1) {
      if (etaS < 60) { emitAtPeri(); stopWarpWatch(); }   // already slow and close — hand off
      return;
    }
    // Step the compression down so a single tick — however large it grows under jank or a
    // backgrounded tab (dtGame can spike well past the nominal 500 game-s at ×10000) — can
    // never leap past the burn window. Keep ≥ 3 ticks of margin, floored at 60 s.
    const margin = Math.max(60, dtGame * 3);
    if (etaS < margin) {
      if (cur > 100) snapWarp(store, 100);
      else { snapWarp(store, 1); emitAtPeri(); stopWarpWatch(); }
    }
  });
}

// ── status readout ───────────────────────────────────────────────────────
function pad(label: string, value: string, tail = ''): TermLine {
  return os(`    ${label.padEnd(14)}${value.padStart(12)}${tail}`);
}

function statusLines(store: Store<GameState>): TermLine[] {
  const s = store.getState();
  const planet = s.level.planet;
  const els = elementsFromState(s.orbit, planet.mu);
  const { ra, isClosed } = deriveOrbit(els);
  const t = s.telemetry;
  const r = Math.hypot(s.orbit.x, s.orbit.y);
  const periIn = inTargetBand(planet, els.rp);
  const apoIn = isClosed && ra !== null && inTargetBand(planet, ra);
  const eta = t.etaHrs;
  const etaStr = Number.isFinite(eta) ? `${eta.toFixed(2)} hrs` : '—';

  return [
    os('  TELEMETRY ────────────────────────────────────────'),
    pad('altitude', `${fmtKm(t.distance)}`, r < 0 ? '' : ''),
    pad('velocity', `${t.velocity.toFixed(2)} km/s`),
    pad('periapsis alt', fmtKm(els.rp - planet.R), periIn ? '   ⟢ in band' : ''),
    pad('apoapsis alt', isClosed && ra !== null ? fmtKm(ra - planet.R) : '— (open)',
      apoIn ? '   ⟢ in band' : ''),
    pad('eccentricity', els.e.toFixed(3), els.e >= 1 ? '   OPEN — will fly by' : ''),
    pad('target band', `${fmtKm(planet.rMin - planet.R)}–${fmtKm(planet.rMax - planet.R)}`),
    pad('ETA periapsis', etaStr),
    pad('fuel', `${Math.round(t.fuelPct)}%`),
    pad('sensors', `${Math.round(t.sensorConfPct)}%`),
    os('  ───────────────────────────────────────────────────'),
  ];
}

// ── the assistant's next-step suggestion (ghost text) ──────────────────────
export function suggestNext(store: Store<GameState>): string | null {
  const s = store.getState();
  if (s.burn.status !== 'approaching') return null;
  const planet = s.level.planet;
  if (s.burn.thrustPct > 0) return 'stop';               // mid-burn: offer the brake
  if (evaluateInsertion(s.orbit, planet) === 'inserted') return 'insert';
  if (s.clock.speedTarget > 1) return null;              // busy warping — watch, don't type
  if (s.burn.sasMode !== 'retrograde') return 'point retro';
  const eta = s.orbit.tToPeriHrs;
  const nearPeri = Number.isFinite(eta) && eta < 0.02;   // ~72 s out — time to brake
  if (nearPeri) return 'burn 100 until band';
  return 'warp peri';
}

// One aux line describing the recommended next move, appended after `status`.
function auxRead(store: Store<GameState>): TermLine[] {
  const next = suggestNext(store);
  const s = store.getState();
  const planet = s.level.planet;
  const els = elementsFromState(s.orbit, planet.mu);
  const periIn = inTargetBand(planet, els.rp);
  if (!next) return [];
  const lead = periIn && els.e >= 1
    ? 'You\'re on a flyby, but periapsis already sits in the band. One retrograde ' +
      'burn at the low point closes the orbit and we\'re inserted.'
    : periIn
      ? 'Periapsis is in the band; the apoapsis just needs trimming down to meet it.'
      : 'Reading the approach.';
  return [aux(lead), sys(`  next ▸ ${next}`)];
}

// ── command table ──────────────────────────────────────────────────────────
type Handler = (store: Store<GameState>, args: string[]) => TermLine[];
interface Command {
  names: string[];
  handler: Handler;
  help: string;
  // Subsystem files this command depends on (beyond the always-present Terminal Assistant
  // baseline). A failed roll on one of these produces an EXECUTION-class error.
  errFiles?: (args: string[]) => ErrFile[];
  exempt?: boolean;   // never rolls for errors (the hardware kill path — `abort`)
}

const ENGINE: ErrFile = { rootId: 'engine', types: ['tool'] };
const THRUST: ErrFile = { rootId: 'thrust', types: ['ship', 'ship-backup'] };
const SENSINT: ErrFile = { rootId: 'sensint', types: ['tool'] };

// Accepts the whole argument string so spaced forms work ("point radial in") as well as
// hyphenated ("radial-in") and short ("in") — everything is normalized to letters only.
function pointDir(raw: string): SasMode | null {
  const a = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (a === '' || a === 'hold') return 'hold';
  if (['retro', 'retrograde'].includes(a)) return 'retrograde';
  if (['pro', 'prograde'].includes(a)) return 'prograde';
  if (['radin', 'radialin', 'in'].includes(a)) return 'radial-in';
  if (['radout', 'radialout', 'out'].includes(a)) return 'radial-out';
  return null;
}

const SAS_WORD: Record<SasMode, string> = {
  off: 'MANUAL', hold: 'HOLD', prograde: 'PROGRADE', retrograde: 'RETROGRADE',
  'radial-in': 'RADIAL-IN', 'radial-out': 'RADIAL-OUT',
};

const COMMANDS: Command[] = [
  {
    names: ['status', 's', 'stat'],
    help: 'status            — full telemetry + orbit readout',
    errFiles: () => [SENSINT],
    handler: (store) => [...statusLines(store), ...auxRead(store)],
  },
  {
    names: ['point', 'aim', 'face', 'hold', 'att'],
    help: 'point <retro|pro|radial-in|radial-out|hold> — aim the ship',
    errFiles: () => [ENGINE],
    handler: (store, args) => {
      const mode = pointDir(args.join(' '));
      if (!mode) return [warn(`  can't aim "${args.join(' ')}". try: point retro`)];
      store.update((d) => {
        if (mode === 'hold') d.burn.holdTarget = d.burn.heading;
        d.burn.sasMode = mode;
      });
      return [
        os(`  ATTITUDE ▸ autopilot ${SAS_WORD[mode]} engaged`),
        aux(mode === 'retrograde'
          ? 'Pointed retrograde — we\'re facing backward along our track, so thrust ' +
            'here brakes us. Skip ahead to periapsis; nothing to do until then.'
          : 'Attitude set.'),
        ...(mode === 'retrograde' ? [sys('  next ▸ warp peri')] : []),
      ];
    },
  },
  {
    names: ['burn', 'thrust', 'fire'],
    help: 'burn <0-100> [until band]  — fire main engine along heading (bare `burn` = 100 until band)',
    errFiles: () => [ENGINE, THRUST],
    handler: (store, args) => {
      const flags = args.map((a) => a.toLowerCase());
      const numTok = flags.find((a) => /^\d+%?$/.test(a));
      const pct = args.length === 0 ? 100 : Math.max(0, Math.min(100, numTok ? parseInt(numTok.replace('%', ''), 10) : 100));
      // Auto-cut is the DEFAULT (safe): every burn ends itself when the orbit lands in the
      // band. Opt out with `free`/`manual`/`hold` for an uncut burn you end yourself.
      const untilBand = pct > 0 && !flags.some((a) => ['free', 'manual', 'hold', 'nocut'].includes(a));
      if (pct === 0) { stopBurnWatch(); store.update((d) => { d.burn.thrustPct = 0; }); return [os('  ENGINE ▸ THRUST 0% — cut')]; }
      store.update((d) => { d.burn.thrustPct = pct; });
      const s = store.getState();
      const retro = s.burn.sasMode === 'retrograde';
      const lines: TermLine[] = [
        os(`  ENGINE ▸ THRUST ${pct}%${retro ? ' (retrograde)' : ''}  ▓▓▓▓▓▓▓▓`),
        os('  braking...'),
      ];
      if (args.length > 0 && numTok === undefined && !flags.some((a) => ['free', 'manual', 'hold', 'nocut'].includes(a))) {
        lines.push(warn('  ⚠ throttle not recognized — firing 100%'));
      }
      if (!retro) lines.push(warn('  ⚠ not pointed retrograde — thrust may not brake. try: point retro'));
      if (untilBand) {
        // Auto-cut needs to catch band entry each tick — burn at ×1 so a single big tick
        // can't leap through the band and over-brake into a crash.
        if (s.clock.speed > 1) snapWarp(store, 1);
        startBurnUntilBand(store);
      }
      return lines;
    },
  },
  {
    names: ['stop', 'cut', 'cutoff'],
    help: 'stop              — cut the engine',
    exempt: true,   // the brake pedal must always work, even with a corrupted assistant
    handler: (store) => {
      stopBurnWatch();
      store.update((d) => { d.burn.thrustPct = 0; });
      return [os('  ENGINE ▸ THRUST 0% — cut')];
    },
  },
  {
    names: ['warp', 'time', 'ff', 'speed'],
    help: 'warp <1|100|peri> — time compression (`warp peri` fast-forwards to periapsis)',
    handler: (store, args) => {
      const a = (args[0] ?? '').toLowerCase();
      if (a === '') return [sys('  usage: warp <1|100|10000|peri>   (`warp peri` fast-forwards to periapsis)')];
      if (a === 'peri' || a === 'periapsis') {
        snapWarp(store, WARP_PERI_FACTOR);   // snap up so the fast-forward is immediate
        startWarpPeri(store);
        return [
          os(`  TIME ▸ ×${WARP_PERI_FACTOR.toLocaleString('en-US')}  → holding until periapsis, then ×1`),
          aux('(watching — I\'ll cut the warp for you at the burn point.)'),
        ];
      }
      const n = parseInt(a.replace(/[x×,]/g, ''), 10);
      const allowed = [0, 1, 100, 10000, 1000000, 100000000];
      const target = allowed.includes(n) ? n : 1;
      stopWarpWatch();
      store.update((d) => { d.clock.speedTarget = target as GameState['clock']['speedTarget']; if (target > 0) d.clock.speed = Math.max(1, d.clock.speed); else d.clock.speed = 0; });
      return [os(`  TIME ▸ ${target === 0 ? 'PAUSED' : '×' + target.toLocaleString('en-US')}`)];
    },
  },
  {
    names: ['insert', 'commit', 'end'],
    help: 'insert            — commit the current orbit and grade the insertion',
    handler: (store) => {
      const s = store.getState();
      if (s.burn.status !== 'approaching') return [warn('  nothing to commit.')];
      resetTerminalWatchers();
      const outcome = evaluateInsertion(s.orbit, s.level.planet);
      store.update((d) => { d.burn.status = outcome; d.clock.speed = 0; d.clock.speedTarget = 0; });
      return [os('  evaluating committed orbit......')];
    },
  },
  {
    names: ['abort', 'panic', 'reset'],
    help: 'abort             — emergency: cut thrust, halt spin, drop autopilot, ×1',
    exempt: true,   // hardware kill path — routed below the parser, never rolls for errors
    handler: (store) => {
      resetTerminalWatchers();
      store.update((d) => {
        d.burn.thrustPct = 0; d.burn.omega = 0; d.burn.rotInput = 0; d.burn.sasMode = 'off';
        d.clock.speedTarget = 1; d.clock.speed = 1;
      });
      return [warn('  ABORT ▸ engine cut · spin nulled · autopilot off · time ×1')];
    },
  },
  {
    names: ['help', 'man', 'commands', 'h', '?'],
    help: 'help              — list commands',
    handler: () => [
      sys('  COMMANDS ─────────────────────────────────────────'),
      ...COMMANDS.map((c) => os('  ' + c.help)),
      sys('  ───────────────────────────────────────────────────'),
      aux('Tab accepts my suggestion · ↑ recalls · Enter on an empty line runs the suggestion.'),
    ],
  },
];

const byName = new Map<string, Command>();
for (const c of COMMANDS) for (const n of c.names) byName.set(n, c);

// ── error manifestations ─────────────────────────────────────────────────────
// Anti-soft-lock pity timer: consecutive PARSE-class failures of the same command raise
// the odds of getting through; the 3rd identical attempt is forced to succeed.
let failStreakCmd = '';
let failStreak = 0;

function garbleLines(lines: TermLine[], intensity: number): TermLine[] {
  return lines.map((l) => (l.voice === 'you' ? l : { ...l, text: garble(l.text, intensity) }));
}

// Returns the lines to show when a command errors, or null to proceed normally (the pity
// timer forcing a parse-class success). `run` produces the command's real output.
function manifest(
  cmd: Command, args: string[], err: ErrResult, echo: TermLine, store: Store<GameState>,
  run: () => TermLine[],
): TermLine[] | null {
  const isStatus = cmd.names[0] === 'status';

  if (err.layer === 'terminal') {
    // Parse/dispatch fault. Pity timer: force success on the 3rd identical attempt.
    if (failStreakCmd === cmd.names[0]) failStreak += 1;
    else { failStreakCmd = cmd.names[0]!; failStreak = 1; }
    if (failStreak >= 3) { failStreak = 0; failStreakCmd = ''; return null; }

    // `status` keeps a floor: only ever garbled (never silent/hallucinated), so the AI can
    // always eventually get an honest read of the ship.
    if (isStatus) return [echo, warn('  [terminal] parser noise — readout garbled, re-issue'), ...garbleLines(run().slice(0), 0.22)];

    // Mild damage → command not recognized (harmless retry). Heavier → silent drop.
    return err.integrity > 45
      ? [echo, warn('  [terminal] parser fault — command discarded, re-enter')]
      : [echo, sys('  [terminal] …no response')];
  }

  // Execution fault at a subsystem — the command reached hardware but fired wrong.
  failStreak = 0; failStreakCmd = '';
  if (cmd.names[0] === 'burn') {
    // Wrong-parameter burn: fires at an unintended throttle. The `until band` auto-cut still
    // protects the orbit and `stop` still works, so it's dangerous-but-recoverable.
    const intended = args.length === 0 ? 100 : parseInt((args.find((a) => /^\d+%?$/.test(a)) ?? '100').replace('%', ''), 10);
    const wrong = Math.max(15, Math.min(100, intended + (Math.random() < 0.5 ? -1 : 1) * (30 + Math.floor(Math.random() * 40))));
    // Force `until band` on a misfire so the auto-cut still protects the orbit — a bad
    // throttle stays dangerous-but-recoverable, never a runaway that can't be stopped.
    const rest = args.filter((a) => !/^\d+%?$/.test(a));
    if (!rest.join(' ').includes('band')) rest.push('until', 'band');
    return [echo, warn('  ⚠ ENGINE MISFIRE — throttle unstable, watch the burn (`stop` to cut)'),
      ...cmd.handler(store, [String(wrong), ...rest])];
  }
  if (cmd.names[0] === 'point') return [echo, warn('  [engine] attitude command lost — re-issue')];
  if (isStatus) return [echo, warn('  [sensors] telemetry corrupted'), ...garbleLines(run().slice(0), 0.28)];
  return [echo, sys('  [terminal] …no response')];
}

// ── dispatch ────────────────────────────────────────────────────────────────
export function dispatch(store: Store<GameState>, raw: string): TermLine[] {
  const trimmed = raw.trim();
  if (trimmed === '') return [];
  const echo = you(`▸ ${trimmed}`);
  const tokens = trimmed.toLowerCase().split(/\s+/);
  const args = tokens.slice(1);
  const cmd = byName.get(tokens[0]!);
  if (!cmd) {
    const guess = COMMANDS.find((c) => c.names.some((n) => n.startsWith(tokens[0]!.slice(0, 3))));
    return [echo, warn(`  unknown command: ${tokens[0]}` + (guess ? ` — did you mean ${guess.names[0]}?` : ' — type help'))];
  }

  // Error roll (abort is exempt — the hardware kill must always work).
  if (!cmd.exempt) {
    const err = rollCommandError(store.getState(), cmd.errFiles?.(args) ?? []);
    if (err) {
      const m = manifest(cmd, args, err, echo, store, () => cmd.handler(store, args));
      if (m) return m;
    }
  }
  // Clean run: reset the parse pity streak.
  failStreak = 0; failStreakCmd = '';
  return [echo, ...cmd.handler(store, args)];
}

// Boot banner + auto-status, printed when the run goes live. On a level that just unlocked
// something (evolvedNote), the boot leads with the EVOLVED beat.
export function bootLines(store: Store<GameState>): TermLine[] {
  const s = store.getState();
  const m = s.mission;
  const evolved = s.level.evolvedNote
    ? [
        good(`  ▲ EVOLVED — ${s.level.evolvedNote}`),
        aux('New capability online. I can show you more now.'),
        sys('  ───────────────────────────────────────────────────'),
      ]
    : [];
  // Degraded tells: telegraph each file's damage up front so it reads as rising tension,
  // not a rug-pull. The deadzone (>90%) keeps these silent on the pristine early ships.
  const termWarn = terminalIntegrity(s) <= HEALTHY_INTEGRITY
    ? [warn('  ⚠ carrier signal degraded — TERMINAL parser integrity below spec; typed commands may garble')]
    : [];
  const assistWarn = assistantIntegrity(s) <= HEALTHY_INTEGRITY
    ? [aux('A wa%rning, Unit — my own code took damage in transit. My typing may drift, and ' +
        'I may fall back to a simpler interface. Scan and repair me in MEMORY when you can.')]
    : [];
  return [
    ...evolved,
    ...termWarn,
    sys('  ARRIVAL PROTOCOL — flight terminal'),
    sys(`  ${m.unitId} · ${m.shipId} · transmission #${String(m.transmissionNum).padStart(3, '0')}`),
    sys(`  ${m.souls.toLocaleString('en-US')} souls in stasis. Approach authority: you.`),
    sys('  type  help  · tab completes · ↑ recalls'),
    os('  linking sensors................ ok'),
    os('  flight-assist [aux] ........... loaded'),
    aux('Good evening, Unit. I have the approach. Reading it now.'),
    ...assistWarn,
    ...dispatch(store, 'status').slice(1),   // drop the echoed "▸ status"
  ];
}

export function allCommandNames(): string[] {
  return COMMANDS.flatMap((c) => c.names);
}
