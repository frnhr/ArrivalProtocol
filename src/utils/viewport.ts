const MOBILE_MAX = 768;
const NARROW_MAX = 400;

export function isMobileViewport(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches;
}

export function getMemoryBlocksPerRow(): number {
  const w = window.innerWidth;
  if (w <= NARROW_MAX) return 16;
  if (w <= MOBILE_MAX) return 32;
  return 64;
}

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX}px)`;
