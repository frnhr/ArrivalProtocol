// Dev-only assertions (text length, guidance coverage, memory invariants) run in the Vite dev
// server and in every headless test. Vite statically replaces import.meta.env; under tsx
// (the headless harness) it does not exist, and those runs are tests, so they count as dev.
export const IS_DEV: boolean = import.meta.env === undefined ? true : import.meta.env.DEV;
