// The phase-2 suites name colonists by their cluster's code (`C09`); a pod's driver sits where cluster N sat (POD N, in
// address order), so the old codes map onto pods by their number. `C09`, `P09` and `POD 09` all name pod 9.
// Slice 1a F2 stopgap so the old suites typecheck; Track TESTS decides what stays.
export function podNumber(code: string): number {
  const match = /^(?:C|P|POD\s*)(\d+)$/i.exec(code.trim());
  if (!match) throw new Error(`podNumber: '${code}' is not a pod code (C09, P09, POD 09)`);
  return Number(match[1]);
}

export function isPodCode(pod: number, code: string): boolean {
  return pod === podNumber(code);
}
