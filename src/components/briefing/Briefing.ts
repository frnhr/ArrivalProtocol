import type { Store } from '@state/store';
import type { GameState } from '@state/schema';

// Mission briefing overlay — the run's front door. The game boots into
// burn.status 'briefing' with the clock at 0: the world holds behind this
// (fully blocking) overlay until BEGIN APPROACH commits the run. Fully
// blocking matters: fs-ops advance on game time, so letting the player start
// ops behind a paused clock would freeze progress bars at 0%.
//
// The dock's BRIEFING item reopens it mid-run for reference; reopening pauses
// the clock (a modal over a live burn would be a trap) and the button becomes
// CLOSE — the player resumes time from the header when ready.
//
// Damage is reported as SYMPTOMS, not numbers — integrity is hidden until
// scanned (even the AI's own substrate), so the briefing points at memory
// mode instead of spoiling the diagnosis.

export function mountBriefing(store: Store<GameState>): () => void {
  const root = document.getElementById('briefing');
  const beginBtn = document.getElementById('briefingBegin');
  const dockItem = document.querySelector<HTMLElement>('.dock-item[data-action="briefing"]');
  if (!root || !beginBtn) return () => {};

  // Dynamic copy from mission/level state (band expressed as altitude, matching
  // the NAV PLOT's peri/apo readouts).
  const state = store.getState();
  const { mission } = state;
  const planet = state.level.planet;
  const fmtKm = (km: number): string => Math.round(km).toLocaleString('en-US');
  const fill = (id: string, text: string): void => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  fill('briefTransmission', `TRANSMISSION #${String(mission.transmissionNum).padStart(3, '0')} · ${mission.unitId} → ${mission.shipId}`);
  fill('briefDestination', `${mission.destination} · ${mission.sector} · ${mission.distanceLy} LY FROM EARTH`);
  fill('briefSouls', `${mission.souls.toLocaleString('en-US')} souls in stasis`);
  fill('briefBand', `${fmtKm(planet.rMin - planet.R)}–${fmtKm(planet.rMax - planet.R)} km altitude`);

  function paintDockMark(open: boolean): void {
    if (!dockItem) return;
    dockItem.classList.toggle('open', open);
    const mark = dockItem.querySelector('.mark');
    if (mark) mark.textContent = open ? '●' : '○';
  }

  function show(): void {
    const briefing = store.getState().burn.status === 'briefing';
    if (!briefing) {
      // Reopened mid-run: hold the clock so nothing burns behind the modal.
      store.update((d) => { d.clock.speedTarget = 0; d.clock.speed = 0; });
    }
    beginBtn!.textContent = briefing ? '▶ BEGIN APPROACH' : '✕ CLOSE — CLOCK HELD';
    root!.hidden = false;
    paintDockMark(true);
  }

  function hide(): void {
    root!.hidden = true;
    paintDockMark(false);
  }

  const onBegin = (): void => {
    if (store.getState().burn.status === 'briefing') {
      store.update((d) => {
        d.burn.status = 'approaching';
        d.clock.speedTarget = 1;
        d.clock.speed = 1;
      });
    }
    hide();
  };
  beginBtn.addEventListener('click', onBegin);

  const onDock = (): void => { if (root.hidden) show(); else hide(); };
  dockItem?.addEventListener('click', onDock);

  // Boot state: the overlay is up whenever the run hasn't been committed yet.
  if (store.getState().burn.status === 'briefing') show();
  else hide();

  return () => {
    beginBtn.removeEventListener('click', onBegin);
    dockItem?.removeEventListener('click', onDock);
  };
}
