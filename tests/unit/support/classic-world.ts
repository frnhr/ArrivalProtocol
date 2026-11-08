// Track RETIRE (slice-4cde-plan §9.2): a suite the retirement has not moved to run 1's arm yet imports this FIRST, before
// any harness, so every state it builds with no map is on the classic five (state/initial.ts useClassicFixture), as before
// the default became the arm. Each importer is a suite left to migrate; the classic five go once none is left.
import { useClassicFixture } from '@state/initial';

useClassicFixture();
