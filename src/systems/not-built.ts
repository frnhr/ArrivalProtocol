// Slice 5 FOUNDATION scaffolding (docs/phase3/impl/slice-5-plan.md §6.1 item 5), as slices 4 and 4c–4e had it: the stubs
// whose entry points change state throw through this, naming the function and the track that owns it, so a caller that
// reaches one too early fails loudly. Stubs on a hot path (the ghost spec, the deal check, the resolver, the tool rules,
// the record's fates, the HUD models) return a neutral answer instead and never come here. Every argument is passed in, so a
// stub's final signature compiles under noUnusedParameters with its real parameter names. The batch's fix pass deletes this
// file once no stub is left (grep notBuilt).
export type Track = 'WARDEN' | 'KIN' | 'FACE';

export function notBuilt(what: string, track: Track, ...args: readonly unknown[]): never {
  throw new Error(`${what}: not built (Track ${track}; slice 5 plan §6.2, ${args.length} argument(s))`);
}
