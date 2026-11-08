// Slice 6 FOUNDATION scaffolding (docs/phase3/impl/slice-6-plan.md §6.1 item 6), as slices 4, 4c–4e and 5 had it: the stubs
// whose entry points change state throw through this, naming the function and the track that owns it, so a caller that
// reaches one too early fails loudly. Stubs on a hot path (the machine's mount, the Skills row's status, the assign check the
// UI asks on every paint, the HUD models) return a neutral answer instead and never come here. Every argument is passed in,
// so a stub's final signature compiles under noUnusedParameters with its real parameter names. The batch's fix pass deletes
// this file once no stub is left (grep notBuilt).
export type Track = 'SWATH' | 'SITES';

export function notBuilt(what: string, track: Track, ...args: readonly unknown[]): never {
  throw new Error(`${what}: not built (Track ${track}; slice 6 plan §6.2, ${args.length} argument(s))`);
}
