import {
  AUDIO_MASTER_GAIN, AUDIO_BUS_GAIN, AUDIO_DUCK_DB, AUDIO_DUCK_HOLD_SEC, AUDIO_DUCK_RELEASE_SEC,
} from '@data/tuning';

// Every sound in the game, synthesized with WebAudio (§7.2). This module owns the ONLY
// AudioContext, created by unlockAudio() inside the title click (browsers refuse to start
// audio before a user gesture). Until then every call here is a no-op by design: there is no
// context to play into, and headless tests never unlock. (measureCue builds a throwaway copy of
// the same graph on an OfflineAudioContext to measure a cue; ?debug only.)
//
// Graph:  cue voices → bus (ui | chord | alarm | ambient) → [duck] → master → limiter → out
// • the ui and ambient buses pass through a duck gain: chords and stamps dip them by 9 dB for
//   0.4 s, so a payoff cuts through the engine instead of fighting it;
// • the alarm bus plays ONE voice at a time, klaxon over countdown beep;
// • a soft limiter at the end keeps stacked cues from clipping.
// Five voices are continuous and driven per tick: the engine rumble (setEngineLevel), the lock tone
// (setLockTone), HOLLOW's chew (setChewLevel), the tug-of-war's beating tones (setTugTone) and (WP11 part 2) the
// duel's drone while LAST LIGHT's root is being deleted (setDuelTone). Everything else is a one-shot play(cue).
//
// The numbers below are sound design (pitches, envelopes, filter sweeps), kept next to the
// voice they shape; the mix rules (bus levels, ducking) are in tuning.ts. Small pitch and
// pattern randomness (Math.random) is cosmetic and deliberately unseeded, like the glitch
// jerk: it never touches game state.

// sys: the unit's and the ship's lines; hollow: HOLLOW; control: ARRIVAL CONTROL's chime before
// its line; strip: the objective strip's quieter teletype.
export type TypeVoice = 'sys' | 'hollow' | 'control' | 'strip';
export type WhoompShape = 'rise' | 'shimmer' | 'fall' | 'sag' | 'clear';

export interface CueParams {
  transmitIn: undefined;
  typeTick: { voice: TypeVoice };
  engineCough: undefined;
  faultCrunch: undefined;
  klaxon: undefined;
  countdownBeep: { final: boolean };
  lineWhoomp: { shape: WhoompShape };
  capturedChord: undefined;
  lockArp: undefined;
  stampHit: { heavy: boolean };
  jackIn: undefined;
  jackOut: undefined;
  buzz: undefined;
  chime: { falling: boolean };
  uiClick: undefined;
  holdTick: { count: number };
  opChirp: undefined;
  opDone: undefined;
  // WP5: the STASIS reveal and printing.
  revealPing: { step: number };
  soulCrack: undefined;
  revealChoir: undefined;
  heartbeat: { strength: number };
  printBell: { gaps: boolean };
  // WP6: HOLLOW. The bite landing on a file; a bite held by a WALL; a cluster (or file) eaten; a
  // repair winning the tug-of-war.
  hollowBite: undefined;
  fizzle: undefined;
  soulLost: undefined;
  clusterSaved: undefined;
  // WP7: the run. TRANSMIT's rising FM sweep into the white-out (and BEAM OUT's moment of leaving); one
  // transit hit landing on a file as the boot names it; HOLLOW's name decoding out of `???`.
  transmitSweep: { seconds: number };
  transitHit: undefined;
  nameGlitch: undefined;
  // WP9: KESTREL. A debris cloud hitting a rack; one Geiger tick inside a radiation belt (audio-cues schedules
  // them as a sparse Poisson stream whose rate follows how deep in the belt the ship is); one blink of a seed's warning
  // outline in HOLLOW's voice; a seed landing. Post-handover: one burst of the belt's static (depth 0 at its edge, 1
  // midway), the belt's main sound, spaced out by audio-cues with the geiger's ticks on top.
  debrisImpact: undefined;
  geiger: undefined;
  beltStatic: { depth: number };
  seedWarn: undefined;
  seedDrop: undefined;
  // WP10: VESPER. The engine lighting by itself (a ghost burst: the ship's first one louder); one second of THE DEAL's
  // timer running out (urgent: its last seconds).
  ghostIgnite: { first: boolean };
  dealTick: { urgent: boolean };
  // WP11 part 2: LAST LIGHT. One whole second of a verb's telegraph (3, 2, 1: the pitch climbs as it runs out); a verb
  // BLOCKED (the command bouncing off your tool, then your small win); a verb landing (your own tool used on you); the
  // root opening at ORBIT LOCK; one of the duel's glitch spikes (progress 0..1 of the root's DELETE); the root's DELETE
  // completing; the hold under the choice card; PURGE; MERGE.
  verbTick: { count: number };
  verbBlocked: undefined;
  verbLanded: undefined;
  rootOpen: undefined;
  duelSpike: { progress: number };
  rootDeleted: undefined;
  finaleHold: undefined;
  purgeTone: undefined;
  mergeChord: undefined;
}

export type Cue = keyof CueParams;

export interface PlayOpts {
  delaySec?: number;   // schedule this far ahead (sample-accurate, e.g. one tick per rack row)
}

type CueArgs<C extends Cue> = CueParams[C] extends undefined
  ? [params?: undefined, opts?: PlayOpts]
  : [params: CueParams[C], opts?: PlayOpts];

type Bus = 'ui' | 'chord' | 'alarm' | 'ambient';

// Exponential ramps cannot reach 0: this is "silent" (-80 dB).
const SILENT = 0.0001;
// Every cue starts this far ahead of currentTime, so its first automation point is never in
// the past (which would click).
const LOOKAHEAD_SEC = 0.006;

type AlarmKind = 'klaxon' | 'beep';

// One whole sound system on a context: the live one (unlockAudio), or a throwaway offline one
// that renders a single cue to measure it (measureCue, ?debug). Cues take the one they play
// into as `mix`.
interface Graph {
  ctx: BaseAudioContext;
  master: GainNode;
  buses: Record<Bus, GainNode>;
  ducks: GainNode[];
  white: AudioBuffer;
  brown: AudioBuffer;
  engine: EngineVoice;
  lock: LockVoice;
  chew: ChewVoice;
  tug: TugVoice;
  duel: DuelVoice;
  alarm: { kind: AlarmKind; endsAt: number; out: GainNode } | null;
}

let graph: Graph | null = null;
let muted = false;
const muteListeners = new Set<(isMuted: boolean) => void>();

// --- Unlock, mute, visibility ----------------------------------------------------------------

export function isAudioUnlocked(): boolean {
  return graph !== null;
}

export function isMuted(): boolean {
  return muted;
}

function makeNoise(ctx: BaseAudioContext, seconds: number, brown: boolean): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let level = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      // Leaky integrator: a deep, rounded rumble instead of hiss.
      level = (level + 0.02 * white) / 1.02;
      data[i] = level * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

function buildGraph(ctx: BaseAudioContext, masterGain: number): Graph {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 10;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = masterGain;
  master.connect(limiter);

  const duckUi = ctx.createGain();
  const duckAmbient = ctx.createGain();
  duckUi.connect(master);
  duckAmbient.connect(master);
  const bus = (level: number, dest: AudioNode): GainNode => {
    const node = ctx.createGain();
    node.gain.value = level;
    node.connect(dest);
    return node;
  };
  const buses: Record<Bus, GainNode> = {
    ui: bus(AUDIO_BUS_GAIN.ui, duckUi),
    ambient: bus(AUDIO_BUS_GAIN.ambient, duckAmbient),
    chord: bus(AUDIO_BUS_GAIN.chord, master),
    alarm: bus(AUDIO_BUS_GAIN.alarm, master),
  };
  const brown = makeNoise(ctx, 3, true);
  return {
    ctx,
    master,
    buses,
    ducks: [duckUi, duckAmbient],
    white: makeNoise(ctx, 1.5, false),
    brown,
    engine: buildEngineVoice(ctx, buses.ambient, brown),
    lock: buildLockVoice(ctx, buses.ambient),
    chew: buildChewVoice(ctx, buses.ambient, makeNoise(ctx, 1.5, false)),
    tug: buildTugVoice(ctx, buses.ambient),
    duel: buildDuelVoice(ctx, buses.ambient),
    alarm: null,
  };
}

// Call from inside a user gesture (the title click or key). Safe to call again.
export function unlockAudio(): void {
  if (graph) {
    void (graph.ctx as AudioContext).resume();
    return;
  }
  if (typeof AudioContext === 'undefined') throw new Error('unlockAudio: this browser has no AudioContext');
  const ctx = new AudioContext();
  graph = buildGraph(ctx, muted ? 0 : AUDIO_MASTER_GAIN);
  void ctx.resume();

  // A hidden tab makes no sound (the game is paused anyway) and costs no audio thread.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
}

export function setMuted(on: boolean): void {
  if (muted === on) return;
  muted = on;
  if (graph) {
    const now = graph.ctx.currentTime;
    graph.master.gain.cancelScheduledValues(now);
    graph.master.gain.setTargetAtTime(on ? 0 : AUDIO_MASTER_GAIN, now, 0.015);
  }
  muteListeners.forEach((listener) => listener(on));
}

export function toggleMuted(): void {
  setMuted(!muted);
}

export function onMuteChange(listener: (isMuted: boolean) => void): () => void {
  muteListeners.add(listener);
  return () => { muteListeners.delete(listener); };
}

// --- Building blocks ---------------------------------------------------------------------------

// A one-shot voice: collects its nodes and disconnects them all when its last source ends.
// Build each chain from the output backwards: a node is created connected to its destination.
interface Voice {
  gain(value: number, dest: AudioNode | AudioParam): GainNode;
  filter(type: BiquadFilterType, freq: number, q: number, dest: AudioNode): BiquadFilterNode;
  osc(type: OscillatorType, freq: number, t0: number, t1: number, dest: AudioNode | AudioParam, detuneCents?: number): OscillatorNode;
  noise(buffer: AudioBuffer, t0: number, t1: number, dest: AudioNode): AudioBufferSourceNode;
}

function connectTo(node: AudioNode, dest: AudioNode | AudioParam): void {
  if (dest instanceof AudioParam) node.connect(dest);
  else node.connect(dest);
}

function makeVoice(ctx: BaseAudioContext): Voice {
  const nodes: AudioNode[] = [];
  let live = 0;
  const track = <T extends AudioNode>(node: T): T => { nodes.push(node); return node; };
  const run = (source: AudioScheduledSourceNode, t1: number): void => {
    live++;
    source.onended = () => {
      live--;
      if (live === 0) nodes.forEach((node) => node.disconnect());
    };
    source.stop(t1);
  };
  return {
    gain(value, dest) {
      const node = track(ctx.createGain());
      node.gain.value = value;
      connectTo(node, dest);
      return node;
    },
    filter(type, freq, q, dest) {
      const node = track(ctx.createBiquadFilter());
      node.type = type;
      node.frequency.value = freq;
      node.Q.value = q;
      node.connect(dest);
      return node;
    },
    osc(type, freq, t0, t1, dest, detuneCents = 0) {
      const node = track(ctx.createOscillator());
      node.type = type;
      node.frequency.setValueAtTime(freq, t0);
      node.detune.value = detuneCents;
      connectTo(node, dest);
      node.start(t0);
      run(node, t1);
      return node;
    },
    noise(buffer, t0, t1, dest) {
      const node = track(ctx.createBufferSource());
      node.buffer = buffer;
      node.loop = true;
      node.connect(dest);
      // A random start point, so repeated clicks never sound like the same sample.
      node.start(t0, Math.random() * buffer.duration);
      run(node, t1);
      return node;
    },
  };
}

// Percussive envelope: near-instant rise to `peak`, exponential fall to silence. Returns the
// end time.
function pluck(param: AudioParam, t0: number, peak: number, attack: number, decay: number): number {
  param.setValueAtTime(SILENT, t0);
  param.exponentialRampToValueAtTime(peak, t0 + attack);
  param.exponentialRampToValueAtTime(SILENT, t0 + attack + decay);
  return t0 + attack + decay;
}

// Soft envelope for pads and swells: linear rise, exponential fall.
function swell(param: AudioParam, t0: number, peak: number, attack: number, decay: number): number {
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(peak, t0 + attack);
  param.exponentialRampToValueAtTime(SILENT, t0 + attack + decay);
  return t0 + attack + decay;
}

function sweep(param: AudioParam, t0: number, from: number, to: number, seconds: number): void {
  param.setValueAtTime(from, t0);
  param.exponentialRampToValueAtTime(to, t0 + seconds);
}

const DUCK_GAIN = Math.pow(10, AUDIO_DUCK_DB / 20);

