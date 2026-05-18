// Operation timing/cancellation engine.
//
// startOp() spawns floating .op-progress bars docked over each visual part of the
// target segment. For split segments, the fill advances sequentially across parts
// so it reads as one continuous bar even when the file wraps a row.
//
// Optional `shrinkers` represent in-place source DOM that should "disappear" as
// the op progresses (used by move/copy phantom animations).
//
// Active op records are tracked in a module-private Map so the split-file hover
// overlay can mirror an in-flight op's progress bar — see getActiveOp().

interface OpBar {
  el: HTMLElement;
  fill: HTMLElement;
  startFrac: number;
  endFrac: number;
}

export interface OpShrinker {
  el: HTMLElement;
  partSize: number;
  isPhantom?: boolean;
}

export interface OpRecord {
  segId: string;
  label: string;
  icon: string;
  dur: number;
  bars: OpBar[];
  overlayBar: HTMLElement | null;   // mutated by split-overlay code
  startTime: number | null;
  canceled: boolean;
  timer: ReturnType<typeof setInterval> | null;
  currentPct: number;
}

export interface StartOpOpts {
  segId: string;
  fromX: number;
  fromY: number;
  targetEls: HTMLElement[];
  label: string;
  icon: string;
  dur: number;
  reverseFill?: boolean;
  shrinkers?: OpShrinker[];
  onComplete?: () => void;
  onCancel?: () => void;
}

export interface OpHandle {
  cancel: () => void;
}

const activeOps = new Map<string, OpRecord>();

export function getActiveOp(segId: string): OpRecord | undefined {
  return activeOps.get(segId);
}

