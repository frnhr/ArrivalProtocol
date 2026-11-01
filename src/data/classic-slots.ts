// The classic five's places (slice 3a review follow-up B2, M4): a leaf module (no imports), so the map's leaf readers
// (systems/map-streams.ts worldSlotOf, isEndSlot) can use it from anywhere in the import graph; data/classic-five.ts
// re-exports and validates it. Frozen with the classic five (lead only).

// The classic world's slot is the ship's index (0–4), not an arm world id: these are the arm worlds the five sit on
// (ARES-VII Kepler-186f w0, HALCYON Tessaly w2, KESTREL Brine w5, VESPER Cinder w11, LAST LIGHT New Haven w19). Every
// geometry call on the classic world goes through them (worldSlotOf); the classic rng keys stay index-based.
export const CLASSIC_WORLD_SLOTS: readonly number[] = [0, 2, 5, 11, 19];

// The classic world's final ship: LAST LIGHT, the last of the five.
export const CLASSIC_FINAL_INDEX = 4;