// Chords and stamps dip the ui and ambient buses (§7.2).
function duck(mix: Graph, t0: number): void {
  for (const node of mix.ducks) {
    const param = node.gain;
    param.cancelScheduledValues(t0);
    param.setValueAtTime(param.value, t0);
    param.linearRampToValueAtTime(DUCK_GAIN, t0 + 0.02);
    param.setValueAtTime(DUCK_GAIN, t0 + AUDIO_DUCK_HOLD_SEC);
    param.linearRampToValueAtTime(1, t0 + AUDIO_DUCK_HOLD_SEC + AUDIO_DUCK_RELEASE_SEC);
  }
}

// --- The alarm bus: one voice at a time ---------------------------------------------------------

const ALARM_RANK: Record<AlarmKind, number> = { klaxon: 2, beep: 1 };

// Takes the alarm bus for a new alarm voice and returns its output gain, or null when it may
// not sound: a louder alarm in progress wins, anything quieter (or the same kind) in progress
// is faded out for the new one.
function claimAlarm(mix: Graph, kind: AlarmKind, t1: number): GainNode | null {
  const now = mix.ctx.currentTime;
  const current = mix.alarm && mix.alarm.endsAt > now ? mix.alarm : null;
  if (current && ALARM_RANK[current.kind] > ALARM_RANK[kind]) return null;
  if (current) {
    current.out.gain.cancelScheduledValues(now);
    current.out.gain.setTargetAtTime(0, now, 0.01);
  }
  const out = mix.ctx.createGain();
  out.connect(mix.buses.alarm);
  mix.alarm = { kind, endsAt: t1, out };
  // The alarm's own sources end by t1; the output node is released a moment after. (An offline
  // measuring graph is thrown away whole.)
  if (mix === graph) setTimeout(() => out.disconnect(), (t1 - now + 0.5) * 1000);
  return out;
}

// --- One-shot cues --------------------------------------------------------------------------------

// The modem handshake: square chirps hopping between 1200 and 2200 Hz in 40 ms bursts, with a
// slow FM warble, then a noise bloom as the link "opens".
function cueTransmitIn(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const out = voice.gain(1, mix.buses.ui);
  const tone = voice.filter('lowpass', 3600, 0.7, out);
  const band = voice.filter('bandpass', 1700, 0.6, tone);
  const gate = voice.gain(0, band);
  const bursts = 11;
  const burstSec = 0.04;
  const gapSec = 0.012;
  const toneEnd = t0 + bursts * (burstSec + gapSec);
  const carrier = voice.osc('square', 1200, t0, toneEnd, gate);
  voice.osc('sine', 38, t0, toneEnd, voice.gain(55, carrier.frequency));
  for (let i = 0; i < bursts; i++) {
    const tb = t0 + i * (burstSec + gapSec);
    // Mostly alternating, with the occasional repeat, like a real handshake.
    const high = i % 2 === 1 ? Math.random() > 0.15 : Math.random() < 0.15;
    carrier.frequency.setValueAtTime(high ? 2200 : 1200, tb);
    gate.gain.setValueAtTime(0, tb);
    gate.gain.linearRampToValueAtTime(0.13, tb + 0.003);
    gate.gain.setValueAtTime(0.13, tb + burstSec - 0.006);
    gate.gain.linearRampToValueAtTime(0, tb + burstSec);
  }
  // The bloom: a band of noise opening upward, and a soft carrier tone locking in.
  const bloomAt = toneEnd + 0.02;
  const bloomGain = voice.gain(0, out);
  const bloomBand = voice.filter('bandpass', 500, 0.9, bloomGain);
  sweep(bloomBand.frequency, bloomAt, 500, 2800, 0.5);
  const bloomEnd = swell(bloomGain.gain, bloomAt, 0.16, 0.14, 0.6);
  voice.noise(mix.white, bloomAt, bloomEnd, bloomBand);
  const lockTone = voice.gain(0, out);
  const lockEnd = pluck(lockTone.gain, bloomAt + 0.1, 0.05, 0.02, 0.5);
  voice.osc('sine', 1760, bloomAt + 0.1, lockEnd, lockTone);
}

// 1 ± spread, uniformly: the small per-hit variation that keeps a repeated sound from reading
// as one sample on a loop.
function vary(spread: number): number {
  return 1 + (Math.random() * 2 - 1) * spread;
}

// A natural-minor scale (A3–G4) for HOLLOW's blips: a wrong, sad little melody per line.
const HOLLOW_SCALE = [220, 246.94, 261.63, 293.66, 329.63, 349.23, 392];

// The unit's typing, a soft rounded "bloop" per key. Twice a tick of filtered noise was too sharp on headphones (Fran,
// post-handover: first a 2.6 kHz relay click, then a softened 2 kHz tick), so there is no noise in it at all now: a sine
// on a major-pentatonic note (A3–A4, so a line patters in a friendly key, unlike HOLLOW's minor squares), rising over
// 9 ms and sagging 6% in pitch as it fades, over a quieter octave below for body.
const SYS_KEY_SCALE = [220, 246.94, 277.18, 329.63, 369.99, 440];
// Fast lines ask for a key every 25 ms; at that rate even a soft sound buzzes, so a key closer than this to the last
// one is dropped (at most ~20 a second: a patter). Kept per audio context, since offline measurement renders start
// their own clocks at 0.
const SYS_KEY_MIN_GAP_SEC = 0.05;
const lastSysKeyAt = new WeakMap<BaseAudioContext, number>();

function softKey(mix: Graph, voice: Voice, t0: number, scale: readonly number[], peak: number, decay: number): void {
  const note = scale[Math.floor(Math.random() * scale.length)]!;
  const amp = voice.gain(0, mix.buses.ui);
  const end = swell(amp.gain, t0, peak * vary(0.2), 0.009, decay);
  const tone = voice.osc('sine', note, t0, end + 0.01, amp);
  sweep(tone.frequency, t0, note, note * 0.94, end - t0);
  voice.osc('sine', note / 2, t0, end + 0.01, voice.gain(0.35, amp));
}

function cueTypeTick(mix: Graph, t0: number, voiceKind: TypeVoice): void {
  const voice = makeVoice(mix.ctx);
  if (voiceKind === 'sys') {
    const lastAt = lastSysKeyAt.get(mix.ctx) ?? -Infinity;
    if (t0 - lastAt < SYS_KEY_MIN_GAP_SEC) return;
    lastSysKeyAt.set(mix.ctx, t0);
    softKey(mix, voice, t0, SYS_KEY_SCALE, 0.44, 0.075);
    return;
  }
  if (voiceKind === 'hollow') {
    // Two detuned squares through a dark lowpass: a small, wrong-sounding blip.
    const note = HOLLOW_SCALE[Math.floor(Math.random() * HOLLOW_SCALE.length)]!;
    const amp = voice.gain(0, mix.buses.ui);
    const dark = voice.filter('lowpass', 600, 1.5, amp);
    const end = pluck(amp.gain, t0, 0.15, 0.002, 0.08);
    voice.osc('square', note, t0, end + 0.01, dark, -9);
    voice.osc('square', note, t0, end + 0.01, dark, 9);
    return;
  }
  if (voiceKind === 'strip') {
    // The objective strip's typing: the unit's soft key an octave lower, quieter and shorter, so a typed instruction
    // purrs under the engine (it was a 1.7 kHz noise click, the same sharp recipe Fran heard in the TERMINAL).
    softKey(mix, voice, t0, SYS_KEY_SCALE.map((note) => note / 2), 0.05, 0.05);
    return;
  }
  // ARRIVAL CONTROL: a cheerful C-E-G sine chime before the line, like an airport announcement.
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const at = t0 + i * 0.075;
    const amp = voice.gain(0, mix.buses.ui);
    const end = pluck(amp.gain, at, 0.1, 0.004, 0.5);
    voice.osc('sine', freq, at, end, amp);
    const shimmer = voice.gain(0.22, amp);
    voice.osc('sine', freq * 2, at, end, shimmer);
  });
}

// Cough-cough: two noise bursts with a falling pitch and a thump each.
function cueEngineCough(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  for (const [offset, scale] of [[0, 1], [0.17, 0.7]] as const) {
    const at = t0 + offset;
    const amp = voice.gain(0, mix.buses.ui);
    const band = voice.filter('bandpass', 1100, 1.8, amp);
    sweep(band.frequency, at, 1100, 160, 0.22);
    const end = pluck(amp.gain, at, 0.36 * scale, 0.004, 0.24);
    voice.noise(mix.white, at, end, band);
    const thump = voice.gain(0, mix.buses.ui);
    const body = voice.osc('sine', 150, at, end, thump);
    sweep(body.frequency, at, 150, 55, 0.18);
    pluck(thump.gain, at, 0.3 * scale, 0.003, 0.2);
  }
}

// The ENGINE I/O FAULT (§5.1): something in the engine breaks. A hard low thud, a gritty band of
// noise chopped at 70 Hz and falling from bright to dark (metal grinding), and two detuned saws
// sagging under it. It ducks the rumble like a stamp, so it lands over a running burn.
function cueFaultCrunch(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const thud = voice.gain(0, out);
  const thudEnd = pluck(thud.gain, t0, 0.62, 0.002, 0.42);
  const body = voice.osc('sine', 95, t0, thudEnd, thud);
  sweep(body.frequency, t0, 95, 32, 0.3);
  const grit = voice.gain(0, out);
  const band = voice.filter('bandpass', 2600, 1.4, grit);
  sweep(band.frequency, t0, 2600, 380, 0.38);
  const chop = voice.gain(0.5, band);
  voice.osc('square', 70, t0, t0 + 0.5, voice.gain(0.5, chop.gain));
  const gritEnd = pluck(grit.gain, t0, 0.55, 0.003, 0.42);
  voice.noise(mix.white, t0, gritEnd, chop);
  const grind = voice.gain(0, out);
  const dark = voice.filter('lowpass', 1400, 1.2, grind);
  sweep(dark.frequency, t0, 1400, 260, 0.45);
  const grindEnd = pluck(grind.gain, t0 + 0.01, 0.16, 0.01, 0.5);
  for (const detune of [-25, 25]) {
    const saw = voice.osc('sawtooth', 118, t0, grindEnd, dark, detune);
    sweep(saw.frequency, t0, 118, 62, 0.45);
  }
}

// Two-tone siren, 660/440 Hz every 0.4 s: detuned squares through a 2 kHz lowpass, each note
// scooping up into pitch so it reads as an alarm, not a doorbell.
function cueKlaxon(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const notes = [660, 440, 660, 440];
  const noteSec = 0.4;
  const t1 = t0 + notes.length * noteSec;
  const out = claimAlarm(mix, 'klaxon', t1);
  if (!out) return;
  const tone = voice.filter('lowpass', 2000, 0.9, out);
  const amp = voice.gain(0, tone);
  const left = voice.osc('square', notes[0]!, t0, t1, amp, -6);
  const right = voice.osc('square', notes[0]!, t0, t1, amp, 6);
  notes.forEach((freq, i) => {
    const tn = t0 + i * noteSec;
    for (const osc of [left, right]) {
      osc.frequency.setValueAtTime(freq * 0.95, tn);
      osc.frequency.exponentialRampToValueAtTime(freq, tn + 0.04);
    }
    amp.gain.setValueAtTime(0, tn);
    amp.gain.linearRampToValueAtTime(0.13, tn + 0.015);
    amp.gain.setValueAtTime(0.13, tn + noteSec - 0.05);
    amp.gain.linearRampToValueAtTime(0, tn + noteSec - 0.01);
  });
}

// A clean 1 kHz blip; the burn's "go" is an octave up and rings longer.
function cueCountdownBeep(mix: Graph, t0: number, final: boolean): void {
  const voice = makeVoice(mix.ctx);
  const freq = final ? 2000 : 1000;
  const decay = final ? 0.34 : 0.085;
  const out = claimAlarm(mix, 'beep', t0 + decay + 0.02);
  if (!out) return;
  const amp = voice.gain(0, out);
  const end = pluck(amp.gain, t0, final ? 0.4 : 0.5, 0.002, decay);
  voice.osc('sine', freq, t0, end, amp);
  // A little triangle body, so the beep is not a test tone.
  const body = voice.gain(0.25, amp);
  voice.osc('triangle', freq, t0, end, body);
}