export function startOp(opts: StartOpOpts): OpHandle {
  const {
    segId, fromX, fromY, targetEls, label, icon, dur,
    reverseFill = false, shrinkers, onComplete, onCancel,
  } = opts;

  const totalSize = targetEls.reduce((sum, te) => sum + parseInt(te.dataset.partSize ?? '0', 10), 0);

  // Shrinker fractions: which slice of the global timeline each part is "active" for.
  // Forward moves consume shrinkers from the tail (rightmost), backward from the head.
  let shrinkerInfo: Map<number, { startFrac: number; endFrac: number }> | null = null;
  if (shrinkers && shrinkers.length) {
    const totalShrink = shrinkers.reduce((sum, sh) => sum + sh.partSize, 0);
    const order = reverseFill
      ? shrinkers.map((_, i) => shrinkers.length - 1 - i)
      : shrinkers.map((_, i) => i);
    shrinkerInfo = new Map();
    let cum = 0;
    order.forEach((idx) => {
      const ps = shrinkers[idx]!.partSize;
      shrinkerInfo!.set(idx, { startFrac: cum / totalShrink, endFrac: (cum + ps) / totalShrink });
      cum += ps;
    });
  }

  // Place icon/label/cancel on the biggest part so they stay readable + clickable
  // even when the leading or trailing part is only a column or two wide.
  let primaryIdx = 0;
  let maxPartSize = 0;
  targetEls.forEach((te, i) => {
    const ps = parseInt(te.dataset.partSize ?? '0', 10);
    if (ps > maxPartSize) { maxPartSize = ps; primaryIdx = i; }
  });

  // Fill sequence: backward fills bars in DOM order; forward fills last-to-first
  // (the tail block "arrives" first at the destination — memmove tail-first semantics).
  const fillOrder = reverseFill
    ? targetEls.map((_, i) => targetEls.length - 1 - i)
    : targetEls.map((_, i) => i);
  const fractionByIdx = new Map<number, { startFrac: number; endFrac: number }>();
  let cumOrdered = 0;
  fillOrder.forEach((idx) => {
    const ps = parseInt(targetEls[idx]!.dataset.partSize ?? '0', 10);
    fractionByIdx.set(idx, { startFrac: cumOrdered / totalSize, endFrac: (cumOrdered + ps) / totalSize });
    cumOrdered += ps;
  });

  const bars: OpBar[] = [];
  targetEls.forEach((te, i) => {
    const fr = fractionByIdx.get(i)!;
    const el = document.createElement('div');
    el.className = 'op-progress';
    if (reverseFill) el.classList.add('reverse-fill');
    if (i !== primaryIdx) el.classList.add('op-continuation');
    el.innerHTML = i === primaryIdx
      ? `<div class="op-fill"></div><span class="op-icon">${icon}</span><span class="op-label">${label}</span><span class="op-cancel" title="Cancel">×</span>`
      : `<div class="op-fill"></div>`;
    document.body.appendChild(el);

    // Initial position at cursor — only the primary bar needs natural width to dock from.
    el.style.left = fromX + 'px';
    el.style.top = fromY + 'px';
    if (i === primaryIdx) {
      el.style.width = el.offsetWidth + 'px';
    } else {
      el.style.width = '8px';
    }
    el.getBoundingClientRect();   // force reflow before the dock transition

    const rect = te.getBoundingClientRect();
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    el.style.width = rect.width + 'px';

    const fill = el.querySelector<HTMLElement>('.op-fill')!;
    bars.push({ el, fill, startFrac: fr.startFrac, endFrac: fr.endFrac });
  });

  const record: OpRecord = {
    segId, label, icon, dur,
    bars,
    overlayBar: null,
    startTime: null,
    canceled: false,
    timer: null,
    currentPct: 0,
  };

  function fadeOut(): void {
    const elsToFade: HTMLElement[] = bars.map((b) => b.el);
    if (record.overlayBar) elsToFade.push(record.overlayBar);
    elsToFade.forEach((el) => {
      el.style.transition = 'opacity 0.22s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 240);
    });
    if (shrinkers) {
      shrinkers.forEach((sh) => {
        if (sh.isPhantom) {
          sh.el.style.transition = 'opacity 0.22s';
          sh.el.style.opacity = '0';
          setTimeout(() => sh.el.remove(), 240);
        } else {
          // Actual in-memory DOM — just clear the clip; render() will replace anyway.
          sh.el.style.clipPath = '';
        }
      });
    }
    record.overlayBar = null;
  }

  const primaryBar = bars[primaryIdx]!;
  const cancelBtn = primaryBar.el.querySelector<HTMLElement>('.op-cancel')!;
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (record.canceled) return;
    record.canceled = true;
    if (record.timer) clearInterval(record.timer);
    activeOps.delete(segId);
    fadeOut();
    onCancel?.();
  });

  setTimeout(() => {
    if (record.canceled) return;
    record.startTime = Date.now();
    record.timer = setInterval(() => {
      if (record.canceled) return;
      const elapsed = Date.now() - record.startTime!;
      const p = Math.min(100, (elapsed / dur) * 100);
      record.currentPct = p;
      const globalFrac = p / 100;
      bars.forEach((b) => {
        let local: number;
        if (globalFrac <= b.startFrac) local = 0;
        else if (globalFrac >= b.endFrac) local = 100;
        else local = ((globalFrac - b.startFrac) / (b.endFrac - b.startFrac)) * 100;
        b.fill.style.width = local + '%';
      });
      if (record.overlayBar) {
        const overlayFill = record.overlayBar.querySelector<HTMLElement>('.op-fill');
        if (overlayFill) overlayFill.style.width = p + '%';
      }
      if (shrinkers && shrinkerInfo) {
        shrinkers.forEach((sh, i) => {
          const fr = shrinkerInfo!.get(i);
          if (!fr) return;
          let visible: number;
          if (globalFrac <= fr.startFrac) visible = 1;
          else if (globalFrac >= fr.endFrac) visible = 0;
          else visible = 1 - (globalFrac - fr.startFrac) / (fr.endFrac - fr.startFrac);
          const clip = (1 - visible) * 100;
          // Forward: clip from right (tail disappears first); backward: clip from left.
          sh.el.style.clipPath = reverseFill
            ? `inset(0 ${clip}% 0 0)`
            : `inset(0 0 0 ${clip}%)`;
        });
      }
      if (p >= 100) {
        clearInterval(record.timer!);
        record.timer = null;
        activeOps.delete(segId);
        fadeOut();
        onComplete?.();
      }
    }, 40);
  }, 420);

  activeOps.set(segId, record);
  return { cancel: () => cancelBtn.click() };
}
