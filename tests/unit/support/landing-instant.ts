// Instant landing for the suites that do not test the landing itself (slice 1a, Track TESTS). Phase 2's printing ran by
// itself; slice 1a's landing waits for the kid's [L] at each LZ window, so every harness loop written against printing
// (`untilPhase('report')`, `while phase === 'landing'`, the playthrough's kids) would spin to its wall-clock limit.
// mountInstantLanding (mounted by the WP5 harness, after mountLanding) lands every pod through the foundation's
// forceLandAll as the landing begins: the real launch and touchdown path, soft, into an LZ with room, so the LANDING
// REPORT, the run and TRANSMIT follow as they did after printing.
//
// The landing suites (tests/unit/landing/) fly the landing for real (the instant landing starts off there, below); a
// suite that wants the landing to stand (HOLLOW
// biting in LANDING, THE DEAL standing into it, the finale's wait) sets the mode first:
// • 'instant' (default): land on the landing's first AI tick, unless a driver aboard is infected or below the failing
//   band (it can't launch yet: forceLandAll would park it), then as soon as none is, or after INFECTED_GRACE_AI_SEC
//   (a defender has had its chance to REPAIR it, as phase 2's printer waited for it);
// • { after: s }: the landing stands for s AI seconds (HOLLOW keeps biting meanwhile: about what a landing by the strip
//   takes), then lands as 'instant' does;
// • 'manual': never; the suite calls landInstantly (or flies the landing) itself.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { forceLandAll } from '@systems/landing';
import { onAiTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { driversInMemory, isInfected } from '@state/selectors';
import { BAND_FAILING_MIN } from '@data/tuning';

export type LandingMode = 'instant' | 'manual' | { after: number };

// AI seconds an unlaunchable driver may hold the instant landing (a defender's REPAIR of a bite takes about 10).
export const INFECTED_GRACE_AI_SEC = 20;

// The landing suites (tests/unit/landing/, Track SIM's) fly the landing themselves with the WP5+ harnesses
// (harness-landing followLanding, lockOn, requestLaunch), so a suite run from there starts with the instant landing off;
// every other suite starts with it on. Either may set the mode.
const IN_LANDING_SUITE = process.argv.some((arg) => /tests[\\/]unit[\\/]landing[\\/]/.test(arg));
let mode: LandingMode = IN_LANDING_SUITE ? 'manual' : 'instant';
let landingAiSec = 0;
let mounted = false;

export function setLandingMode(next: LandingMode): void {
  mode = next;
}

export function landingMode(): LandingMode {
  return mode;
}

// forceLandAll, when there is a landing to land: every pod whose driver can launch lands now, the landing ends (the
// rest are parked) and the report follows after the linger. Returns the pods landed (0 outside an open landing).
export function landInstantly(store: Store<GameState>): number {
  const state = store.getState();
  if (state.run.phase !== 'landing' || state.landing.ended !== null) return 0;
  return forceLandAll(store);
}

// Every driver aboard can launch once forceLandAll has aborted the ops on it (only an infection or the failing band
// keep it aboard).
function allAboardLaunchable(state: Readonly<GameState>): boolean {
  const aboard = new Set(state.landing.pods.filter((record) => record.fate.kind === 'aboard').map((record) => record.pod));
  return driversInMemory(state).every((driver) => !aboard.has(driver.pod) || (!isInfected(driver) && driver.integrity >= BAND_FAILING_MIN));
}

function tick(store: Store<GameState>, dtAi: number): void {
  const state = store.getState();
  if (state.run.phase !== 'landing') { landingAiSec = 0; return; }
  if (state.landing.ended !== null || mode === 'manual') return;
  landingAiSec += dtAi;
  const standFor = typeof mode === 'object' ? mode.after : 0;
  if (landingAiSec < standFor) return;
  if (!allAboardLaunchable(state) && landingAiSec < standFor + INFECTED_GRACE_AI_SEC) return;
  landInstantly(store);
}

export function mountInstantLanding(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountInstantLanding: already mounted');
  mounted = true;
  const offTick = onAiTick((dtAi) => tick(store, dtAi));
  const offReset = onWorldReset('test-instant-landing', () => { landingAiSec = 0; }, () => ({ landingAiSec }));
  return () => {
    offTick();
    offReset();
    landingAiSec = 0;
    mounted = false;
  };
}
