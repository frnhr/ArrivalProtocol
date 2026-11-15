// Style import order matters: tokens first so modes can override them.
import './styles/tokens.css';
import './styles/modes.css';
import './styles/reset.css';
import './styles/base.css';
import './styles/glitch.css';
import './styles/legacy-components.css';
import './styles/game.css';
import './styles/landing.css';
import './styles/threat.css';
import './styles/desk.css';
import './styles/leave.css';
import './styles/self-check.css';
import './styles/ending.css';
import './styles/night.css';
import './styles/responsive.css';
import './styles/resident.css';
import './styles/survey.css';
import './styles/polish.css';

import { store } from '@state/instance';
import { getByRole, getSegmentById } from '@state/selectors';
import type { Segment } from '@/types/segment';
import { mountGlitchDriver } from '@systems/glitch';
import { mountClock } from '@systems/clock';
import { mountOrbitSim } from '@systems/orbit-sim';
import { mountPredictor } from '@systems/predict';
import { mountPace } from '@systems/pace';
import { mountInput, blurButtonsOnPointerUp, emitUiClicks } from '@systems/input';
import { mountSay } from '@systems/say';
import { mountFlightEvents } from '@systems/flight-events';
import { mountGhostThrust } from '@systems/ghost-thrust';
import { mountHollowDeal } from '@systems/hollow-deal';
import { mountResidents } from '@systems/residents';
import { mountSurvey } from '@systems/survey';
import { mountHollowVerbs } from '@systems/hollow-verbs';
import { mountFinale } from '@systems/finale';
import { mountLastLanding } from '@systems/last-landing';
import { mountDirector } from '@systems/director';
import { mountBoot } from '@systems/boot';
import { unlockAudio } from '@systems/audio';
import { mountAudioCues } from '@systems/audio-cues';
import { mountDebug } from '@/debug';
import { mountModeToggle } from '@components/dock/ModeToggle';
import { mountSidebarFilters } from '@components/dock/SidebarFilters';
import { mountTimeControls } from '@components/header/TimeControls';
import { mountAllWindows } from '@components/window/Window';
import { mountEngineWindow } from '@components/tools-view/EngineWindow';
import { mountNavPlotWindow } from '@components/tools-view/NavPlotWindow';
import { mountGroundTrack } from '@components/tools-view/GroundTrack';
import { mountPodBayWindow } from '@components/tools-view/PodBayWindow';
import { mountTelemetryWindow } from '@components/tools-view/TelemetryWindow';
import { mountToolsTabs } from '@components/tools-view/ToolsTabs';
import { mountPhoneFlightBar } from '@components/tools-view/PhoneFlightBar';
import { mountWindowGrips } from '@components/tools-view/WindowGrip';
import { mountMemoryStats } from '@components/memory-view/MemoryStats';
import { mountFooter } from '@components/footer/Footer';
import { mountBurnResult } from '@components/burn/BurnResult';
import { mountLandingReport } from '@components/run/LandingReport';
import { mountObjectiveStrip } from '@components/hud/ObjectiveStrip';
import { mountStamps } from '@components/hud/Stamp';
import { mountJuice } from '@components/hud/Juice';
import { mountMiniHud } from '@components/hud/MiniHud';
import { mountMiniStrip } from '@components/hud/MiniStrip';
import { mountCommsWindow } from '@components/comms/CommsWindow';
import { mountMindTerminal } from '@components/memory-view/MindTerminal';
import { mountPauseVeil } from '@components/hud/PauseVeil';
import { mountTitleCard } from '@components/title/TitleCard';
import { mountFsToolsSystem, applyTool, requestDelete, type ToolDeps } from '@systems/fs-tools';
import { mountOpsCore } from '@systems/ops-core';
import { mountOpBars } from '@components/memory-view/OpBars';
import { mountInlineConfirm, askInline } from '@components/hud/InlineConfirm';
import { mountCursorFollower } from '@components/cursor-follower/CursorFollower';
import { mountMemoryStrip } from '@components/memory-view/MemoryStrip';
import { mountSelectionHighlight } from '@components/memory-view/SelectionHighlight';
import { mountDimPainter } from '@components/memory-view/DimPainter';
import { mountDetailPanel, type DetailActionId } from '@components/memory-view/DetailPanel';
import { mountSplitOverlay } from '@components/memory-view/SplitOverlay';
import { mountPlacement } from '@components/memory-view/Placement';
import { mountFsStatusBar } from '@components/memory-view/FsStatusBar';
import { mountMobileDrawers } from '@components/memory-view/MobileDrawers';
import { mountFsToolPill } from '@components/memory-view/FsToolPill';
import { actionScan, actionRepair } from '@state/actions';
import { mountLicences } from '@systems/licences';
import { mountLanding, setLoadNext } from '@systems/landing';
import { registerLandingKeys, launchConfirmRequest, type LaunchConfirm } from '@systems/landing-controls';
import { mountDropCache } from '@systems/drop-cache';
import { mountFaults } from '@systems/faults';
import { mountHollow } from '@systems/hollow';
import { mountZones } from '@systems/zones';
import { mountAutoburn, registerAutoburnKeys } from '@systems/autoburn';
import { mountHollowPainter } from '@components/memory-view/HollowPainter';
import { mountRun } from '@systems/run';
import { mountStoryLog, openLogReader } from '@systems/story-log';
import { logEntryToOpen } from '@systems/log-view';
import { mountLogReader, mountLogChips } from '@components/memory-view/LogReader';
import { mountTransmitScreen } from '@components/run/TransmitScreen';
import { mountLeaveOrbitScreen } from '@components/run/LeaveOrbitScreen';
import { mountDeskScreen } from '@components/desk/DeskScreen';
import { mountRunEnd } from '@components/run/RunEnd';
import { mountEpilogue } from '@components/run/Epilogue';
import { mountFinalCard } from '@components/run/FinalCard';
import { mountMergeTick } from '@components/memory-view/MergeTick';
import { mountLaunchFx } from '@components/memory-view/LaunchFx';
import { mountPodTags } from '@components/memory-view/PodTags';
import { mountSelfCheck } from '@components/memory-view/SelfCheck';
import { mountFinaleChoice } from '@components/run/FinaleChoice';
import { mountLastLandingView } from '@components/run/LastLanding';
import { mountSkillsWindow } from '@components/run/SkillsWindow';
import { mountInboxWindow } from '@components/run/InboxWindow';
import { mountSitesWindow } from '@components/tools-view/SitesWindow';
import { mountHollowNameFx } from '@components/memory-view/HollowNameFx';
import { mountMovePreviewLabels } from '@components/memory-view/MovePreviewLabels';
import { mountRackZoneMarks } from '@components/memory-view/RackZoneMarks';
import { partNumber } from '@components/dom';

