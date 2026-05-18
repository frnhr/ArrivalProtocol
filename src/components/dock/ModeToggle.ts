// Tools/Memory mode toggle in the lower-left dock. Lives outside the store
// because the body class drives a pure CSS reskin — no subscribers need to know.
// (When future state cares about mode, promote to state.ui.mode.)
export function mountModeToggle(): () => void {
  const toggle = document.getElementById('modeToggle');
  if (!toggle) return () => {};

  function onClick(ev: MouseEvent): void {
    const opt = (ev.target as HTMLElement | null)?.closest<HTMLElement>('.mode-toggle-opt');
    if (!opt) return;
    document.querySelectorAll('.mode-toggle-opt').forEach((o) => o.classList.remove('active'));
    opt.classList.add('active');
    document.body.classList.toggle('mode-memory', opt.dataset.mode === 'memory');
  }

  toggle.addEventListener('click', onClick);
  return () => toggle.removeEventListener('click', onClick);
}
