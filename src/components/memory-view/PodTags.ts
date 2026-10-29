import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { podTags } from '@systems/landing-hud';

// The BAY / NEXT tags on the drivers' chips (01-landing §3.4, §4): the next launchable drivers the bay holds a slot
// for read BAY, the very next one NEXT (landing-hud podTags). The tag changes without a memory change (a reload, a
// repair finishing, LOAD NEXT), and the strip rebuilds its chips on every memory change, so this paints the chips'
// tag slots (`[data-pod-tag]`, SegmentBlock) on either: mount it after MemoryStrip, so it runs after a rebuild.

function tagKey(state: Readonly<GameState>): string {
  return [...podTags(state)].map(([pod, tag]) => `${pod}:${tag}`).join(',');
}

export function mountPodTags(store: Store<GameState>, memWrap: HTMLElement): () => void {
  function paint(): void {
    const tags = podTags(store.getState());
    memWrap.querySelectorAll<HTMLElement>('[data-pod-tag]').forEach((slot) => {
      const tag = tags.get(Number(slot.dataset.podTag)) ?? null;
      const text = tag ?? '';
      if (slot.textContent !== text) slot.textContent = text;
      const cls = `drv-tag${tag === null ? '' : ` tag-${tag.toLowerCase()}`}`;
      if (slot.className !== cls) slot.className = cls;
    });
  }
  const unsub = store.subscribe((s) => `${s.ui.memoryRev}|${s.run.phase}|${tagKey(s)}`, paint);
  paint();
  return unsub;
}