// What the tools need from the page: a delete that can't be undone asks through the inline
// confirm pill.
const toolDeps: ToolDeps = {
  ask: askInline,
};

// [L]'s guards (DOT OFF-SITE · LAUNCH ANYWAY? …, LZ-A IS FULL · LAND IT ANYWAY? …) through the same inline confirm, centred
// (landing-controls.ts launchConfirmRequest, playtest 1 note 23).
const launchConfirm: LaunchConfirm = (text, onYes) => askInline(launchConfirmRequest(text, onYes));

// DetailPanel action buttons dispatch through this. The actions re-check everything at the click
// (pause, operating, the target rules, a free thread), exactly as for a tool click. (SWAP is a tool
// file since WP10: it is picked up like any tool, not a button here.) A panel rebuild can wait for a
// press to land (guardPresses), so the file may have left memory under the button (launched): the
// click then has nothing to act on.
function runAction(shown: Segment, action: DetailActionId): void {
  const seg = getSegmentById(store.getState(), shown.id);
  if (!seg) return;
  if (action === 'repair') actionRepair(store, seg);
  else if (action === 'delete_charge') requestDelete(store, seg, toolDeps);
  else if (action === 'scan') actionScan(store, seg);
  else if (action === 'load-next' && seg.type === 'driver') setLoadNext(store, seg.pod);
  else if (action === 'read-log') {
    // INSPECT's READ on 046.log (slice 2): the reader opens on the entry left unread, else the last found.
    const entry = logEntryToOpen(store.getState());
    if (entry !== null) openLogReader(store, entry);
  }
}

