// The landing kid of the review-fix suites (skills/autodrop-review, skills/landing-v3): run 1's arm (autodrop-arm), AUTOBURN
// mounted, every launch recorded with the pace and thrust of its tick, and a kid who obeys the strip.
import type { Harness7 } from '../wp7/harness7';
import type { GameState } from '@state/schema';
import type { LandingView } from '@/types/landing';
import { ensureLandingKeys } from '../landing/harness-landing';
import { ARM } from './autodrop-arm';
import { getPrediction } from '@systems/predict';
import { skipBlockReason } from '@systems/pace';
import { landingResult, landingView } from '@systems/landing-rules';
import { capabilitiesNow } from '@systems/capabilities';
import { getDropSolution } from '@systems/drop-cache';
import { autoburnRefusal, mountAutoburn, registerAutoburnKeys } from '@systems/autoburn';
import { on } from '@systems/events';

export const VESPER_ROUTE = [ARM.ARES, ARM.HALCYON, ARM.KESTREL, ARM.VESPER] as const;

// One launch as it happened: its pod, source, and the pace and thrust of the tick it left on.
export interface Launch { pod: number; source: string; pace: string; thrust: boolean }

export interface LandingKid {
  st: () => Readonly<GameState>;
  shown: () => string;
  ad: () => Readonly<GameState['landing']['autodrop']>;
  viewNow: () => LandingView;
  aboard: () => number;
  landedPct: () => number;
  launches: Launch[];
  // The kid who obeys the strip: [G] while it offers AUTODROP (unarmed), [B] once when `withB` and AUTOBURN would engage,
  // [L] when it says `press [L]`, [F] when it offers a SKIP; `each` after every tick, before the keys. Runs until the landing
  // ends, `until`, or maxWall; returns the wall s it ran.
  obey: (maxWall: number, opts?: { withB?: boolean; until?: () => boolean; each?: () => void }) => number;
}

export function landingKid(h: Harness7): LandingKid {
  ensureLandingKeys(h);
  mountAutoburn(h.store);
  registerAutoburnKeys(h.store);
  const st = (): Readonly<GameState> => h.store.getState();
  const shown = (): string => st().director.shown?.text ?? '';
  const keys = (): readonly string[] => st().director.shown?.keys ?? [];
  const ad = () => st().landing.autodrop;
  const kid: LandingKid = {
    st, shown, ad,
    viewNow: () => landingView(st(), getDropSolution()!, capabilitiesNow(st()).bay.cadenceTac),
    aboard: () => st().landing.pods.filter((record) => record.fate.kind === 'aboard').length,
    landedPct: () => {
      const tally = landingResult(st(), 'locked');
      return Math.round((100 * tally.landedInLz) / Math.max(1, tally.colonistsAboard));
    },
    launches: [],
    obey: (maxWall, opts = {}) => {
      const start = h.wall();
      let pressedB = false;
      while (st().run.phase === 'landing' && st().landing.ended === null && h.wall() - start < maxWall && !(opts.until?.() ?? false)) {
        h.step();
        opts.each?.();
        const text = shown();
        if (opts.withB === true && !pressedB && autoburnRefusal(st(), getPrediction()) === null) { h.press('KeyB'); pressedB = true; continue; }
        if (ad().armed === null && keys().includes('G') && /\[G\]/.test(text)) { h.press('KeyG'); continue; }
        if (/press \[L\]/.test(text)) { h.press('KeyL'); continue; }
        if (st().clock.skipWarp === null && keys().includes('F') && skipBlockReason(st(), getPrediction()) === null) h.press('KeyF');
      }
      return h.wall() - start;
    },
  };
  on('pod-launched', (payload) => {
    kid.launches.push({ pod: payload.pod, source: payload.source, pace: st().clock.pace, thrust: st().burn.lastTickDvKmS > 0 });
  });
  return kid;
}
