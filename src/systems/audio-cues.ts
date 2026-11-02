import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { on } from '@systems/events';
import { onPostTick } from '@systems/clock';
import { registerKeys } from '@systems/input';
import { getPrediction } from '@systems/predict';
import { isThrustOn, engineAccel, thrustJitter } from '@systems/orbit-sim';
import {
  CHIME_AFTER_TRANSMIT_SEC, FAULT_COUGH_AFTER_SEC,
  HEARTBEAT_BED_SEC, HEARTBEAT_BED_HURT_SEC, HEARTBEAT_BED_STRENGTH, HEARTBEAT_BED_INFECTED_SEC,
  HEARTBEAT_BED_JITTER, ARRIVAL_HIT_STAGGER_SEC, BEAM_OUT_SWEEP_SEC,
} from '@data/tuning';
import { driversInMemory, verbSecondsLeft, engineOpen } from '@state/selectors';
import { driverTouch } from '@systems/landing-rules';
import {
  play, setEngineLevel, setLockTone, setChewLevel, setTugTone, setDuelTone, toggleMuted, type TouchdownSound, type WhoompShape,
} from '@systems/audio';
import type { Place, Touch } from '@/types/landing';
import { getDropSolution } from '@systems/drop-cache';
import { windowToneFraction } from '@systems/landing-hud';
import { rootDeleteProgress } from '@systems/hollow';
import { chewLevel, tugTone } from '@systems/hollow-hud';
import { getOps } from '@systems/ops-core';
import { OP_CHIRP_HZ, DRAG_STAMP_MIN_KM } from '@data/tuning';
import type { LineState } from '@systems/flight-events';
import { beltDepth } from '@systems/zones';
import { openChoiceEntry, choiceTimerRunning, choiceSecondsLeft } from '@systems/say';
import {
  GEIGER_EDGE_HZ, GEIGER_PEAK_HZ, GEIGER_HIT_CLICKS, GEIGER_HIT_SPREAD_SEC, SEED_BLINK_SEC, SEED_TELEGRAPH_SEC,
  CHOICE_URGENT_SEC, BELT_STATIC_GAP_EDGE_SEC, BELT_STATIC_GAP_PEAK_SEC, BELT_STATIC_GAP_JITTER,
} from '@data/tuning';