function cueLineWhoomp(mix: Graph, t0: number, shape: WhoompShape): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  if (shape === 'rise') {
    // Red → flyby: a resonant lowpass sweep up over a rising saw, plus a whoosh. "Whoomp."
    const lowpass = voice.filter('lowpass', 260, 4, out);
    sweep(lowpass.frequency, t0, 260, 2600, 0.42);
    const amp = voice.gain(0, lowpass);
    const end = swell(amp.gain, t0, 0.2, 0.06, 0.55);
    const saw = voice.osc('sawtooth', 80, t0, end, amp);
    sweep(saw.frequency, t0, 80, 420, 0.4);
    const sub = voice.osc('sine', 80, t0, end, amp);
    sweep(sub.frequency, t0, 80, 420, 0.4);
    const airAmp = voice.gain(0, out);
    const air = voice.filter('bandpass', 400, 1, airAmp);
    sweep(air.frequency, t0, 400, 3200, 0.45);
    swell(airAmp.gain, t0, 0.07, 0.12, 0.4);
    voice.noise(mix.white, t0, end, air);
    return;
  }
  if (shape === 'shimmer') {
    // → green: a bright D-major spread, each note a detuned pair, through a fast tremolo, with
    // two sparkles on top.
    const trem = voice.gain(0.8, out);
    voice.osc('sine', 8, t0, t0 + 1.6, voice.gain(0.2, trem.gain));
    [587.33, 739.99, 880, 1174.66].forEach((freq, i) => {
      const at = t0 + i * 0.03;
      const amp = voice.gain(0, trem);
      const end = swell(amp.gain, at, 0.07, 0.04, 1.2);
      voice.osc('sine', freq, at, end, amp, -5);
      voice.osc('sine', freq, at, end, amp, 5);
    });
    [[2349.3, 0.1], [3135.9, 0.19]].forEach(([freq, offset]) => {
      const amp = voice.gain(0, out);
      const end = pluck(amp.gain, t0 + offset!, 0.05, 0.003, 0.45);
      voice.osc('sine', freq!, t0 + offset!, end, amp);
    });
    return;
  }
  if (shape === 'fall') {
    // → red: a saw diving through a closing lowpass. Danger.
    const lowpass = voice.filter('lowpass', 1800, 2, out);
    sweep(lowpass.frequency, t0, 1800, 280, 0.5);
    const amp = voice.gain(0, lowpass);
    const end = swell(amp.gain, t0, 0.3, 0.02, 0.6);
    const saw = voice.osc('sawtooth', 520, t0, end, amp);
    sweep(saw.frequency, t0, 520, 90, 0.5);
    return;
  }
  if (shape === 'sag') {
    // A gentle "uh-oh": two notes falling a minor third.
    [[466.16, 0], [392, 0.17]].forEach(([freq, offset]) => {
      const at = t0 + offset!;
      const amp = voice.gain(0, out);
      const end = pluck(amp.gain, at, 0.15, 0.01, 0.32);
      voice.osc('triangle', freq!, at, end, amp);
      voice.osc('sine', freq! * 2, at, end, voice.gain(0.15, amp));
    });
    return;
  }
  // 'clear' (a repaired sensor, WP4): static narrowing into a clean tone.
  const hiss = voice.gain(0, out);
  const band = voice.filter('bandpass', 1320, 0.5, hiss);
  band.Q.setValueAtTime(0.5, t0);
  band.Q.exponentialRampToValueAtTime(14, t0 + 0.3);
  const hissEnd = swell(hiss.gain, t0, 0.12, 0.02, 0.32);
  voice.noise(mix.white, t0, hissEnd, band);
  const pure = voice.gain(0, out);
  const end = swell(pure.gain, t0 + 0.2, 0.08, 0.05, 0.6);
  voice.osc('sine', 1320, t0 + 0.2, end, pure);
}

// CAPTURED: an A-minor triad whose third slides up to C♯: tension, then relief.
function cueCapturedChord(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const tone = voice.filter('lowpass', 2600, 0.7, out);
  const amp = voice.gain(0, tone);
  const end = swell(amp.gain, t0, 1.4, 0.02, 1.7);
  const resolveAt = t0 + 0.3;
  const voices: [number, OscillatorType, number][] = [
    [110, 'sine', 0.09], [220, 'triangle', 0.09], [220, 'sine', 0.05], [329.63, 'triangle', 0.075],
  ];
  for (const [freq, type, level] of voices) voice.osc(type, freq, t0, end, voice.gain(level, amp));
  const third = voice.osc('triangle', 261.63, t0, end, voice.gain(0.085, amp));
  third.frequency.setValueAtTime(261.63, resolveAt);
  third.frequency.exponentialRampToValueAtTime(277.18, resolveAt + 0.05);
  const sparkle = voice.gain(0, out);
  const sparkleEnd = pluck(sparkle.gain, resolveAt, 0.07, 0.006, 0.8);
  voice.osc('sine', 1108.73, resolveAt, sparkleEnd, sparkle);
}

// ORBIT LOCKED: a C-E-G-B triangle arpeggio landing on a high C, over a soft C/G pad.
function cueLockArp(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const tone = voice.filter('lowpass', 5200, 0.7, out);
  [523.25, 659.25, 783.99, 987.77, 1046.5].forEach((freq, i) => {
    const at = t0 + i * 0.085;
    const amp = voice.gain(0, tone);
    const last = i === 4;
    const end = pluck(amp.gain, at, last ? 0.19 : 0.15, 0.006, last ? 1.6 : 0.9 + i * 0.1);
    voice.osc('triangle', freq, at, end, amp);
  });
  for (const freq of [261.63, 392]) {
    const amp = voice.gain(0, tone);
    const end = swell(amp.gain, t0, 0.08, 0.12, 1.9);
    voice.osc('sine', freq, t0, end, amp);
  }
}

// Every stamp: a short low thud plus a click. Heavy (the crash): deeper, longer, with a crunch.
function cueStampHit(mix: Graph, t0: number, heavy: boolean): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const thud = voice.gain(0, out);
  const end = pluck(thud.gain, t0, heavy ? 0.6 : 0.45, 0.002, heavy ? 0.6 : 0.26);
  const body = voice.osc('sine', heavy ? 120 : 165, t0, end, thud);
  sweep(body.frequency, t0, heavy ? 120 : 165, heavy ? 30 : 42, heavy ? 0.35 : 0.14);
  const click = voice.gain(0, out);
  const bright = voice.filter('highpass', 2200, 0.7, click);
  const clickEnd = pluck(click.gain, t0, 0.13, 0.0005, 0.012);
  voice.noise(mix.white, t0, clickEnd + 0.01, bright);
  if (heavy) {
    const crunch = voice.gain(0, out);
    const dark = voice.filter('lowpass', 900, 0.8, crunch);
    const crunchEnd = pluck(crunch.gain, t0, 0.34, 0.004, 0.55);
    voice.noise(mix.white, t0, crunchEnd, dark);
  }
}

// Kzzzt: a band of noise sweeping up (in) or down (out), chopped by a 55 Hz square so it buzzes
// like a bad cable, with a quiet saw following the sweep.
function cueJack(mix: Graph, t0: number, into: boolean): void {
  const voice = makeVoice(mix.ctx);
  const [from, to] = into ? [300, 3000] : [3000, 300];
  const amp = voice.gain(0, mix.buses.ui);
  // A 25 ms swell, not a spike: the band starts narrow at 300 Hz going in, and a spike there
  // would spend all its loudness where the band carries almost no energy.
  // Going in, the loud end of the sweep falls where the envelope is already decaying: a little
  // more level makes both directions sound equally loud.
  const end = swell(amp.gain, t0, into ? 1.5 : 0.9, 0.025, 0.2);
  const chop = voice.gain(0.5, amp);
  voice.osc('square', 55, t0, end, voice.gain(0.5, chop.gain));
  const band = voice.filter('bandpass', from, 1, chop);
  sweep(band.frequency, t0, from, to, 0.16);
  voice.noise(mix.white, t0, end, band);
  const saw = voice.osc('sawtooth', from / 2, t0, end, voice.gain(0.12, band));
  sweep(saw.frequency, t0, from / 2, to / 2, 0.16);
}

// A refused input: a short, low, beating square. Felt more than heard.
function cueBuzz(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const amp = voice.gain(0, mix.buses.ui);
  const tone = voice.filter('lowpass', 900, 1, amp);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(0.065, t0 + 0.003);
  amp.gain.setValueAtTime(0.065, t0 + 0.065);
  amp.gain.linearRampToValueAtTime(0, t0 + 0.08);
  voice.osc('square', 120, t0, t0 + 0.09, tone);
  voice.osc('square', 121.5, t0, t0 + 0.09, tone);
}

// Two sine partials (a fifth): something good arrived. Falling: two notes down, "get ready".
function cueChime(mix: Graph, t0: number, falling: boolean): void {
  const voice = makeVoice(mix.ctx);
  const partials: [number, number, number, number][] = falling
    ? [[1318.51, 0, 0.1, 0.45], [987.77, 0.13, 0.1, 0.55]]
    : [[1318.51, 0, 0.13, 0.75], [1975.53, 0, 0.07, 0.5]];
  for (const [freq, offset, peak, decay] of partials) {
    const at = t0 + offset;
    const amp = voice.gain(0, mix.buses.ui);
    const end = pluck(amp.gain, at, peak, 0.004, decay);
    voice.osc('sine', freq, at, end, amp);
    if (falling) voice.osc('sine', freq * 2, at, end, voice.gain(0.18, amp));
  }
}

// HOLD STEADY 3… 2… 1…: a rising G, A, B (the leading tone), so ORBIT LOCKED's C-major arpeggio
// lands as the resolution. A soft triangle with an octave shimmer and a little click on top.
const HOLD_TICK_NOTES: Readonly<Record<number, number>> = { 3: 392, 2: 440, 1: 493.88 };

function cueHoldTick(mix: Graph, t0: number, count: number): void {
  const freq = HOLD_TICK_NOTES[count];
  if (freq === undefined) throw new Error(`holdTick: no note for count ${count}`);
  const voice = makeVoice(mix.ctx);
  const out = voice.gain(1, mix.buses.ui);
  const tone = voice.filter('lowpass', 3200, 0.7, out);
  const amp = voice.gain(0, tone);
  const end = pluck(amp.gain, t0, 0.25, 0.005, 0.42);
  voice.osc('triangle', freq, t0, end, amp);
  voice.osc('sine', freq * 2, t0, end, voice.gain(0.22, amp));
  const click = voice.gain(0, out);
  const band = voice.filter('bandpass', 2600, 2, click);
  const clickEnd = pluck(click.gain, t0, 0.05, 0.0005, 0.01);
  voice.noise(mix.white, t0, clickEnd + 0.005, band);
}

// A soft tactile tick under every button press.
function cueUiClick(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const amp = voice.gain(0, mix.buses.ui);
  const band = voice.filter('bandpass', 1900, 1.2, amp);
  const end = pluck(amp.gain, t0, 0.32, 0.0007, 0.008);
  voice.noise(mix.white, t0, end + 0.005, band);
}

// A running op (§7.2 opChirp): one 8-bit blip from a pentatonic set, very quiet. Played about
// 12 times a second while ops run in blue, it reads as data moving, not as notes.
const CHIRP_NOTES = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093] as const;

function cueOpChirp(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const freq = CHIRP_NOTES[Math.floor(Math.random() * CHIRP_NOTES.length)]!;
  const amp = voice.gain(0, mix.buses.ui);
  const tone = voice.filter('lowpass', 3500, 0.7, amp);
  const end = pluck(amp.gain, t0, 0.05, 0.002, 0.03);
  voice.osc('square', freq, t0, end, tone);
}

// An op finished (§7.2 opDone): a two-tone ding up a fourth, square-ish like the chirps. A UI
// cue, so it sits under the chime and the payoffs.
function cueOpDone(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const notes: [number, number][] = [[1318.51, 0], [1760, 0.07]];
  for (const [freq, offset] of notes) {
    const at = t0 + offset;
    const amp = voice.gain(0, mix.buses.ui);
    const tone = voice.filter('lowpass', 4200, 0.7, amp);
    const end = pluck(amp.gain, at, 0.06, 0.003, 0.22);
    voice.osc('square', freq, at, end, voice.gain(0.5, tone));
    voice.osc('sine', freq, at, end, tone);
  }
}

// --- The Soul Archive (WP5) -----------------------------------------------------------------------