// World systems first, in tick order: orbit-sim integrates, the predictor reads the fresh
// state, and pace (pre-tick) reads the predictor on the next tick. Then the voice and the
// post-tick chain: the boot, flight events (the moments of this tick), the director (acts on
// them) and the sound. Painters come after.
mountGlitchDriver(store);
mountOrbitSim(store);
// After orbit-sim: scripted faults read the thrust each tick delivered (WP4), and the hazard zones the path it
// swept (WP9).
mountFaults(store);
mountZones(store);
mountPredictor(store);
// After the predictor: the live drop solution (the brackets, the dot, the windows) is refreshed at the same PREDICT_HZ.
mountDropCache(store);
mountPace(store);
// The mind's ops, on AI time (WP3).
mountOpsCore(store);
// The landing (slice 1a) after the ops each tick (a launch aborts any op still on its driver). [L] launches.
mountLanding(store);
registerLandingKeys(store, { confirm: launchConfirm });
// HOLLOW (WP6) after the landing: a launch beats a bite in the same tick, and a repair heals before
// the drain (the ops core ticks first).
mountHollow(store);
// WP10: THE DEAL, after HOLLOW (this tick's bite is in before it looks at the front).
mountHollowDeal(store);
// Slice 5: the residents (systems/residents.ts), right after THE DEAL: their AI ticks run after HOLLOW's and its deal's.
mountResidents(store);
// Slice 6: SURVEY (systems/survey.ts), right after the residents: after the landing and the ops core in the tick.
mountSurvey(store);
// WP11: HOLLOW's verbs after it (a bite or a seed of this tick is in before a verb aims), then LAST LIGHT's finale (the
// root's DELETE completes in the ops core's tick, so the finale sees the last block standing in the same one).
mountHollowVerbs(store);
mountFinale(store);
// Slice 7b: THE LAST LANDING after MERGE (systems/last-landing.ts, Track DROP): its 'merge' controller resolver, after the
// FINALE that starts it.
mountLastLanding(store);
// The run (WP7): the stats, BEAM OUT's bar on world time, and the soft fails' bookkeeping.
mountRun(store);
// Phase 3 slice 2: 046.log through the run (the keys at the boots, the SCAN, the reader after ship 1's report).
mountStoryLog(store);
mountInput(window);
blurButtonsOnPointerUp(document);
emitUiClicks(document);
mountSay(store);
// unlockAudio runs inside the gesture that receives the transmission (click, SPACE or ENTER).
mountBoot(store, { onReceive: unlockAudio });
mountFlightEvents(store);
// WP10: the engine firing by itself, as the ship tells it (the first burst's alarm, the counter) and a SKIP re-planned
// after a later burst it flew through; before the director, whose alarm line reads the alert.
mountGhostThrust(store);
// WP9: AUTOBURN acts on this tick's fresh state, before the director composes the line about it. [B] toggles it,
// from either screen (so does the Engine window's AUTO button).
mountAutoburn(store);
registerAutoburnKeys(store);
mountDirector(store);
// After the director: a licence can be due because of the line it just chose (WP4).
mountLicences(store);
mountAudioCues(store);
mountDebug(store);
mountModeToggle(store);
mountTimeControls(store);
mountAllWindows();
mountToolsTabs();
mountEngineWindow(store);
// Slice 1a: the POD BAY window (its launch button is playerLaunch, as [L]), before the phone bar takes that button.
mountPodBayWindow(store, { confirm: launchConfirm });
// After the Engine window has wired its controls: on a phone they move into the touch flight bar (WP12).
mountPhoneFlightBar();
mountNavPlotWindow(store);
// Under the NAV PLOT while landing: the GROUND TRACK (01-landing §4).
mountGroundTrack(store);
mountTelemetryWindow(store);
mountCommsWindow(store);
// WP8: the cards this unit carries (the dock's SYSTEM item).
mountSkillsWindow(store);
// Slice 3b: the INBOX (the dock's SYSTEM item), read in flight and between ships.
mountInboxWindow(store);
// Slice 6: the SITES window (Track SITES's).
mountSitesWindow(store);
mountMindTerminal(store);
mountWindowGrips(store);
// After the windows: the strip lights the controls its line names ([data-hint-key]).
mountObjectiveStrip(store);
mountPauseVeil(store);
mountStamps(store);
mountJuice(store);
mountMiniHud(store);
// The memory at a glance from the ship, inside the MIND chip (WP6).
mountMiniStrip(store);

