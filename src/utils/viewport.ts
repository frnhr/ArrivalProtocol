const MOBILE_MAX = 768;
const NARROW_MAX = 400;

export function isMobileViewport(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches;
}

// Row width tracks viewport. 32 (0x20) on mobile aligns rows to hex address
// boundaries so segments laid out on 0x20 multiples don't split mid-row.
// Desktop keeps 64 (0x40) for the same reason at higher density.
export function getMemoryBlocksPerRow(): number {
  const w = window.innerWidth;
  if (w <= NARROW_MAX) return 32;
  if (w <= MOBILE_MAX) return 32;
  return 64;
}

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX}px)`;