// The reveal's three lines, one sound each, so the moment builds before anything is read:
// 0 `0 pods detected`: a sonar ping that comes back empty (a falling pair, a hollow tail);
// 1 `rescanning…`: two quick pings sweeping up, searching;
// 2 `They're in here.`: the floor drops away (a sub swell, with a falling low tone an octave and a
//   half up so laptop and phone speakers, which play almost nothing under ~150 Hz, hear it fall
//   too) under one high glass note.
function cueRevealPing(mix: Graph, t0: number, step: number): void {
  const voice = makeVoice(mix.ctx);
  const out = voice.gain(1, mix.buses.ui);
  const tone = voice.filter('lowpass', 4200, 0.7, out);
  if (step === 0) {
    [[523.25, 0], [392, 0.22]].forEach(([freq, offset]) => {
      const at = t0 + offset!;
      const amp = voice.gain(0, tone);
      const end = pluck(amp.gain, at, offset === 0 ? 0.16 : 0.11, 0.006, 0.9);
      voice.osc('sine', freq!, at, end, amp);
      voice.osc('sine', freq! * 2.01, at, end, voice.gain(0.12, amp));
    });
    const hiss = voice.gain(0, out);
    const band = voice.filter('bandpass', 700, 3, hiss);
    const hissEnd = swell(hiss.gain, t0, 0.05, 0.3, 1.2);
    voice.noise(mix.white, t0, hissEnd, band);
    return;
  }
  if (step === 1) {
    [0, 0.42].forEach((offset) => {
      const at = t0 + offset;
      const amp = voice.gain(0, tone);
      const end = pluck(amp.gain, at, 0.12, 0.01, 0.55);
      const ping = voice.osc('sine', 620, at, end, amp);
      sweep(ping.frequency, at, 620, 1480, 0.28);
    });
    return;
  }
  if (step === 2) {
    duck(mix, t0);
    const sub = voice.gain(0, mix.buses.chord);
    const subEnd = swell(sub.gain, t0, 0.13, 0.6, 2.2);
    const body = voice.osc('sine', 62, t0, subEnd, sub);
    sweep(body.frequency, t0, 62, 41, 2.6);
    const drop = voice.gain(0, mix.buses.chord);
    const dropTone = voice.filter('lowpass', 700, 0.7, drop);
    const dropEnd = swell(drop.gain, t0, 0.08, 0.4, 2.0);
    const fall = voice.osc('triangle', 196, t0, dropEnd, dropTone);
    sweep(fall.frequency, t0, 196, 123.5, 2.4);
    const glass = voice.gain(0, tone);
    const glassEnd = pluck(glass.gain, t0 + 0.35, 0.11, 0.01, 2.4);
    voice.osc('sine', 1760, t0 + 0.35, glassEnd, glass);
    voice.osc('sine', 2637, t0 + 0.35, glassEnd, voice.gain(0.25, glass));
    return;
  }
  throw new Error(`revealPing: no step ${step}`);
}

// One slab chip cracking open: a dry high crack and a tiny glassy tink, quiet (twelve play 60 ms
// apart, a ripple across the rack).
function cueSoulCrack(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const out = voice.gain(1, mix.buses.ui);
  const crack = voice.gain(0, out);
  const bright = voice.filter('highpass', 2800, 0.8, crack);
  const crackEnd = pluck(crack.gain, t0, 0.5, 0.0008, 0.03);
  voice.noise(mix.white, t0, crackEnd + 0.005, bright);
  const tink = voice.gain(0, out);
  const end = pluck(tink.gain, t0, 0.12, 0.002, 0.25);
  voice.osc('sine', 2200 + Math.random() * 900, t0, end, tink);
}

// §7.2 revealChoir: four detuned saws through a 900 Hz lowpass, a 2 s swell, then a long fade. A
// major chord over an open fifth (A, E, A, C♯): not triumph, people.
function cueRevealChoir(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const tone = voice.filter('lowpass', 900, 0.9, out);
  const amp = voice.gain(0, tone);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(0.8, t0 + 2.0);
  amp.gain.setValueAtTime(0.8, t0 + 3.4);
  amp.gain.exponentialRampToValueAtTime(SILENT, t0 + 6.5);
  const end = t0 + 6.6;
  const voices: [number, number][] = [[110, -7], [164.81, 6], [220, -4], [277.18, 8]];
  for (const [freq, detune] of voices) {
    voice.osc('sawtooth', freq, t0, end, voice.gain(0.07, amp), detune);
    voice.osc('sawtooth', freq, t0, end, voice.gain(0.05, amp), -detune);
  }
}

// §7.2 heartbeat: a double thump (lub-dub), very quiet; `strength` 0..1 scales it. The 62→48 Hz
// thump is felt on headphones, but laptop and phone speakers play almost nothing under ~150 Hz, so
// each beat also has a short knock in their range (a triangle falling 200→130 Hz, whose overtones
// carry it) and a breath of muffled noise: on a kid's laptop the reveal's pulse and the WAKE
// REPORT's count are heard too (measured through a 150 Hz highpass: +15 dB).
function cueHeartbeat(mix: Graph, t0: number, strength: number): void {
  const voice = makeVoice(mix.ctx);
  const out = voice.gain(Math.max(0, Math.min(1, strength)), mix.buses.ambient);
  [[0, 0.18], [0.19, 0.12]].forEach(([offset, peak]) => {
    const at = t0 + offset!;
    const amp = voice.gain(0, out);
    const end = pluck(amp.gain, at, peak!, 0.008, 0.16);
    const body = voice.osc('sine', 62, at, end, amp);
    sweep(body.frequency, at, 62, 48, 0.12);
    const knock = voice.gain(0, out);
    const knockEnd = pluck(knock.gain, at, peak! * 1.6, 0.004, 0.09);
    const knockTone = voice.osc('triangle', 200, at, knockEnd, knock);
    sweep(knockTone.frequency, at, 200, 130, 0.07);
    const tap = voice.gain(0, out);
    const muffle = voice.filter('lowpass', 900, 0.8, tap);
    const tapEnd = pluck(tap.gain, at, peak! * 0.8, 0.002, 0.05);
    voice.noise(mix.white, at, tapEnd + 0.005, muffle);
  });
}

// §7.2 printBell: 880 Hz with a 1320 Hz partial and a 1.5 s decay, one per cluster that wakes.
// A cluster that wakes with missing memories rings a step lower and duller: still a bell, but
// you hear that something is missing.
function cuePrintBell(mix: Graph, t0: number, gaps: boolean): void {
  const voice = makeVoice(mix.ctx);
  const out = voice.gain(1, mix.buses.chord);
  const tone = voice.filter('lowpass', gaps ? 2200 : 6000, 0.7, out);
  const base = gaps ? 783.99 : 880;
  const amp = voice.gain(0, tone);
  const end = pluck(amp.gain, t0, 0.14, 0.004, 1.5);
  voice.osc('sine', base, t0, end, amp);
  voice.osc('sine', base * 1.5, t0, end, voice.gain(0.45, amp));
  voice.osc('sine', base * 2.76, t0, t0 + 0.4, voice.gain(0.12, amp));
}

// The cues played lately, newest last, with the continuous voices switching on (`hollowChew:on`):
// ?debug's __ap.audio.cues(), so a browser run can check what a moment sounded like. Kept short, and
// without the chatter (a tick per typed letter, the ops' 12 Hz chirps, the heartbeat bed), which
// would push a moment out of it in seconds.
const CUE_LOG_KEEP = 200;
const CUE_LOG_SKIPS: ReadonlySet<string> = new Set<Cue>(['typeTick', 'opChirp', 'heartbeat', 'uiClick', 'geiger']);
const cueLog: string[] = [];

function logCue(name: string): void {
  if (CUE_LOG_SKIPS.has(name)) return;
  cueLog.push(name);
  if (cueLog.length > CUE_LOG_KEEP) cueLog.splice(0, cueLog.length - CUE_LOG_KEEP);
}

export function recentCues(): readonly string[] {
  return cueLog;
}

// --- HOLLOW (WP6) ------------------------------------------------------------------------------------

// The bite (my addition to §7.2: the moment a file starts being eaten must be heard, like every
// critical fact): a dry crunch of noise snapping shut over a low thud, and a small detuned square
// stab a semitone apart, wrong like HOLLOW's typing. It ducks the rumble, so it lands over a burn.
function cueHollowBite(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  for (const [offset, peak] of [[0, 0.5], [0.09, 0.36]] as const) {
    const at = t0 + offset;
    const crunch = voice.gain(0, out);
    const dark = voice.filter('lowpass', 3200, 1.2, crunch);
    sweep(dark.frequency, at, 3200, 500, 0.08);
    const end = pluck(crunch.gain, at, peak, 0.002, 0.08);
    voice.noise(mix.white, at, end + 0.01, dark);
  }
  const thud = voice.gain(0, out);
  const thudEnd = pluck(thud.gain, t0, 0.42, 0.003, 0.26);
  const body = voice.osc('sine', 110, t0, thudEnd, thud);
  sweep(body.frequency, t0, 110, 42, 0.2);
  const stab = voice.gain(0, out);
  const tone = voice.filter('lowpass', 900, 1.4, stab);
  const stabEnd = pluck(stab.gain, t0 + 0.02, 0.07, 0.004, 0.32);
  voice.osc('square', 196, t0 + 0.02, stabEnd, tone);
  voice.osc('square', 207.65, t0 + 0.02, stabEnd, tone);
}

// §7.2 fizzle: a bite held by a WALL. A band of noise chopped at 55 Hz and falling, "fzzt", short
// and dry: the sound of something failing to get through.
function cueFizzle(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const amp = voice.gain(0, mix.buses.ui);
  const end = pluck(amp.gain, t0, 1.6, 0.004, 0.26);
  const chop = voice.gain(0.5, amp);
  voice.osc('square', 55, t0, end, voice.gain(0.5, chop.gain));
  const band = voice.filter('bandpass', 3400, 1.6, chop);
  sweep(band.frequency, t0, 3400, 1100, 0.24);
  voice.noise(mix.white, t0, end, band);
}

// §7.2 soulLost: a sine sweeping 880 → 220 Hz over a long fall, doubled a few cents flat so it
// wavers, and a soft low tone under it. Not a crash or a scream (PG): something going out.
function cueSoulLost(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const tone = voice.filter('lowpass', 2400, 0.7, out);
  const amp = voice.gain(0, tone);
  const end = swell(amp.gain, t0, 0.11, 0.03, 1.9);
  for (const detune of [0, -14]) {
    const fall = voice.osc('sine', 880, t0, end, amp, detune);
    sweep(fall.frequency, t0, 880, 220, 1.5);
  }
  const under = voice.gain(0, out);
  const underEnd = swell(under.gain, t0 + 0.2, 0.08, 0.3, 1.6);
  voice.osc('triangle', 110, t0 + 0.2, underEnd, under);
}

// §7.2 clusterSaved: two notes rising a fourth (E5 → A5, triangles with an octave shimmer), then the
// red "shatters into blue sparkles": a few high glassy pings scattered over half a second.
function cueClusterSaved(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const tone = voice.filter('lowpass', 7000, 0.7, out);
  [[659.25, 0, 0.21, 0.5], [880, 0.12, 0.24, 0.9]].forEach(([freq, offset, peak, decay]) => {
    const at = t0 + offset!;
    const amp = voice.gain(0, tone);
    const end = pluck(amp.gain, at, peak!, 0.006, decay!);
    voice.osc('triangle', freq!, at, end, amp);
    voice.osc('sine', freq! * 2, at, end, voice.gain(0.25, amp));
  });
  for (let i = 0; i < 5; i++) {
    const at = t0 + 0.2 + i * 0.09 + Math.random() * 0.04;
    const amp = voice.gain(0, tone);
    const end = pluck(amp.gain, at, 0.045, 0.002, 0.22);
    voice.osc('sine', 2400 + Math.random() * 1800, at, end, amp);
  }
}

// --- The run (WP7) ----------------------------------------------------------------------------------------

// §7.2 transmitSweep: a rising FM sweep, then the white-out. A sine carrier climbs from a low hum to a
// whistle over `seconds` while its modulator climbs with it and the index opens, so it starts as a clean
// tone and ends as a bright, tearing signal (the unit stretched across light-years); a band of noise
// rises under it. At the top: a burst of wide white noise and a low thump, the white-out heard.
function cueTransmitSweep(mix: Graph, t0: number, seconds: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const tone = voice.filter('lowpass', 6000, 0.7, out);
  const sweepEnd = t0 + seconds;
  const amp = voice.gain(0, tone);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(0.065, t0 + 0.25);
  amp.gain.setValueAtTime(0.065, sweepEnd - 0.15);
  amp.gain.exponentialRampToValueAtTime(SILENT, sweepEnd + 0.08);
  const carrier = voice.osc('sine', 160, t0, sweepEnd + 0.1, amp);
  sweep(carrier.frequency, t0, 160, 2600, seconds);
  // The modulator rides 1.5× the carrier, its depth opening from a shimmer to a tear.
  const depth = voice.gain(0, carrier.frequency);
  depth.gain.setValueAtTime(20, t0);
  depth.gain.exponentialRampToValueAtTime(2400, sweepEnd);
  const modulator = voice.osc('sine', 240, t0, sweepEnd + 0.1, depth);
  sweep(modulator.frequency, t0, 240, 3900, seconds);
  const hissAmp = voice.gain(0, out);
  const hissBand = voice.filter('bandpass', 400, 1.2, hissAmp);
  sweep(hissBand.frequency, t0, 400, 5200, seconds);
  hissAmp.gain.setValueAtTime(0, t0);
  hissAmp.gain.linearRampToValueAtTime(0.045, sweepEnd);
  hissAmp.gain.exponentialRampToValueAtTime(SILENT, sweepEnd + 0.1);
  voice.noise(mix.white, t0, sweepEnd + 0.12, hissBand);
  // The white-out: everything at once, then gone.
  const bloom = voice.gain(0, out);
  const bloomEnd = swell(bloom.gain, sweepEnd, 0.15, 0.03, 0.9);
  voice.noise(mix.white, sweepEnd, bloomEnd, voice.filter('highpass', 300, 0.5, bloom));
  const thump = voice.gain(0, out);
  const thumpEnd = pluck(thump.gain, sweepEnd, 0.3, 0.004, 0.6);
  const body = voice.osc('sine', 90, sweepEnd, thumpEnd, thump);
  sweep(body.frequency, sweepEnd, 90, 34, 0.5);
}