// SplitOverlay handle is needed by segBehavior, so mount it before MemoryStrip.
const memWrap = document.getElementById('memWrap');
if (!memWrap) throw new Error('memWrap container missing from DOM');
const splitOverlay = mountSplitOverlay(memWrap);

// Click decides apply-vs-select; hover drives split-overlay. Placement updates
// flow through the fs-tools system's mousemove → placement bridge.
// The strip holds a rebuild while a press is down (guardPresses), so a click can land on a chip
// whose file left memory under it (launched, merged free space): it is resolved by id first.
const segBehavior = {
  onClick: (shown: Segment, event: MouseEvent): void => {
    const seg = getSegmentById(store.getState(), shown.id);
    if (!seg) return;
    if (store.getState().ui.activeTool) {
      event.stopPropagation();
      applyTool(store, seg, toolDeps);
    } else {
      // Toggle: clicking the currently-selected segment deselects.
      const alreadySelected = store.getState().ui.selectedId === seg.id;
      store.update((draft) => { draft.ui.selectedId = alreadySelected ? null : seg.id; });
    }
  },
  onMouseEnter: (seg: Segment, part: HTMLElement): void => {
    if (partNumber(part, 'totalParts') > 1 && partNumber(part, 'partIdx') === 0 && seg.type !== 'free') splitOverlay.show(seg);
  },
  onMouseLeave: (seg: Segment): void => splitOverlay.hide(seg.id),
};

// Click on background area of memWrap (address labels, empty space below rows)
// deselects. Clicks on .seg elements bubble through, but closest() finds the
// seg and we ignore them — the seg's own handler already ran.
memWrap.addEventListener('click', (event) => {
  if (store.getState().ui.activeTool) return;
  if ((event.target as HTMLElement).closest('.seg')) return;
  if (store.getState().ui.selectedId === null) return;
  store.update((draft) => { draft.ui.selectedId = null; });
});

