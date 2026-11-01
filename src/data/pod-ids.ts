// A pod's ids (not words): `pod03` in the TERMINAL's echoes (the shell-style name, like `engine_io`) and `driver_pod03`
// as its driver's segment id. Kept apart from data/landing-text.ts, whose words are placeholders that 05-story rewrites:
// an id must never change with the wording.
export function podTag(pod: number): string {
  return `pod${String(pod).padStart(2, '0')}`;
}

export function driverSegId(pod: number): string {
  return `driver_${podTag(pod)}`;
}