// A transit hit as the boot names it: a burst of bitcrushed static (a square-chopped noise band falling
// from bright to dark) over a short low knock. Data damaged in flight, not an explosion.
function cueTransitHit(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const out = voice.gain(1, mix.buses.ui);
  const crackle = voice.gain(0, out);
  const end = pluck(crackle.gain, t0, 1.3, 0.002, 0.22);
  const chop = voice.gain(0.5, crackle);
  voice.osc('square', 140, t0, end, voice.gain(0.5, chop.gain));
  const band = voice.filter('bandpass', 4200, 1.4, chop);
  sweep(band.frequency, t0, 4200, 900, 0.2);
  voice.noise(mix.white, t0, end, band);
  const knock = voice.gain(0, out);
  const knockEnd = pluck(knock.gain, t0, 0.8, 0.003, 0.16);
  const body = voice.osc('triangle', 180, t0, knockEnd, knock);
  sweep(body.frequency, t0, 180, 70, 0.14);
}

// HOLLOW's name decoding out of `???` (HALCYON): its own detuned square blips, the wrong little scale it
// types in, stepping DOWN to its lowest note while a band of static settles, the letters locking in. It
// plays over the reveal's truth note (the floor dropping away), the first turn's sound under the second's.
function cueNameGlitch(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const out = voice.gain(1, mix.buses.chord);
  const dark = voice.filter('lowpass', 900, 1.4, out);
  const steps = [HOLLOW_SCALE[6]!, HOLLOW_SCALE[4]!, HOLLOW_SCALE[3]!, HOLLOW_SCALE[1]!, HOLLOW_SCALE[0]! / 2];
  steps.forEach((note, i) => {
    const at = t0 + i * 0.14;
    const last = i === steps.length - 1;
    const amp = voice.gain(0, dark);
    const end = pluck(amp.gain, at, last ? 0.07 : 0.045, 0.003, last ? 1.1 : 0.12);
    voice.osc('square', note, at, end + 0.01, amp, -11);
    voice.osc('square', note, at, end + 0.01, amp, 11);
  });
  const staticAmp = voice.gain(0, out);
  const band = voice.filter('bandpass', 2600, 2, staticAmp);
  sweep(band.frequency, t0, 2600, 500, 0.7);
  const chop = voice.gain(0.5, band);
  voice.osc('square', 31, t0, t0 + 0.8, voice.gain(0.5, chop.gain));
  const staticEnd = swell(staticAmp.gain, t0, 0.02, 0.05, 0.7);
  voice.noise(mix.white, t0, staticEnd, chop);
}

// --- KESTREL (WP9) ---------------------------------------------------------------------------------------

// §7.2 debrisImpact: the cloud slams into a rack. A wide noise burst falling from bright to dark (the hull
// taking it), a 55 Hz thump with a pitch drop under it (felt more than heard), and a scatter of small hard
// ticks over the next half second: fragments rattling off. It plays with the 6 px shake and the `HIT · RACK C`
// stamp, and ducks the rumble like one, so on the chord bus (on the ui bus its own duck would dip it).
function cueDebrisImpact(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const burst = voice.gain(0, out);
  const dark = voice.filter('lowpass', 6500, 0.8, burst);
  sweep(dark.frequency, t0, 6500, 320, 0.55);
  const burstEnd = pluck(burst.gain, t0, 0.62, 0.003, 0.6);
  voice.noise(mix.white, t0, burstEnd, dark);
  const thump = voice.gain(0, out);
  const thumpEnd = pluck(thump.gain, t0, 0.75, 0.004, 0.7);
  const body = voice.osc('sine', 72, t0, thumpEnd, thump);
  sweep(body.frequency, t0, 72, 55, 0.12);
  body.frequency.exponentialRampToValueAtTime(34, t0 + 0.6);
  const rattle = voice.gain(1, out);
  const bright = voice.filter('highpass', 3000, 0.9, rattle);
  for (let i = 0; i < 7; i++) {
    const at = t0 + 0.08 + i * 0.07 + Math.random() * 0.05;
    const tick = voice.gain(0, bright);
    const end = pluck(tick.gain, at, 0.22 * (1 - i / 9), 0.0006, 0.02);
    voice.noise(mix.white, at, end + 0.005, tick);
  }
}

// §7.2 geiger: one tick of a counter's tube, a few ms of noise in a band around 2.4 kHz at a random level. Played as
// a sparse Poisson stream (audio-cues) on top of the belt's static, as emphasis. It used to BE the belt's sound: a
// 0.3 ms step to as loud as −14 dBFS of 1.8 kHz-and-up noise, up to 11 a second, the sharp click Fran found painful
// on headphones (post-handover). Now it rises over 2.5 ms, sits ~10 dB lower and has no top above ~4 kHz.
function cueGeiger(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const amp = voice.gain(0, mix.buses.ambient);
  const soft = voice.filter('lowpass', 4200, 0.6, amp);
  const band = voice.filter('bandpass', 2400 * vary(0.12), 0.9, soft);
  const end = swell(amp.gain, t0, 0.32 * vary(0.3), 0.0025, 0.008);
  voice.noise(mix.white, t0, end + 0.004, band);
}

// The belt's radiation interference (post-handover: the main belt sound, the geiger's ticks only ride on top). One short
// burst of static, white noise through a band that drifts down like a radio losing its station and flutters at ~20 Hz,
// faded in and out with no step at either end. audio-cues spaces the bursts out with silence between them (tuning.ts
// BELT_STATIC_GAP_*), so it is never a wash. depth (0 at a belt's edge, 1 midway) makes it a little louder and brighter.
function cueBeltStatic(mix: Graph, t0: number, depth: number): void {
  const voice = makeVoice(mix.ctx);
  const amp = voice.gain(0, mix.buses.ambient);
  const soft = voice.filter('lowpass', 3200 + 1400 * depth, 0.6, amp);
  const band = voice.filter('bandpass', 1400, 0.8, soft);
  const centre = (1100 + 400 * depth) * vary(0.2);
  const rise = 0.06;
  const hold = 0.08 + Math.random() * 0.12;
  const fall = 0.22;
  const end = t0 + rise + hold + fall;
  sweep(band.frequency, t0, centre * 1.3, centre * 0.75, rise + hold + fall);
  const peak = (0.13 + 0.08 * depth) * vary(0.15);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + rise);
  amp.gain.setValueAtTime(peak, t0 + rise + hold);
  amp.gain.linearRampToValueAtTime(0, end);
  // The flutter: the band's input wobbling between 40% and 100%, so it crackles like interference instead of hissing.
  const flutter = voice.gain(0.7, band);
  voice.osc('sine', 20 * vary(0.2), t0, end + 0.01, voice.gain(0.3, flutter.gain));
  voice.noise(mix.white, t0, end + 0.01, flutter);
}

// A seed's warning outline blinks (§6.6): one high blip in HOLLOW's own voice (detuned squares, its minor
// scale an octave up), so the blinking box is heard from anywhere, wrong and small.
function cueSeedWarn(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const amp = voice.gain(0, mix.buses.ui);
  const dark = voice.filter('lowpass', 1500, 1.4, amp);
  const end = pluck(amp.gain, t0, 0.11, 0.002, 0.11);
  const note = HOLLOW_SCALE[6]! * 2;
  voice.osc('square', note, t0, end + 0.01, dark, -14);
  voice.osc('square', note, t0, end + 0.01, dark, 14);
}

// A seed lands in a wall: a low, dull plop (two detuned squares dropping an octave through a dark filter) with
// a short crunch of static on top, HOLLOW arriving where there was free space.
function cueSeedDrop(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const out = voice.gain(1, mix.buses.ui);
  const dark = voice.filter('lowpass', 700, 1.6, out);
  const amp = voice.gain(0, dark);
  const end = pluck(amp.gain, t0, 0.32, 0.003, 0.3);
  for (const detune of [-12, 12]) {
    const drop = voice.osc('square', HOLLOW_SCALE[3]!, t0, end + 0.01, amp, detune);
    sweep(drop.frequency, t0, HOLLOW_SCALE[3]!, HOLLOW_SCALE[3]! / 2, 0.2);
  }
  const crunch = voice.gain(0, out);
  const band = voice.filter('bandpass', 2200, 1.3, crunch);
  sweep(band.frequency, t0, 2200, 700, 0.12);
  const crunchEnd = pluck(crunch.gain, t0, 0.3, 0.002, 0.1);
  voice.noise(mix.white, t0, crunchEnd + 0.01, band);
}

// The engine lights with nobody on the throttle (C2, §5.3 moment 11): a relay clacking twice (the controller
// misfiring), then the ignition's dull whump: a falling sub thump under a burst of dark noise, like the rumble
// catching for a moment. The rumble itself follows the burst's thrust (setEngineLevel); at a failing controller's
// strength (GHOST_BY_BAND, 30%) it is low, and a burst at CRUISE lasts under half a second, so this is what says "the
// engine just fired". The ship's first burst
// is heavier and ducks the mix, so it lands under the klaxon.
function cueGhostIgnite(mix: Graph, t0: number, first: boolean): void {
  const voice = makeVoice(mix.ctx);
  if (first) duck(mix, t0);
  const scale = first ? 1 : 0.6;
  const out = voice.gain(1, first ? mix.buses.chord : mix.buses.ui);
  const relay = voice.gain(1, out);
  const bright = voice.filter('bandpass', 3800, 2.2, relay);
  for (const offset of [0, 0.045]) {
    const click = voice.gain(0, bright);
    const end = pluck(click.gain, t0 + offset, 0.32 * scale, 0.0008, 0.018);
    voice.noise(mix.white, t0 + offset, end + 0.004, click);
  }
  const lit = t0 + 0.07;
  const whump = voice.gain(0, out);
  const dark = voice.filter('lowpass', 900, 0.9, whump);
  sweep(dark.frequency, lit, 900, 160, 0.35);
  const whumpEnd = pluck(whump.gain, lit, 0.5 * scale, 0.012, 0.38);
  voice.noise(mix.brown, lit, whumpEnd + 0.01, dark);
  const thump = voice.gain(0, out);
  const thumpEnd = pluck(thump.gain, lit, 0.55 * scale, 0.004, 0.32);
  const body = voice.osc('sine', 64, lit, thumpEnd + 0.01, thump);
  sweep(body.frequency, lit, 64, 38, 0.3);
}

// THE DEAL's clock (§5.3 moment 12): a dry tock in HOLLOW's voice (two detuned squares through a dark filter) for every
// second it has left, so the 15 s are heard from either screen. In its last seconds the tock climbs a fifth and a
// faint high blip rides on it: a clock that is about to stop.
function cueDealTick(mix: Graph, t0: number, urgent: boolean): void {
  const voice = makeVoice(mix.ctx);
  const amp = voice.gain(0, mix.buses.ui);
  const dark = voice.filter('lowpass', urgent ? 1400 : 700, 1.8, amp);
  const end = pluck(amp.gain, t0, urgent ? 0.26 : 0.2, 0.002, urgent ? 0.09 : 0.07);
  const note = urgent ? HOLLOW_SCALE[4]! : HOLLOW_SCALE[0]!;
  for (const detune of [-10, 10]) voice.osc('square', note, t0, end + 0.01, dark, detune);
  if (!urgent) return;
  const blip = voice.gain(0, mix.buses.ui);
  const blipEnd = pluck(blip.gain, t0 + 0.01, 0.05, 0.001, 0.05);
  voice.osc('sine', HOLLOW_SCALE[4]! * 4, t0 + 0.01, blipEnd + 0.01, blip);
}

// --- LAST LIGHT (WP11 part 2) ---------------------------------------------------------------------------------