// What the game sounds like (§7.2): the one table from game events and state to cues. Every
// cue a moment plays is chosen here, so a moment never plays twice from two places. Stamps
// (components/hud/Stamp) are visuals only: their stampHit is already part of the moment's sound
// below. Typing sounds belong to the views that type (COMMS, TERMINAL, the objective strip).
//
// • line-state      → lineWhoomp: rise (off the planet), shimmer (green), fall (back to red),
//                     sag (green lost, loop reopened)
// • loop-closed     → capturedChord + stampHit (CAPTURED)
// • lowest-in-ring  → chime (▼ entered the ring)
// • locked          → lockArp + stampHit; accepted → chime + stampHit; stranded / escaped →
//                     sag + stampHit; crashed → heavy stampHit
// • clear-of-planet → stampHit (CLEAR OF THE PLANET)
// • burn-point      → falling chime at GET READY
// • countdown-beep  → countdownBeep (the burn's NOW an octave up)
// • lock-count      → holdTick (HOLD STEADY 3, 2, 1 rising into lockArp's C)
// • mode-change     → jackIn / jackOut; refused → buzz; ui-click → uiClick
// • op-done         → opDone, or buzz when a repair ran out of REPAIR CHARGE
// • licence         → transmitIn, then a chime as the files land (WP4)
// • delivery        → a chime per file unpacked at its boot line; inbox-new → one chime for the boot's new mail (3b)
// • engine-cough    → engineCough (SPACE on an engine that can't fire)
// • file-fault      → faultCrunch, then engineCough as the engine chokes (the ENGINE I/O FAULT)
// • plot-mode       → lineWhoomp 'clear' when the instruments see exactly again (Sensor Interp
//                     or Nav Plotter repaired)
// • while ops run in blue: opChirp at OP_CHIRP_HZ (the mind at work)
// • the landing (slice 1a, 01-landing §4): pod-launched → podLaunch (a thump and a hiss); pod-entry → podEntry (the
//   roar at the atmosphere); pod-landed → touchdownBell pitched per LZ (LZ-B a fifth above LZ-A), dull when hard, sour when
//   mislanded, a low bonk off-site or in a no-go arc, and on the run's first landing the choir and the FIRST LANDING
//   stamp's thud; window-sure → chime (the bracket turns green); lz-full → capturedChord; all-pods-down → lockArp and
//   the ALL PODS DOWN stamp's thud; pods-parked → sag; and every tick while a window is open, the lock tone follows
//   how centred the dot is in its bracket (landing-hud windowToneFraction)
// • while drivers are in memory and the kid is in blue: the heartbeat bed (the pods' stasis monitors), quicker while
//   a pod would land hard, quicker still and uneven while anything is infected (WP6)
// • HOLLOW (WP6): hollow-infect → hollowBite; hollow-wall → fizzle; hollow-consume → sombreFall when a
//   pod's driver was eaten, else hollowBite (a file or a half-written copy gone: nobody was lost);
//   hollow-cure → driverSaved (several in one tick sound once: one bite timer, one moment); and
//   every tick the chew follows the total drain and the tug's beating tones follow the boundary
// • WP7: hollow-name-shown → the truth note + nameGlitch; arrival-hits → transitHit per hit (staggered);
//   beam-out-start → transmitIn; beam-out-cancel → sag; abandoned → a short transmitSweep
// • WP9 (KESTREL): zone-hit → debrisImpact (a cloud slams into a rack; its thud is the stamp's) or, in a belt,
//   transitHit with a flurry of Geiger clicks; zone-forecast → the CLEAR OF THE DEBRIS stamp's thud and a chime
//   when a correction takes the path off the cloud, a sag when a path runs back into it; dodge-lapsed → the
//   TOO LATE TO DODGE stamp's heavy thud and the sag; seed-telegraph → one seedWarn blip per blink of the outline; seed-landed → seedDrop; AUTOBURN armed → chime; skill-trained →
//   transmitIn, then the licence's chime as AUTOBURN.skl lands; and every tick inside a belt, spaced-out bursts of
//   beltStatic (post-handover: the belt's main sound) with the geiger's sparse Poisson ticks on top, both coming
//   quicker toward the belt's middle
// • WP10 (VESPER): ghost-start → ghostIgnite (the relay and the whump of the engine lighting by itself; the ship's
//   first one heavier, under the klaxon its alarm raises; a burst a SKIP flew through too, its only sound); deal → the answer
//   stamp's thud (an ACCEPT's eaten cluster plays sombreFall through hollow-consume); and every whole second of a
//   standing TERMINAL choice's clock (THE DEAL), once it runs: dealTick, higher in its last CHOICE_URGENT_SEC
// • WP11 part 2 (LAST LIGHT): a verb's telegraph → verbTick for each whole second it counts (3, 2, 1, climbing; it
//   stands still under TACTICAL like the countdown); verb-blocked → verbBlocked + the BLOCKED stamp's thud;
//   verb-landed → verbLanded; root-unlocked → rootOpen; duel-spike → duelSpike (brighter as the DELETE nears its end),
//   and while the root's DELETE runs, the duel's drone climbs with it; root-deleted → rootDeleted; finale-chosen →
//   purgeTone or mergeChord (the choice card plays its own hold, FinaleChoice)
// • Phase 3 slice 2 (04 §4): seed-landed-beam → seedLand (each beam seed's small thunk as the ECC line names it);
//   hollow-boarded → hollowBoard (the root drops into the bay as the 108% unpack is said; the shake and the tear are
//   Juice's and the glitch driver's); last-rm-lost → the LAST rm DELETED stamp's heavy thud. The boarding beam's stutter
//   is the TRANSMIT screen's own transmitSweep (TransmitScreen).
// • a new alarm alert → klaxon
// • every tick: the engine rumble follows delivered thrust, the engine firing by itself (ghost
//   thrust, C2) included; the lock tone follows the green share of a captured loop while burning
//   near the ring, and holds through HOLD STEADY.

function whoompFor(from: LineState, to: LineState): WhoompShape | null {
  if (to === 'impact') return 'fall';
  if (from === 'impact') return 'rise';
  // A capture straight into the ring is one moment: the CAPTURED chord says it.
  if (to === 'in-ring') return from === 'open' ? null : 'shimmer';
  if (from === 'open' && to === 'closed') return null;
  return 'sag';
}

type HollowCue = 'hollowBite' | 'fizzle' | 'sombreFall' | 'driverSaved';

