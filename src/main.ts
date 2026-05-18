// Style import order matters: tokens first so modes can override them.
import './styles/tokens.css';
import './styles/modes.css';
import './styles/reset.css';
import './styles/base.css';
import './styles/glitch.css';
import './styles/legacy-components.css';

// Legacy entry point — boots the prototype's UI. Progressively shrinking
// as each subsystem is extracted into proper modules.
import './legacy/legacy';

// Systems and components extracted out of legacy. Must run after legacy executes
// (which builds the initial DOM and seeds the store).
import { store } from '@state/instance';
import { mountGlitchDriver } from '@systems/glitch';
import { mountClock } from '@systems/clock';
import { mountModeToggle } from '@components/dock/ModeToggle';
import { mountDockItems } from '@components/dock/Dock';
import { mountTimeControls } from '@components/header/TimeControls';
import { mountAllWindows } from '@components/window/Window';
import { mountEngineWindow } from '@components/tools-view/EngineWindow';
import { mountMemoryStats } from '@components/memory-view/MemoryStats';
import { mountFooter } from '@components/footer/Footer';

mountGlitchDriver(store);
mountClock(store);
mountModeToggle();
mountDockItems();
mountTimeControls(store);
mountAllWindows();
mountEngineWindow();
mountMemoryStats(store);
mountFooter(store);