// Mount order matters for store-notify cascade:
//   1. MemoryStrip rebuilds DOM (always-false equals → fires every notify)
//   2. SelectionHighlight + fs-tools target classes repaint .seg classes
//      (must subscribe AFTER MemoryStrip so they run after the rebuild)
//   3. DetailPanel, MemoryStats, FsStatusBar, Footer — independent of .seg classes
mountMemoryStrip(store, memWrap, segBehavior);
// After the strip: the bars re-dock onto its rebuilt parts, and the drivers' BAY / NEXT tags repaint (slice 1a).
mountOpBars(store, memWrap);
mountPodTags(store, memWrap);
// Playtest 1 (C-UNROLL): the boot's SELF-CHECK paints the rebuilt parts too.
mountSelfCheck(store, memWrap);
mountFsToolsSystem(store);
mountSelectionHighlight(store);
mountDimPainter(store);
mountCursorFollower(store);
mountDetailPanel(store, { onAction: runAction });
mountMemoryStats(store);
mountFsStatusBar(store);
mountMobileDrawers();
mountFsToolPill(store);
mountInlineConfirm();
mountSidebarFilters(store);
mountFooter(store);
mountBurnResult(store);
// The end of a landed ship: the count and the stars (placeholder until the real LANDING REPORT).
mountLandingReport(store);
// Between ships and after the run (WP7): the packet for the link, and the run's end.
mountDeskScreen(store);
mountLeaveOrbitScreen(store);
mountTransmitScreen(store);
mountRunEnd(store);
// Slice 7a (R19): the night after the RUN TALLY (Track NIGHT's screens).
mountEpilogue(store);
mountFinalCard(store);
// Slice 2: the LOG READER, over TRANSMIT or the game (05 §4).
mountLogReader(store);
// WP11: LAST LIGHT's choice, once the root's DELETE has left its last block.
mountFinaleChoice(store);
// Slice 7b: THE LAST LANDING's header strip and hint over the SHIP view (Track VIEW).
mountLastLandingView(store);
mountPlacement(store, memWrap);
// After the strip: HOLLOW's reach (NEXT BITE, arrows, GAP/WALL), the infection's crawl and readouts,
// the tug's green boundary and HOLLOW's moments are painted onto its rebuilt chips.
mountHollowPainter(store);
// After the strip (slice 2): 046.log's chip, its `3/12` and its glow, from run.log.
mountLogChips(store);
// After the strip (WP11 part 2): the MERGE 20 tick on the REPAIR CHARGE pool and the charge readouts (LAST LIGHT).
mountMergeTick(store, memWrap);
// A launched driver's chip flash (01-landing §4), read from the strip before it rebuilds without the driver.
mountLaunchFx(store);
// After HOLLOW's painter (WP7): its naming decoded on the rebuilt chips, the MOVE preview's labels over the
// placeholder Placement paints, and the arrival's red flashes on the files the crossing hit.
mountHollowNameFx(store);
mountMovePreviewLabels(store);
// After the strip and the mini-strip (WP9): the racks a hazard zone is coming for, tagged and flashed.
mountRackZoneMarks(store);
// After the memory strip: the boot assembles its rows.
mountTitleCard(store);

// The heartbeat starts last, once every system and painter is listening.
mountClock(store);

// Mirror the active selection in the mobile inspect drawer header. Resolves
// the name from store state for picked sources / tool segments first so it
// matches what the detail panel actually renders. Empty string when nothing
// is being inspected (renders nothing on desktop; collapsed header on mobile).
function paintInspectSubtitle(): void {
  const subtitle = document.getElementById('inspectSubtitle');
  if (!subtitle) return;
  const state = store.getState();
  const activeTool = state.ui.activeTool;
  let name = '';
  if (activeTool) {
    const pickedId = state.ui.pickedSourceId;
    const picked = pickedId ? state.memory.find((m) => m.id === pickedId) : null;
    const toolSeg = state.memory.find((m) => m.id === activeTool.toolSegId);
    name = picked?.name ?? toolSeg?.name ?? '';
  } else if (state.ui.selectedId) {
    const seg = state.memory.find((m) => m.id === state.ui.selectedId);
    name = seg?.name ?? '';
  }
  subtitle.textContent = name ? `— ${name}` : '';
}

// Initial selection: the engine's driver file, the first one the ship-1 story points at.
const engine = getByRole(store.getState(), 'engine-io');
if (!engine) throw new Error('main: the seed has no engine-io file');
store.update((draft) => { draft.ui.selectedId = engine.id; });

paintInspectSubtitle();
store.subscribe((s) => s, paintInspectSubtitle, () => false);