// The touchdown bell's colour for how a pod came down (§4; slice 1b: a no-go arc's own, lower bonk).
function touchdownSound(place: Place, touch: Touch): TouchdownSound {
  if (place === 'no-go') return 'no-go';
  if (place === 'off-site') return 'off-site';
  if (place === 'mislanded') return 'mislanded';
  return touch === 'hard' ? 'hard' : 'soft';
}

// 'pod-launched' comes while the pod is still aboard: the run's first launch is the tutorial run's first ship with every
// pod still aboard (landing.ts gives that one POD_FIRST_DESCENT_SEC).
function launchingFirstOfRun(state: Readonly<GameState>): boolean {
  return state.run.tutorial && state.run.ships.length === 0 && state.landing.pods.every((record) => record.fate.kind === 'aboard');
}

export function mountAudioCues(store: Store<GameState>): () => void {
  // AI seconds to the heartbeat bed's next beat (see below; the reveal's end sets it too).
  let nextBeatIn = 0;
  const playedThisTick = new Set<HollowCue>();
  const onceThisTick = (cue: HollowCue): void => {
    if (playedThisTick.has(cue)) return;
    playedThisTick.add(cue);
    play(cue);
  };
  const offs: Array<() => void> = [
    on('line-state', ({ from, to }) => {
      const shape = whoompFor(from, to);
      if (shape) play('lineWhoomp', { shape });
    }),
    on('clear-of-planet', () => play('stampHit', { heavy: false })),
    on('loop-closed', () => {
      play('capturedChord');
      play('stampHit', { heavy: false });
    }),
    on('lowest-in-ring', () => play('chime', { falling: false })),
    on('locked', () => {
      play('lockArp');
      play('stampHit', { heavy: false });
    }),
    on('accepted', () => {
      play('chime', { falling: false });
      play('stampHit', { heavy: false });
    }),
    on('stranded', () => {
      play('lineWhoomp', { shape: 'sag' });
      play('stampHit', { heavy: false });
    }),
    on('escaped', () => {
      play('lineWhoomp', { shape: 'sag' });
      play('stampHit', { heavy: false });
    }),
    on('crashed', () => play('stampHit', { heavy: true })),
    on('burn-point', ({ stage }) => { if (stage === 'ready') play('chime', { falling: true }); }),
    on('countdown-beep', ({ final }) => play('countdownBeep', { final })),
    on('lock-count', ({ count }) => play('holdTick', { count })),
    on('mode-change', ({ to }) => play(to === 'memory' ? 'jackIn' : 'jackOut')),
    on('refused', () => play('buzz')),
    on('op-done', ({ result }) => play(result === 'done' ? 'opDone' : 'buzz')),
    on('ui-click', () => play('uiClick')),
    // Phase 3 slice 3b: a delivery unpacked at its boot line (02 §4: a chime per delivery), and the boot's new mail (05 §4:
    // one chime per boot with new mail).
    on('delivery', () => play('chime', { falling: false })),
    on('inbox-new', () => play('chime', { falling: false })),
    on('licence', () => {
      play('transmitIn');
      play('chime', { falling: false }, { delaySec: CHIME_AFTER_TRANSMIT_SEC });
    }),
    on('engine-cough', () => play('engineCough')),
    on('file-fault', ({ role }) => {
      play('faultCrunch');
      if (role === 'engine-io') play('engineCough', undefined, { delaySec: FAULT_COUGH_AFTER_SEC });
    }),
    on('plot-mode', ({ to }) => { if (to === 'exact') play('lineWhoomp', { shape: 'clear' }); }),
    // Slice 1a, the landing (01-landing §4).
    on('pod-launched', () => play('podLaunch', { first: launchingFirstOfRun(store.getState()) })),
    on('pod-entry', ({ first }) => play('podEntry', { first })),
    on('pod-landed', ({ place, lz, touch, firstOfRun }) => {
      const index = lz === null ? 0 : store.getState().landing.lzs.findIndex((candidate) => candidate.label === lz);
      play('touchdownBell', { lz: Math.max(0, index), landing: touchdownSound(place, touch) });
      if (firstOfRun) {
        play('arrivalChoir');
        play('stampHit', { heavy: false });
      }
    }),
    on('window-sure', () => play('chime', { falling: false })),
    // Slice 1b: a drag kick's soft hiss, for the kicks that stamp (DRAG_STAMP_MIN_KM: the stamp, the hiss and the lesson
    // share it; smaller kicks are noise).
    on('drag-kick', ({ dropKm }) => { if (dropKm >= DRAG_STAMP_MIN_KM) play('dragHiss'); }),
    on('lz-full', () => play('capturedChord')),
    // Only a ship that landed every pod (the ALL PODS DOWN stamp): one that parked some ends quietly.
    on('all-pods-down', ({ parked }) => {
      if (parked > 0) return;
      play('lockArp');
      play('stampHit', { heavy: false });
    }),
    on('pods-parked', () => play('lineWhoomp', { shape: 'sag' })),
    // WP6: HOLLOW's moments, once per tick each (a bite on two files is one bite).
    on('hollow-infect', () => onceThisTick('hollowBite')),
    on('hollow-wall', () => onceThisTick('fizzle')),
    on('hollow-firewall', () => onceThisTick('fizzle')),
    on('hollow-consume', ({ driver }) => onceThisTick(driver ? 'sombreFall' : 'hollowBite')),
    on('hollow-cure', () => onceThisTick('driverSaved')),
    // WP7: HOLLOW names itself (on the ship it boards, `> i was 046.`): the second turn of the story gets the first one's
    // truth note, the floor dropping away under one high glass note, with HOLLOW's own blips stepping down
    // through static as `???` decodes into UNIT-046. Heard with the picture: at once in blue, else on the
    // kid's first look (components/memory-view/HollowNameFx, 'hollow-name-shown').
    on('hollow-name-shown', () => {
      play('truthNote');
      play('nameGlitch');
    }),
    // WP7 part 2: the run. The arrival's hits crackle one by one with their red flashes (ArrivalFlash runs
    // on the same stagger); BEAM OUT opens the link with the modem handshake, a cancelled bar sags, and a
    // filled one sweeps the unit away as the old ship's windows go black.
    on('arrival-hits', ({ hits }) => {
      hits.forEach((_hit, i) => play('transitHit', undefined, { delaySec: i * ARRIVAL_HIT_STAGGER_SEC }));
    }),
    on('beam-out-start', () => play('transmitIn')),
    on('beam-out-cancel', () => play('lineWhoomp', { shape: 'sag' })),
    on('abandoned', () => play('transmitSweep', { seconds: BEAM_OUT_SWEEP_SEC })),
    // WP8: the archive stopped keeping this unit mid-run: one buzz with the TERMINAL's line (data/script.ts).
    on('archive-lost', () => play('buzz')),
    on('save-lost', () => play('buzz')),
    on('save-stale', () => play('buzz')),
    // WP9: the physical layer reaching into the mind, heard. Debris is one slam (the stamp's thud is part of it);
    // a belt hit is a smaller crackle of damaged data inside the Geiger's chatter.
    on('zone-hit', ({ kind }) => {
      if (kind === 'debris') { play('debrisImpact'); return; }
      play('transitHit');
      for (let i = 0; i < GEIGER_HIT_CLICKS; i++) play('geiger', undefined, { delaySec: Math.random() * GEIGER_HIT_SPREAD_SEC });
    }),
    // The moment steering early saves rack C (§5.1 5:00): the hatching vanishes under CLEAR OF THE DEBRIS.
    on('zone-forecast', ({ from, to }) => {
      if (from === 'hit' && to === 'clear') {
        play('stampHit', { heavy: false });
        play('chime', { falling: false });
      } else if (from === 'clear' && to === 'hit') {
        play('lineWhoomp', { shape: 'sag' });
      }
    }),
    // The dodge ran out (the strip: `· too late to dodge DEBRIS C`): the TOO LATE TO DODGE stamp's heavy thud, then the
    // same sag as a path running back into the cloud, the sound of a chance gone.
    on('dodge-lapsed', () => {
      play('stampHit', { heavy: true });
      play('lineWhoomp', { shape: 'sag' });
    }),
    on('seed-telegraph', () => {
      const blinks = Math.round(SEED_TELEGRAPH_SEC / SEED_BLINK_SEC);
      for (let i = 0; i < blinks; i++) play('seedWarn', undefined, { delaySec: i * SEED_BLINK_SEC });
    }),
    on('seed-landed', () => play('seedDrop')),
    on('seed-landed-beam', () => play('seedLand')),
    on('hollow-boarded', () => play('hollowBoard')),
    on('last-rm-lost', () => play('stampHit', { heavy: true })),
    // A burst a SKIP flies through takes no wall time, so the rumble that follows delivered thrust never sounds for
    // it: its ignite (the relay and the whump) is what says the engine fired (WP10 review, the lead's ruling).
    on('ghost-start', ({ first }) => play('ghostIgnite', { first })),
    on('deal', ({ outcome }) => { if (outcome !== 'invalidated') play('stampHit', { heavy: outcome === 'accepted' }); }),
    on('autoburn', ({ to }) => { if (to === 'armed') play('chime', { falling: false }); }),
    on('skill-trained', () => {
      play('transmitIn');
      play('chime', { falling: false }, { delaySec: CHIME_AFTER_TRANSMIT_SEC });
    }),
    // WP11 part 2: LAST LIGHT's verbs, the duel and the choice.
    on('verb-blocked', () => {
      play('verbBlocked');
      play('stampHit', { heavy: false });
    }),
    on('verb-landed', () => play('verbLanded')),
    on('root-unlocked', () => play('rootOpen')),
    on('duel-spike', ({ progress }) => play('duelSpike', { progress })),
    on('root-deleted', () => play('rootDeleted')),
    on('finale-chosen', ({ choice }) => play(choice === 'purge' ? 'purgeTone' : 'mergeChord')),
  ];
  offs.push(onPostTick(() => playedThisTick.clear()));

  // The klaxon sounds once per alarm, when it is raised (not for as long as it lasts).
  let alarmIds = new Set<string>();
  offs.push(store.subscribe((s) => s.alerts.rev, () => {
    const alarmIdsNow = new Set(store.getState().alerts.list.filter((alert) => alert.severity === 'alarm').map((alert) => alert.id));
    for (const id of alarmIdsNow) {
      if (!alarmIds.has(id)) { play('klaxon'); break; }
    }
    alarmIds = alarmIdsNow;
  }));

  // THE DEAL's clock (WP10): a tock for every whole second its timer passes, on either screen (the ticker counts it in
  // amber), from when its line has typed. AI time: it stands still while paused, like the timer.
  let choiceSecond: { entryId: number; second: number } | null = null;
  offs.push(onPostTick(() => {
    const state = store.getState();
    const entry = openChoiceEntry(state);
    if (entry === null || entry.choice === null || !choiceTimerRunning(state, entry)) { choiceSecond = null; return; }
    const second = choiceSecondsLeft(entry.choice);
    if (choiceSecond !== null && choiceSecond.entryId === entry.id && second < choiceSecond.second && second > 0) {
      play('dealTick', { urgent: second <= CHOICE_URGENT_SEC });
    }
    choiceSecond = { entryId: entry.id, second };
  }));

  // A verb's telegraph (WP11 part 2): a tick for its first second as it starts, and one for every whole second it then
  // passes (3, 2, 1; the ship's first verb from 4), on either screen: the countdown is heard from amber too (the strip
  // says TAB). Read from the telegraph's own clock, which stands still while the flight is at TACTICAL
  // (systems/hollow-verbs.ts).
  let verbSecond: { targetId: string; second: number } | null = null;
  offs.push(onPostTick(() => {
    const verb = store.getState().hollow.verb;
    if (verb === null) { verbSecond = null; return; }
    const second = verbSecondsLeft(verb);
    if (verbSecond === null || verbSecond.targetId !== verb.targetId || second < verbSecond.second) play('verbTick', { count: second });
    verbSecond = { targetId: verb.targetId, second };
  }));

  // The ops chirp on AI time: frozen with the ops while paused, and only on the blue screen,
  // where the kid watches them (in amber the engine owns the sound).
  // Each tick schedules the chirps that fall inside the next tick, sample-accurately, so they
  // keep an even 12 Hz instead of snapping to the 20 Hz tick grid.
  const chirpPeriod = 1 / OP_CHIRP_HZ;
  let nextChirpIn = 0;
  offs.push(onPostTick((_dtWall, dtAi) => {
    const chirping = dtAi > 0 && getOps().length > 0 && store.getState().ui.mode === 'memory';
    if (!chirping) { nextChirpIn = 0; return; }
    while (nextChirpIn < dtAi) {
      play('opChirp', undefined, { delaySec: nextChirpIn });
      nextChirpIn += chirpPeriod;
    }
    nextChirpIn -= dtAi;
  }));

  // The heartbeat bed, on AI time like the chirps: only in blue (the drivers in view, the pods' stasis monitors), while
  // some drivers are still in memory. Scheduled ahead inside the tick so the beat stays even.
  offs.push(onPostTick((_dtWall, dtAi) => {
    const state = store.getState();
    const drivers = state.ui.mode === 'memory' ? driversInMemory(state) : [];
    // Off (amber, paused, nobody left): coming back starts a beat later, not on top of the jack-in.
    if (dtAi <= 0 || drivers.length === 0) {
      nextBeatIn = Math.max(nextBeatIn, HEARTBEAT_BED_SEC);
      return;
    }
    // Near infection the hearts race and stumble (§7.2): quicker, and each gap a little off. A driver that would land
    // hard quickens them.
    const infected = drivers.some((driver) => driver.infected !== undefined);
    const hurt = drivers.some((driver) => driverTouch(driver.integrity) === 'hard');
    const period = infected ? HEARTBEAT_BED_INFECTED_SEC : hurt ? HEARTBEAT_BED_HURT_SEC : HEARTBEAT_BED_SEC;
    while (nextBeatIn < dtAi) {
      play('heartbeat', { strength: HEARTBEAT_BED_STRENGTH }, { delaySec: nextBeatIn });
      nextBeatIn += infected ? period * (1 + (Math.random() * 2 - 1) * HEARTBEAT_BED_JITTER) : period;
    }
    nextBeatIn -= dtAi;
  }));

  // The belt (§7.2, WP9; post-handover): while the ship is inside a belt and the world runs, bursts of static with
  // silence between them (the first on the way in), and on top the geiger's ticks at random (exponential) gaps. Both
  // come quicker with the depth and are scheduled inside the tick like the chirps. A pause keeps both waits (resuming
  // does not fire a burst at once); leaving the belt resets them, so the next belt starts with a burst. Cosmetic randomness.
  let nextClickIn = 0;
  let nextStaticIn = 0;
  offs.push(onPostTick((_dtWall, dtAi) => {
    if (dtAi <= 0) return;
    const depth = beltDepth(store.getState());
    if (depth === null) { nextClickIn = 0; nextStaticIn = 0; return; }
    const staticGapSec = BELT_STATIC_GAP_EDGE_SEC + (BELT_STATIC_GAP_PEAK_SEC - BELT_STATIC_GAP_EDGE_SEC) * depth;
    while (nextStaticIn < dtAi) {
      play('beltStatic', { depth }, { delaySec: nextStaticIn });
      nextStaticIn += staticGapSec * (1 + (Math.random() * 2 - 1) * BELT_STATIC_GAP_JITTER);
    }
    nextStaticIn -= dtAi;
    const rateHz = GEIGER_EDGE_HZ + (GEIGER_PEAK_HZ - GEIGER_EDGE_HZ) * depth;
    while (nextClickIn < dtAi) {
      play('geiger', undefined, { delaySec: nextClickIn });
      nextClickIn += -Math.log(1 - Math.random()) / rateHz;
    }
    nextClickIn -= dtAi;
  }));

  // The continuous voices, every tick (also while paused, so they fall silent at once).
  offs.push(onPostTick(() => {
    const state = store.getState();
    // The engine is open in the flight and, from slice 1b, in the landing until it ends (selectors engineOpen).
    const live = engineOpen(state) && !state.clock.paused;
    const thrust = live && isThrustOn(state);
    const ghost = live && state.burn.ghost ? state.burn.ghost.amp : 0;
    const level = (thrust ? engineAccel(state) / state.level.aNominalKmS2 : 0) + ghost;
    setEngineLevel(level, thrustJitter(state));
    const pred = getPrediction();
    const nearRing = live && pred.outcome === 'closed' && (thrust || pred.fit.inRing);
    // While landing the same tone sings the window (01-landing §4): pitched by how centred the dot is in its bracket.
    if (state.run.phase === 'landing') setLockTone(windowToneFraction(state, getDropSolution()));
    else setLockTone(nearRing ? (pred.fit.inRing ? 1 : pred.greenFraction) : null);
    // HOLLOW (WP6): the chew while anything drains (louder while the engine fires: P1), and the
    // tug's beating tones while a repair fights it. Both are heard on either screen.
    setChewLevel(chewLevel(state));
    setTugTone(tugTone(state));
    // WP11 part 2: the duel's drone follows the root's DELETE (silent while paused: the op stands still then).
    setDuelTone(state.run.phase === 'landing' && !state.clock.paused ? rootDeleteProgress(state) : null);
  }));

  // M mutes for the session (§7.2).
  offs.push(registerKeys({ layer: 'game', codes: ['KeyM'], onDown: () => toggleMuted() }));

  return () => offs.forEach((off) => off());
}
