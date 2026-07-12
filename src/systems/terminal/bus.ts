// Message bus between the terminal engine, the Terminal component, and the Assistant
// panel. Keeps the three decoupled: the engine emits lines without knowing where they
// render; the panel asks the terminal to type without importing it.
//
// Routing rule: 'aux'-voice lines belong to the ASSISTANT (chat bubbles in its panel);
// everything else belongs to the terminal log. If no panel is mounted the aux lines fall
// back to the log with the ✦ aux: prefix so nothing is ever lost.

import type { TermLine } from '@systems/terminal/engine';

type LineSink = (lines: TermLine[]) => void;
type AuxSink = (texts: string[]) => void;
type Typer = (cmd: string) => void;

let logSink: LineSink | null = null;
let auxSink: AuxSink | null = null;
let typer: Typer | null = null;

export function setLogSink(fn: LineSink | null): void { logSink = fn; }
export function setAuxSink(fn: AuxSink | null): void { auxSink = fn; }
export function setTyper(fn: Typer | null): void { typer = fn; }

// Split a batch: aux lines → assistant chat, the rest → terminal log (order preserved
// within each destination).
export function routeLines(lines: TermLine[]): void {
  if (lines.length === 0) return;
  const aux: string[] = [];
  const log: TermLine[] = [];
  for (const line of lines) {
    if (line.voice === 'aux') {
      if (auxSink) aux.push(line.text);
      else log.push({ voice: 'aux', text: `✦ aux: ${line.text}` });
    } else {
      log.push(line);
    }
  }
  if (log.length > 0) logSink?.(log);
  if (aux.length > 0) auxSink?.(aux);
}

// Ask the terminal to have the assistant visibly type + submit a command. No-op when the
// terminal isn't mounted.
export function assistantType(cmd: string): void { typer?.(cmd); }