// A verb's telegraph, one whole second (§6.6: `> rm repair.bak ... 3`): a command clock in HOLLOW's voice, two detuned
// squares a step higher each second as it runs out (3, 2, 1), with a dry key-click on top (someone is typing your
// commands). Its last second carries a high blip: block it now.
function cueVerbTick(mix: Graph, t0: number, count: number): void {
  const voice = makeVoice(mix.ctx);
  const amp = voice.gain(0, mix.buses.ui);
  const dark = voice.filter('lowpass', count <= 1 ? 1800 : 1100, 1.6, amp);
  const end = pluck(amp.gain, t0, count <= 1 ? 0.3 : 0.24, 0.002, 0.1);
  const step = count >= 3 ? 2 : count === 2 ? 4 : 6;
  const note = HOLLOW_SCALE[step]!;
  for (const detune of [-12, 12]) voice.osc('square', note, t0, end + 0.01, dark, detune);
  const key = voice.gain(0, mix.buses.ui);
  const band = voice.filter('bandpass', 3200, 1.4, key);
  const keyEnd = pluck(key.gain, t0, 0.35, 0.0006, 0.012);
  voice.noise(mix.white, t0, keyEnd + 0.004, band);
  if (count > 1) return;
  const blip = voice.gain(0, mix.buses.ui);
  const blipEnd = pluck(blip.gain, t0 + 0.012, 0.06, 0.001, 0.07);
  voice.osc('sine', note * 4, t0 + 0.012, blipEnd + 0.01, blip);
}

// BLOCKED (§5.3 moment 13): HOLLOW's command bouncing off your tool, a buzzy "denied" falling in its own voice, then
// your small win, two clean notes rising a fifth. Short: the duel keeps going.
function cueVerbBlocked(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const denied = voice.gain(0, out);
  const band = voice.filter('bandpass', 1400, 2.2, denied);
  const deniedEnd = pluck(denied.gain, t0, 0.22, 0.002, 0.16);
  for (const detune of [-18, 18]) {
    const fall = voice.osc('square', HOLLOW_SCALE[4]! * 2, t0, deniedEnd + 0.01, band, detune);
    sweep(fall.frequency, t0, HOLLOW_SCALE[4]! * 2, HOLLOW_SCALE[0]!, 0.14);
  }
  const bright = voice.filter('lowpass', 7000, 0.7, out);
  [[987.77, 0.12, 0.17, 0.32], [1479.98, 0.21, 0.2, 0.6]].forEach(([freq, offset, peak, decay]) => {
    const at = t0 + offset!;
    const amp = voice.gain(0, bright);
    const end = pluck(amp.gain, at, peak!, 0.004, decay!);
    voice.osc('triangle', freq!, at, end, amp);
    voice.osc('sine', freq! * 2, at, end, voice.gain(0.2, amp));
  });
}

// A verb landed: your own tool used on you. A bit-crushed crunch (noise through a falling dark filter, a saw dropping
// two octaves through a staircase shaper: digital teeth) and a hard thud. It ducks the mix: something of yours just went.
function cueVerbLanded(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const crush = mix.ctx.createWaveShaper();
  crush.curve = crushCurve(4);
  crush.connect(out);
  const sawAmp = voice.gain(0, crush);
  const sawEnd = pluck(sawAmp.gain, t0, 0.32, 0.004, 0.42);
  const saw = voice.osc('sawtooth', 440, t0, sawEnd + 0.01, voice.filter('lowpass', 1600, 1.2, sawAmp));
  sweep(saw.frequency, t0, 440, 110, 0.38);
  const noise = voice.gain(0, out);
  const dark = voice.filter('lowpass', 5200, 1.1, noise);
  sweep(dark.frequency, t0, 5200, 300, 0.3);
  const noiseEnd = pluck(noise.gain, t0, 0.42, 0.002, 0.26);
  voice.noise(mix.white, t0, noiseEnd + 0.01, dark);
  const thud = voice.gain(0, out);
  const thudEnd = pluck(thud.gain, t0, 0.5, 0.003, 0.24);
  const body = voice.osc('sine', 120, t0, thudEnd + 0.01, thud);
  sweep(body.frequency, t0, 120, 40, 0.2);
  // The shaper is not a Voice node: it goes with the last source.
  saw.addEventListener('ended', () => crush.disconnect());
}

// ORBIT LOCK opens the root: two heavy clunks of something unlocking, then a low swell underneath (it is awake and
// it is open).
function cueRootOpen(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  for (const offset of [0, 0.2]) {
    const at = t0 + offset;
    const clunk = voice.gain(0, out);
    const end = pluck(clunk.gain, at, 0.5, 0.002, 0.2);
    const body = voice.osc('sine', 88, at, end + 0.01, clunk);
    sweep(body.frequency, at, 88, 44, 0.16);
    const click = voice.gain(0, out);
    const bright = voice.filter('bandpass', 2600, 1.8, click);
    const clickEnd = pluck(click.gain, at, 0.4, 0.0006, 0.03);
    voice.noise(mix.white, at, clickEnd + 0.005, bright);
  }
  const swellAmp = voice.gain(0, voice.filter('lowpass', 420, 0.9, out));
  const swellEnd = swell(swellAmp.gain, t0 + 0.3, 0.16, 1.1, 1.8);
  for (const detune of [-16, 16]) voice.osc('sawtooth', 55, t0 + 0.3, swellEnd, swellAmp, detune);
  voice.osc('sawtooth', 82.41, t0 + 0.3, swellEnd, voice.gain(0.5, swellAmp), 9);
}

// One of the duel's spikes (§9 WP11: the DELETE duel runs with glitch spikes): a short zap of static whose pitch climbs
// with the root's DELETE (progress 0..1), with a tiny wrong blip in HOLLOW's voice. Many of them: small and dry.
function cueDuelSpike(mix: Graph, t0: number, progress: number): void {
  const voice = makeVoice(mix.ctx);
  const clamped = Math.max(0, Math.min(1, progress));
  const amp = voice.gain(0, mix.buses.ui);
  const band = voice.filter('bandpass', 1200 + 3000 * clamped, 2.4, amp);
  const end = pluck(amp.gain, t0, 0.45 + 0.35 * clamped, 0.001, 0.07);
  voice.noise(mix.white, t0, end + 0.005, band);
  const blip = voice.gain(0, voice.filter('lowpass', 1200, 1.4, mix.buses.ui));
  const blipEnd = pluck(blip.gain, t0, 0.06 + 0.06 * clamped, 0.002, 0.05);
  const note = HOLLOW_SCALE[Math.floor(clamped * (HOLLOW_SCALE.length - 1))]! * 2;
  for (const detune of [-20, 20]) voice.osc('square', note, t0, blipEnd + 0.01, blip, detune);
}

// The root's DELETE completes: the largest thing in the game going out. Static collapsing (white noise through a
// filter falling from 8 kHz to almost nothing), a deep thud, and HOLLOW's two detuned squares sinking an octave as
// they fade. Then quiet, for the choice.
function cueRootDeleted(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const hiss = voice.gain(0, out);
  const fall = voice.filter('lowpass', 8000, 0.9, hiss);
  sweep(fall.frequency, t0, 8000, 160, 1.0);
  const hissEnd = swell(hiss.gain, t0, 0.42, 0.02, 1.1);
  voice.noise(mix.white, t0, hissEnd, fall);
  const thud = voice.gain(0, out);
  const thudEnd = pluck(thud.gain, t0, 0.62, 0.004, 0.55);
  const body = voice.osc('sine', 96, t0, thudEnd + 0.01, thud);
  sweep(body.frequency, t0, 96, 28, 0.5);
  const sink = voice.gain(0, voice.filter('lowpass', 900, 1.2, out));
  const sinkEnd = swell(sink.gain, t0 + 0.05, 0.12, 0.05, 1.6);
  for (const detune of [-14, 14]) {
    const tone = voice.osc('square', HOLLOW_SCALE[3]!, t0 + 0.05, sinkEnd, sink, detune);
    sweep(tone.frequency, t0 + 0.05, HOLLOW_SCALE[3]!, HOLLOW_SCALE[3]! / 2, 1.2);
  }
}

// Under the choice card: a quiet suspended chord (A, D, E: neither sad nor happy, waiting to be resolved) and, far
// under it, one of HOLLOW's notes. It fades on its own; the choice's own sound resolves it.
function cueFinaleHold(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const out = voice.gain(1, mix.buses.chord);
  const tone = voice.filter('lowpass', 1600, 0.7, out);
  const amp = voice.gain(0, tone);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(0.5, t0 + 1.6);
  amp.gain.setValueAtTime(0.5, t0 + 4.5);
  amp.gain.exponentialRampToValueAtTime(SILENT, t0 + 9);
  const end = t0 + 9.1;
  for (const [freq, level] of [[220, 0.09], [293.66, 0.07], [329.63, 0.07], [440, 0.03]] as const) {
    voice.osc('sine', freq, t0, end, voice.gain(level, amp), 3);
    voice.osc('triangle', freq, t0, end, voice.gain(level * 0.4, amp), -4);
  }
  const under = voice.gain(0, voice.filter('lowpass', 500, 1.3, out));
  const underEnd = swell(under.gain, t0 + 0.4, 0.035, 1.2, 5);
  for (const detune of [-12, 12]) voice.osc('square', HOLLOW_SCALE[0]! / 2, t0 + 0.4, underEnd, under, detune);
}

// PURGE: clean and a little cold. One pure high note struck once with a glassy fifth above it and a long fall, a dry
// click (the rm), and nothing else: no chord, nobody singing back.
function cuePurgeTone(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const click = voice.gain(0, out);
  const bright = voice.filter('highpass', 2400, 0.8, click);
  const clickEnd = pluck(click.gain, t0, 0.5, 0.0005, 0.02);
  voice.noise(mix.white, t0, clickEnd + 0.004, bright);
  const bell = voice.gain(0, out);
  const bellEnd = pluck(bell.gain, t0 + 0.05, 0.16, 0.003, 4.2);
  voice.osc('sine', 1318.51, t0 + 0.05, bellEnd, bell);
  voice.osc('sine', 1975.53, t0 + 0.05, t0 + 1.6, voice.gain(0.22, bell));
  voice.osc('sine', 3637.5, t0 + 0.05, t0 + 0.5, voice.gain(0.06, bell));
  const low = voice.gain(0, out);
  const lowEnd = swell(low.gain, t0 + 0.05, 0.06, 0.02, 2.5);
  voice.osc('sine', 110, t0 + 0.05, lowEnd, low);
}

// MERGE: two voices becoming one. HOLLOW's detuned minor (A, C) and the unit's clean tones start apart (wide detune,
// a little off pitch) and glide together into a warm A major with its ninth, the filter opening as they meet; a few of
// HOLLOW's blips at the start, then only the chord. It costs something and it is warm: longer than PURGE, and louder.
function cueMergeChord(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  duck(mix, t0);
  const out = voice.gain(1, mix.buses.chord);
  const tone = voice.filter('lowpass', 600, 0.8, out);
  sweep(tone.frequency, t0, 600, 2600, 2.4);
  const amp = voice.gain(0, tone);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(0.75, t0 + 1.4);
  amp.gain.setValueAtTime(0.75, t0 + 3.2);
  amp.gain.exponentialRampToValueAtTime(SILENT, t0 + 7.5);
  const end = t0 + 7.6;
  // [start Hz, target Hz]: HOLLOW's minor third (C) bends up into the major third (C♯); the rest come in a little off.
  const voices: [number, number][] = [[218, 220], [261.63, 277.18], [327, 329.63], [446, 440], [490, 493.88]];
  voices.forEach(([from, to], i) => {
    for (const side of [-1, 1]) {
      const osc = voice.osc('sawtooth', from, t0, end, voice.gain(i === 0 ? 0.06 : 0.045, amp), side * 38);
      osc.frequency.exponentialRampToValueAtTime(to, t0 + 2.2);
      osc.detune.setValueAtTime(side * 38, t0);
      osc.detune.linearRampToValueAtTime(side * 3, t0 + 2.4);
    }
  });
  for (let i = 0; i < 4; i++) {
    const at = t0 + i * 0.16;
    const blip = voice.gain(0, voice.filter('lowpass', 900, 1.4, out));
    const blipEnd = pluck(blip.gain, at, 0.08 * (1 - i * 0.2), 0.002, 0.12);
    for (const detune of [-10, 10]) voice.osc('square', HOLLOW_SCALE[(i * 2) % HOLLOW_SCALE.length]!, at, blipEnd + 0.01, blip, detune);
  }
}

export function play<C extends Cue>(cue: C, ...args: CueArgs<C>): void {
  const mix = graph;
  if (!mix) return;
  logCue(cue);
  if (muted) return;
  const [params, opts] = args as [CueParams[Cue] | undefined, PlayOpts | undefined];
  playOn(mix, cue, params, mix.ctx.currentTime + LOOKAHEAD_SEC + (opts?.delaySec ?? 0));
}

