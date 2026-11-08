// Slice 7c FOUNDATION scaffolding (docs/phase3/impl/slice-7-plan.md §5.3), as slices 4, 4c–4e, 5, 6, 7a and 7b had it: the
// stubs whose entry points change state throw through this, naming the function and the track that owns it, so a caller
// that reaches one too early fails loudly. Stubs on a hot path (the boot's line plan, the arrival's charge and seeds, the
// hunt, the card rows, the chart) return a neutral answer instead and never come here. Every argument is passed in, so a
// stub's final signature compiles under noUnusedParameters with its real parameter names. The batch's fix pass deletes this
// file once no stub is left (grep notBuilt).
export type Track = 'TRACE' | 'LINEAGE' | 'CHART';

export function notBuilt(what: string, track: Track, ...args: readonly unknown[]): never {
  throw new Error(`${what}: not built (Track ${track}; slice 7 plan §5.3, ${args.length} argument(s))`);
}
