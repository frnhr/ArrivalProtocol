// Playtest 1, B-VOICE (playtest-1-plan §3.2): which PAL a run has. Run 1 is the authored first run and always CHIPPER, as
// is any run that plays the run-1 lessons again (run.tutorial). From run 2 the preset is derived from the run seed, on a
// stream of its own, so it is the same at every ship and after a resume, and needs nothing in the save.
// ?debug's __ap.persona(id) overrides it for the page (null gives the derived one back).
import type { RunState } from '@state/schema';
import { createRng, hashSeed } from '@systems/rng';
import { COMPANION_LINES, PERSONAS, type CompanionLines, type Persona } from '@data/companion-text';

// What the pick reads of a run: its seed, whether it plays the run-1 lessons, and its number on the arm.
export type PersonaRun = Readonly<Pick<RunState, 'seed' | 'tutorial'>> & { readonly map: Readonly<Pick<RunState['map'], 'run'>> };

let override: Persona | null = null;

export function derivedPersona(run: PersonaRun): Persona {
  if (run.map.run <= 1 || run.tutorial) return 'chipper';
  const roll = createRng(hashSeed(`persona:${run.seed >>> 0}`))();
  return PERSONAS[Math.min(PERSONAS.length - 1, Math.floor(roll * PERSONAS.length))]!;
}

export function personaOf(run: PersonaRun): Persona {
  return override ?? derivedPersona(run);
}

// The run's PAL lines.
export function palLines(run: PersonaRun): CompanionLines {
  return COMPANION_LINES[personaOf(run)];
}

// ?debug only (debug.ts __ap.persona).
export function setPersonaOverride(persona: Persona | null): void {
  if (persona !== null && !PERSONAS.includes(persona)) throw new Error(`setPersonaOverride: no persona '${String(persona)}'`);
  override = persona;
}