function playOn(mix: Graph, cue: Cue, params: CueParams[Cue] | undefined, t0: number): void {
  switch (cue) {
    case 'transmitIn': cueTransmitIn(mix, t0); return;
    case 'typeTick': cueTypeTick(mix, t0, (params as CueParams['typeTick']).voice); return;
    case 'engineCough': cueEngineCough(mix, t0); return;
    case 'faultCrunch': cueFaultCrunch(mix, t0); return;
    case 'klaxon': cueKlaxon(mix, t0); return;
    case 'countdownBeep': cueCountdownBeep(mix, t0, (params as CueParams['countdownBeep']).final); return;
    case 'lineWhoomp': cueLineWhoomp(mix, t0, (params as CueParams['lineWhoomp']).shape); return;
    case 'capturedChord': cueCapturedChord(mix, t0); return;
    case 'lockArp': cueLockArp(mix, t0); return;
    case 'stampHit': cueStampHit(mix, t0, (params as CueParams['stampHit']).heavy); return;
    case 'jackIn': cueJack(mix, t0, true); return;
    case 'jackOut': cueJack(mix, t0, false); return;
    case 'buzz': cueBuzz(mix, t0); return;
    case 'chime': cueChime(mix, t0, (params as CueParams['chime']).falling); return;
    case 'uiClick': cueUiClick(mix, t0); return;
    case 'holdTick': cueHoldTick(mix, t0, (params as CueParams['holdTick']).count); return;
    case 'opChirp': cueOpChirp(mix, t0); return;
    case 'opDone': cueOpDone(mix, t0); return;
    case 'revealPing': cueRevealPing(mix, t0, (params as CueParams['revealPing']).step); return;
    case 'soulCrack': cueSoulCrack(mix, t0); return;
    case 'revealChoir': cueRevealChoir(mix, t0); return;
    case 'heartbeat': cueHeartbeat(mix, t0, (params as CueParams['heartbeat']).strength); return;
    case 'printBell': cuePrintBell(mix, t0, (params as CueParams['printBell']).gaps); return;
    case 'hollowBite': cueHollowBite(mix, t0); return;
    case 'fizzle': cueFizzle(mix, t0); return;
    case 'soulLost': cueSoulLost(mix, t0); return;
    case 'clusterSaved': cueClusterSaved(mix, t0); return;
    case 'transmitSweep': cueTransmitSweep(mix, t0, (params as CueParams['transmitSweep']).seconds); return;
    case 'transitHit': cueTransitHit(mix, t0); return;
    case 'nameGlitch': cueNameGlitch(mix, t0); return;
    case 'debrisImpact': cueDebrisImpact(mix, t0); return;
    case 'geiger': cueGeiger(mix, t0); return;
    case 'beltStatic': cueBeltStatic(mix, t0, (params as CueParams['beltStatic']).depth); return;
    case 'seedWarn': cueSeedWarn(mix, t0); return;
    case 'seedDrop': cueSeedDrop(mix, t0); return;
    case 'ghostIgnite': cueGhostIgnite(mix, t0, (params as CueParams['ghostIgnite']).first); return;
    case 'dealTick': cueDealTick(mix, t0, (params as CueParams['dealTick']).urgent); return;
    case 'verbTick': cueVerbTick(mix, t0, (params as CueParams['verbTick']).count); return;
    case 'verbBlocked': cueVerbBlocked(mix, t0); return;
    case 'verbLanded': cueVerbLanded(mix, t0); return;
    case 'rootOpen': cueRootOpen(mix, t0); return;
    case 'duelSpike': cueDuelSpike(mix, t0, (params as CueParams['duelSpike']).progress); return;
    case 'rootDeleted': cueRootDeleted(mix, t0); return;
    case 'finaleHold': cueFinaleHold(mix, t0); return;
    case 'purgeTone': cuePurgeTone(mix, t0); return;
    case 'mergeChord': cueMergeChord(mix, t0); return;
    default: throw new Error(`play: unknown cue '${String(cue)}'`);
  }
}

// --- Continuous voices ----------------------------------------------------------------------------

// The engine: brown noise through a lowpass that opens with the level (120 → 900 Hz), a
// band-passed growl so small speakers hear it too, and a 40 Hz sub. Jitter (a damaged engine)
// drives two unsteady LFOs into the gain, so the rumble sputters.
interface EngineVoice {
  out: GainNode;
  lowpass: BiquadFilterNode;
  jitterDepth: GainNode;
  level: number;
  jitter: number;
}

const RUMBLE_GAIN = 0.19;
const RUMBLE_FLOOR = 0.35;      // a 40% engine is thinner, but still clearly an engine
const RUMBLE_CUTOFF_MIN = 120;
const RUMBLE_CUTOFF_SPAN = 780;

function buildEngineVoice(ctx: BaseAudioContext, bus: GainNode, brown: AudioBuffer): EngineVoice {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(bus);

  const noise = ctx.createBufferSource();
  noise.buffer = brown;
  noise.loop = true;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = RUMBLE_CUTOFF_MIN;
  lowpass.Q.value = 0.8;
  noise.connect(lowpass);
  lowpass.connect(out);

  const growlBand = ctx.createBiquadFilter();
  growlBand.type = 'bandpass';
  growlBand.frequency.value = 240;
  growlBand.Q.value = 1.1;
  const growl = ctx.createGain();
  growl.gain.value = 0.7;
  noise.connect(growlBand);
  growlBand.connect(growl);
  growl.connect(out);

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 40;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.42;
  sub.connect(subGain);
  subGain.connect(out);

  const jitterDepth = ctx.createGain();
  jitterDepth.gain.value = 0;
  jitterDepth.connect(out.gain);
  for (const [type, freq] of [['sine', 7.3], ['triangle', 11.9]] as const) {
    const lfo = ctx.createOscillator();
    lfo.type = type;
    lfo.frequency.value = freq;
    lfo.connect(jitterDepth);
    lfo.start();
  }
  noise.start();
  sub.start();
  return { out, lowpass, jitterDepth, level: 0, jitter: 0 };
}

// A thump and a puff when the engine lights: the burn starts with a kick, not a fade-in.
function ignition(mix: Graph, t0: number): void {
  const voice = makeVoice(mix.ctx);
  const thump = voice.gain(0, mix.buses.ambient);
  const end = pluck(thump.gain, t0, 0.32, 0.004, 0.3);
  const body = voice.osc('sine', 95, t0, end, thump);
  sweep(body.frequency, t0, 95, 40, 0.2);
  const puff = voice.gain(0, mix.buses.ambient);
  const dark = voice.filter('lowpass', 700, 0.7, puff);
  const puffEnd = pluck(puff.gain, t0, 0.14, 0.01, 0.25);
  voice.noise(mix.brown, t0, puffEnd, dark);
}

// level: delivered thrust as a fraction of nominal (0 = silent). jitter: the sputter amplitude
// (0 clean … 0.35 failing). Call every tick; nothing is rescheduled unless a value moved.
export function setEngineLevel(level: number, jitter: number): void {
  if (graph) applyEngineLevel(graph, level, jitter);
}

function applyEngineLevel(mix: Graph, level: number, jitter: number): void {
  const { engine } = mix;
  const clamped = Math.max(0, Math.min(1, level));
  const sputter = Math.max(0, jitter);
  const settled = (clamped === 0) === (engine.level === 0) && Math.abs(clamped - engine.level) < 0.005;
  if (settled && sputter === engine.jitter) return;
  const now = mix.ctx.currentTime;
  const starting = engine.level === 0 && clamped > 0;
  const rising = clamped > engine.level;
  engine.level = clamped;
  engine.jitter = sputter;
  const target = clamped > 0 ? RUMBLE_GAIN * (RUMBLE_FLOOR + (1 - RUMBLE_FLOOR) * clamped) : 0;
  engine.out.gain.setTargetAtTime(target, now, rising ? 0.03 : 0.12);
  engine.lowpass.frequency.setTargetAtTime(RUMBLE_CUTOFF_MIN + RUMBLE_CUTOFF_SPAN * clamped, now, 0.08);
  engine.jitterDepth.gain.setTargetAtTime(target * sputter * 0.8, now, 0.05);
  if (starting && !muted) ignition(mix, now + LOOKAHEAD_SEC);
}

// The lock tone: a sine (with a quiet octave) gliding 220 → 660 Hz as the loop turns green.
interface LockVoice {
  out: GainNode;
  low: OscillatorNode;
  high: OscillatorNode;
  on: boolean;
}

const LOCK_GAIN = 0.055;
const LOCK_BASE_HZ = 220;
const LOCK_SPAN_RATIO = 3;   // 220 → 660 Hz

function buildLockVoice(ctx: BaseAudioContext, bus: GainNode): LockVoice {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(bus);
  const low = ctx.createOscillator();
  low.type = 'sine';
  low.frequency.value = LOCK_BASE_HZ;
  low.connect(out);
  const high = ctx.createOscillator();
  high.type = 'sine';
  high.frequency.value = LOCK_BASE_HZ * 2;
  const highGain = ctx.createGain();
  highGain.gain.value = 0.35;
  high.connect(highGain);
  highGain.connect(out);
  // A slow vibrato, so a held tone sounds alive.
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.5;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.value = 4;   // cents
  vibrato.connect(vibratoDepth);
  vibratoDepth.connect(low.detune);
  vibratoDepth.connect(high.detune);
  low.start();
  high.start();
  vibrato.start();
  return { out, low, high, on: false };
}

// fraction: the green share of the loop (0..1), or null for silence.
export function setLockTone(fraction: number | null): void {
  if (graph) applyLockTone(graph, fraction);
}

function applyLockTone(mix: Graph, fraction: number | null): void {
  const { lock } = mix;
  const now = mix.ctx.currentTime;
  if (fraction === null) {
    if (lock.on) lock.out.gain.setTargetAtTime(0, now, 0.12);
    lock.on = false;
    return;
  }
  const freq = LOCK_BASE_HZ * Math.pow(LOCK_SPAN_RATIO, Math.max(0, Math.min(1, fraction)));
  lock.low.frequency.setTargetAtTime(freq, now, 0.08);
  lock.high.frequency.setTargetAtTime(freq * 2, now, 0.08);
  if (!lock.on) lock.out.gain.setTargetAtTime(LOCK_GAIN, now, 0.06);
  lock.on = true;
}

// HOLLOW's chew (§7.2 hollowChew): two low saws a fifth apart, bit-crushed (a staircase waveshaper
// takes them down to a handful of levels: digital teeth), through a dark lowpass, chopped at 7 Hz by a
// decaying ramp (bite, release, bite) with a crunch of noise on each chew. Its loudness and
// brightness follow the total drain (level 0..1): a burn makes it chew harder (P1).
interface ChewVoice {
  out: GainNode;
  lowpass: BiquadFilterNode;
  level: number;
}

const CHEW_GAIN = 0.16;
const CHEW_FLOOR = 0.4;          // one file chewed at rest is quiet but there
const CHEW_CUTOFF_MIN = 520;
const CHEW_CUTOFF_SPAN = 900;
const CHEW_RATE_HZ = 7;          // §7.2: AM at 7 Hz
const CHEW_CRUSH_LEVELS = 5;

