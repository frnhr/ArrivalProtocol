// Track RETIRE (slice-4cde-plan §9.2): a suite the retirement has not moved to run 1's arm yet imports this FIRST, before
// any harness, so every state it builds with no map is on the classic five (state/initial.ts useClassicFixture), as before
// the default became the arm. Each importer is a suite left to migrate; the classic five go once none is left.
// AP_RETIRE_PROBE=arm leaves the default alone, so `AP_RETIRE_PROBE=arm node tests/unit/run.mjs <suite>` shows how far a
// suite left here gets on the arm (the probe that sorted them).
import { useClassicFixture } from '@state/initial';

if (process.env.AP_RETIRE_PROBE !== 'arm') useClassicFixture();
