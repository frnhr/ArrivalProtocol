// The words of the engine firing by itself (C2, §9 WP10 item 2), apart from script.ts so the DOM-free ghost-thrust
// system can say them without pulling in the director. tests/wp10 renders every one (≤ 70 characters, §3.5 glossary).
export const GHOST_TEXT = {
  // The ship's first burst: the alarm (the strip's alarm line and the alert's own word for the toggle).
  alarm: 'UNCOMMANDED THRUST',
  alarmLine: 'UNCOMMANDED THRUST — the engine fired by itself, ▼ drifts',
  // Every burst after it, counted (a warning).
  counter: (count: number): string => `UNCOMMANDED THRUST ×${count}`,
  // A burst that sticks (a dead controller, §6.4): it runs until SPACE is pressed and released.
  stuckLine: 'THE ENGINE IS STUCK FIRING — tap [SPACE] to stop it',
  // ...seen from the MIND, where SPACE is refused (WP12 review: the ship's lines say [TAB] first there).
  stuckLineTab: 'THE ENGINE IS STUCK FIRING — [TAB], tap [SPACE] to stop it',
  // After the second burst (§9 WP10 item 2): the way to the cause (the Engine window's THRUST CTRL pip jumps to the
  // file), and in the MIND the fix.
  pipLesson: 'THE ENGINE IS FIRING BY ITSELF — click the THRUST CTRL pip',
  swapLesson: 'THE ENGINE FIRES BY ITSELF — SWAP THRUST CTRL to Thrust.alt',
  // WP10 part 2, on screen: the NAV PLOT's STATUS while a burst runs (not the kid's burn), and the counter on the THRUST
  // CTRL pip (the way to the cause carries the count) with its tooltip.
  status: 'UNCOMMANDED',
  // WP10 review: what the bursts did to ▼, beside it on the plot for a few seconds (flight-hud.ts): `▼ DRIFT −60 km`,
  // or under a rough sensor (≈) only which way it went (`▼ DRIFT ↓`), so the fuzz keeps its secret. The LOWEST readout
  // carries the same amount (`(−60)`) or arrow.
  drift: (amount: string): string => `▼ DRIFT ${amount}`,
  driftDown: '↓',
  driftUp: '↑',
  pipCount: (count: number): string => `FIRED ×${count}`,
  pipTitle: (count: number): string => `it fired the engine by itself ${count === 1 ? 'once' : `${count} times`}`,
} as const;