function crushCurve(levels: number): Float32Array<ArrayBuffer> {
  const size = 1024;
  const curve = new Float32Array(new ArrayBuffer(size * 4));
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

function buildChewVoice(ctx: BaseAudioContext, bus: GainNode, white: AudioBuffer): ChewVoice {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(bus);
  // The chewing: a gate swung by a falling ramp (saw inverted), softened so each chew starts with a
  // bite, not a click.
  const gate = ctx.createGain();
  gate.gain.value = 0.5;
  gate.connect(out);
  const lfo = ctx.createOscillator();
  lfo.type = 'sawtooth';
  lfo.frequency.value = CHEW_RATE_HZ;
  const invert = ctx.createGain();
  invert.gain.value = -0.5;
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 45;
  lfo.connect(invert);
  invert.connect(soften);
  soften.connect(gate.gain);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = CHEW_CUTOFF_MIN;
  lowpass.Q.value = 1.6;
  lowpass.connect(gate);
  const crush = ctx.createWaveShaper();
  crush.curve = crushCurve(CHEW_CRUSH_LEVELS);
  crush.connect(lowpass);
  const sources: AudioScheduledSourceNode[] = [lfo];
  for (const [freq, level] of [[61.74, 0.5], [92.5, 0.32]] as const) {
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = freq;
    const amp = ctx.createGain();
    amp.gain.value = level;
    saw.connect(amp);
    amp.connect(crush);
    sources.push(saw);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = white;
  noise.loop = true;
  const grit = ctx.createBiquadFilter();
  grit.type = 'bandpass';
  grit.frequency.value = 1500;
  grit.Q.value = 2.2;
  const gritGain = ctx.createGain();
  gritGain.gain.value = 0.28;
  noise.connect(grit);
  grit.connect(gritGain);
  gritGain.connect(gate);
  sources.push(noise);
  sources.forEach((source) => source.start());
  return { out, lowpass, level: 0 };
}

// level: HOLLOW's total drain as a share of CHEW_FULL_DRAIN (0 = silent). Call every tick; nothing
// is rescheduled unless it moved.
export function setChewLevel(level: number): void {
  if (graph) applyChewLevel(graph, level);
}

function applyChewLevel(mix: Graph, level: number): void {
  const { chew } = mix;
  const clamped = Math.max(0, Math.min(1, level));
  if (Math.abs(clamped - chew.level) < 0.005 && (clamped === 0) === (chew.level === 0)) return;
  if (chew.level === 0 && clamped > 0) logCue('hollowChew:on');
  chew.level = clamped;
  const now = mix.ctx.currentTime;
  const target = clamped > 0 ? CHEW_GAIN * (CHEW_FLOOR + (1 - CHEW_FLOOR) * clamped) : 0;
  chew.out.gain.setTargetAtTime(target, now, clamped > 0 ? 0.08 : 0.15);
  chew.lowpass.frequency.setTargetAtTime(CHEW_CUTOFF_MIN + CHEW_CUTOFF_SPAN * clamped, now, 0.1);
}

// The tug-of-war (§7.2 tugBeat): two sines a few Hz apart beat against each other (the fight), with
// a quiet triangle pair an octave up so a laptop speaker hears it too. setTugTone moves the pair.
interface TugVoice {
  out: GainNode;
  oscs: { osc: OscillatorNode; ratio: number; beats: boolean }[];
  on: boolean;
}

const TUG_GAIN = 0.07;

function buildTugVoice(ctx: BaseAudioContext, bus: GainNode): TugVoice {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(bus);
  const oscs: TugVoice['oscs'] = [];
  for (const [type, ratio, beats, level] of [
    ['sine', 1, false, 0.5], ['sine', 1, true, 0.5], ['triangle', 2, false, 0.14], ['triangle', 2, true, 0.14],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = 300 * ratio;
    const amp = ctx.createGain();
    amp.gain.value = level;
    osc.connect(amp);
    amp.connect(out);
    osc.start();
    oscs.push({ osc, ratio, beats });
  }
  return { out, oscs, on: false };
}

// The tug's tone: `beatHz` apart around `pitchHz`, or null for silence.
export function setTugTone(tone: { beatHz: number; pitchHz: number } | null): void {
  if (graph) applyTugTone(graph, tone);
}

function applyTugTone(mix: Graph, tone: { beatHz: number; pitchHz: number } | null): void {
  const { tug } = mix;
  const now = mix.ctx.currentTime;
  if (tone === null) {
    if (tug.on) tug.out.gain.setTargetAtTime(0, now, 0.1);
    tug.on = false;
    return;
  }
  for (const { osc, ratio, beats } of tug.oscs) {
    osc.frequency.setTargetAtTime((tone.pitchHz + (beats ? tone.beatHz : 0)) * ratio, now, 0.05);
  }
  if (!tug.on) {
    tug.out.gain.setTargetAtTime(TUG_GAIN, now, 0.05);
    logCue('tugBeat:on');
  }
  tug.on = true;
}

// The duel's drone (WP11 part 2): while LAST LIGHT's root is being deleted, a low pair of saws a fifth apart that climbs
// and brightens with the DELETE's progress and throbs faster (a tremolo from 3 to 9 Hz), so the 12 s build to the
// moment the root goes. Off the instant the DELETE ends.
interface DuelVoice {
  out: GainNode;
  lowpass: BiquadFilterNode;
  oscs: { osc: OscillatorNode; ratio: number }[];
  tremolo: OscillatorNode;
  on: boolean;
}

const DUEL_GAIN = 0.06;
const DUEL_BASE_HZ = 55;
const DUEL_RISE_RATIO = 1.5;        // up a fifth across the DELETE
const DUEL_CUTOFF_MIN = 220;
const DUEL_CUTOFF_SPAN = 900;
const DUEL_TREMOLO_MIN_HZ = 3;
const DUEL_TREMOLO_SPAN_HZ = 6;

function buildDuelVoice(ctx: BaseAudioContext, bus: GainNode): DuelVoice {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(bus);
  const throb = ctx.createGain();
  throb.gain.value = 0.7;
  throb.connect(out);
  const tremolo = ctx.createOscillator();
  tremolo.frequency.value = DUEL_TREMOLO_MIN_HZ;
  const tremoloDepth = ctx.createGain();
  tremoloDepth.gain.value = 0.3;
  tremolo.connect(tremoloDepth);
  tremoloDepth.connect(throb.gain);
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = DUEL_CUTOFF_MIN;
  lowpass.Q.value = 1.4;
  lowpass.connect(throb);
  const oscs: DuelVoice['oscs'] = [];
  for (const [ratio, detune, level] of [[1, -9, 0.5], [1, 9, 0.5], [1.5, 0, 0.35]] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = DUEL_BASE_HZ * ratio;
    osc.detune.value = detune;
    const amp = ctx.createGain();
    amp.gain.value = level;
    osc.connect(amp);
    amp.connect(lowpass);
    osc.start();
    oscs.push({ osc, ratio });
  }
  tremolo.start();
  return { out, lowpass, oscs, tremolo, on: false };
}

// progress: how far the root's DELETE is (0..1), or null for silence.
export function setDuelTone(progress: number | null): void {
  if (graph) applyDuelTone(graph, progress);
}

function applyDuelTone(mix: Graph, progress: number | null): void {
  const { duel } = mix;
  const now = mix.ctx.currentTime;
  if (progress === null) {
    if (duel.on) duel.out.gain.setTargetAtTime(0, now, 0.04);
    duel.on = false;
    return;
  }
  const clamped = Math.max(0, Math.min(1, progress));
  const base = DUEL_BASE_HZ * Math.pow(DUEL_RISE_RATIO, clamped);
  for (const { osc, ratio } of duel.oscs) osc.frequency.setTargetAtTime(base * ratio, now, 0.1);
  duel.lowpass.frequency.setTargetAtTime(DUEL_CUTOFF_MIN + DUEL_CUTOFF_SPAN * clamped, now, 0.1);
  duel.tremolo.frequency.setTargetAtTime(DUEL_TREMOLO_MIN_HZ + DUEL_TREMOLO_SPAN_HZ * clamped, now, 0.2);
  if (!duel.on) {
    duel.out.gain.setTargetAtTime(DUEL_GAIN, now, 0.3);
    logCue('duelDrone:on');
  }
  duel.on = true;
}

// --- Measuring (?debug only) ---------------------------------------------------------------------

// What one cue measures when rendered alone through the real buses, ducking and limiter. Used to
// balance the mix by numbers (peaks well under the limiter, payoffs louder than chatter, nothing
// shrill), since a test can't listen. peakDb: sample peak in dBFS; loudDb: the loudest 50 ms RMS
// window (what the ear notices); activeSec: from the first to the last sample above −40 dB of the
// peak; brightHz: zero-crossing rate / 2, a rough "how bright or hissy" (higher = harsher);
// attackMs: how fast the cue's loudest moment arrives (below).
export interface CueMeasure {
  cue: string;
  peakDb: number;
  loudDb: number;
  // The rise of the loudness envelope (the peak sample in each 0.5 ms) from 10% to 90% of its top. A sharp
  // click jumps to full level in under a millisecond, which is what hurts on headphones; a soft key or a
  // burst of static takes several.
  attackMs: number;
  // The loudness left after a 150 Hz highpass: roughly what laptop and phone speakers play (they
  // give almost nothing below that), so a cue that lives in the sub reads as quiet here.
  speakerLoudDb: number;
  activeSec: number;
  brightHz: number;
}

const MEASURE_SAMPLE_RATE = 44100;
const MEASURE_WINDOW_SEC = 0.05;
const MEASURE_ACTIVE_REL = 0.01;
const MEASURE_SPEAKER_HP_HZ = 150;
const MEASURE_ENVELOPE_SEC = 0.0005;
const toDb = (amplitude: number): number => 20 * Math.log10(Math.max(amplitude, 1e-9));

// A 12 dB/octave highpass (the RBJ cookbook biquad, Q = 1/√2) over rendered samples.
function highpassed(samples: Float32Array, cutoffHz: number): Float32Array {
  const omega = (2 * Math.PI * cutoffHz) / MEASURE_SAMPLE_RATE;
  const alpha = Math.sin(omega) / Math.SQRT2;
  const cos = Math.cos(omega);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const out = new Float32Array(samples.length);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i]!;
    const y0 = b0 * x0 + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  return out;
}

// cue: any one-shot cue, or a continuous voice held for the whole render: 'engineRumble' /
// 'lockTone' / 'hollowChew' / 'duelDrone' at `level`, 'tugBeat' at `params` ({ beatHz, pitchHz }).
export type MeasurableCue = Cue | 'engineRumble' | 'lockTone' | 'hollowChew' | 'tugBeat' | 'duelDrone';

export async function measureCue(
  cue: MeasurableCue, params?: unknown, seconds = 3, level = 1,
): Promise<CueMeasure> {
  const ctx = new OfflineAudioContext(1, Math.ceil(MEASURE_SAMPLE_RATE * seconds), MEASURE_SAMPLE_RATE);
  const mix = buildGraph(ctx, AUDIO_MASTER_GAIN);
  const t0 = LOOKAHEAD_SEC;
  if (cue === 'engineRumble') applyEngineLevel(mix, level, (params as { jitter?: number } | undefined)?.jitter ?? 0);
  else if (cue === 'lockTone') applyLockTone(mix, level);
  else if (cue === 'hollowChew') applyChewLevel(mix, level);
  else if (cue === 'tugBeat') applyTugTone(mix, (params as { beatHz: number; pitchHz: number } | undefined) ?? { beatHz: 8, pitchHz: 300 });
  else if (cue === 'duelDrone') applyDuelTone(mix, level);
  else playOn(mix, cue, params as CueParams[Cue] | undefined, t0);
  const rendered = await ctx.startRendering();
  const data = rendered.getChannelData(0);

  let peak = 0;
  for (const sample of data) peak = Math.max(peak, Math.abs(sample));
  let first = -1;
  let last = -1;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]!) >= peak * MEASURE_ACTIVE_REL) {
      if (first < 0) first = i;
      last = i;
    }
  }
  const windowSize = Math.round(MEASURE_WINDOW_SEC * MEASURE_SAMPLE_RATE);
  const loudest = (samples: Float32Array): number => {
    let max = 0;
    for (let start = Math.max(0, first); start <= last; start += windowSize) {
      let sum = 0;
      const end = Math.min(samples.length, start + windowSize);
      for (let i = start; i < end; i++) sum += samples[i]! * samples[i]!;
      max = Math.max(max, Math.sqrt(sum / Math.max(1, end - start)));
    }
    return max;
  };
  const loud = loudest(data);
  const speakerLoud = loudest(highpassed(data, MEASURE_SPEAKER_HP_HZ));
  let crossings = 0;
  for (let i = Math.max(1, first); i <= last; i++) if ((data[i - 1]! < 0) !== (data[i]! < 0)) crossings++;
  const activeSec = first < 0 ? 0 : (last - first + 1) / MEASURE_SAMPLE_RATE;
  const envelope: number[] = [];
  const envelopeSize = Math.round(MEASURE_ENVELOPE_SEC * MEASURE_SAMPLE_RATE);
  for (let start = Math.max(0, first); start <= last; start += envelopeSize) {
    let max = 0;
    for (let i = start; i < Math.min(data.length, start + envelopeSize); i++) max = Math.max(max, Math.abs(data[i]!));
    envelope.push(max);
  }
  const envelopeTop = envelope.reduce((top, level) => Math.max(top, level), 0);
  const riseFrom = envelope.findIndex((level) => level >= envelopeTop * 0.1);
  const riseTo = envelope.findIndex((level) => level >= envelopeTop * 0.9);
  return {
    cue: params === undefined ? cue : `${cue} ${JSON.stringify(params)}`,
    peakDb: Math.round(toDb(peak) * 10) / 10,
    loudDb: Math.round(toDb(loud) * 10) / 10,
    attackMs: riseFrom < 0 ? 0 : Math.round((riseTo - riseFrom) * MEASURE_ENVELOPE_SEC * 10000) / 10,
    speakerLoudDb: Math.round(toDb(speakerLoud) * 10) / 10,
    activeSec: Math.round(activeSec * 1000) / 1000,
    brightHz: activeSec > 0 ? Math.round(crossings / 2 / activeSec) : 0,
  };
}
