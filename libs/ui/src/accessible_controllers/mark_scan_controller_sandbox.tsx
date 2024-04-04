import { MarkScanControllerButton } from './types';
import {
  AccessibleControllerHelpStrings,
  AccessibleControllerSandbox,
} from './accessible_controller_sandbox';
import { MarkScanControllerIllustration } from './mark_scan_controller_illustration';
import { Keybinding } from '../keybindings';

const FEEDBACK_STRING_KEYS: AccessibleControllerHelpStrings<MarkScanControllerButton> =
  {
    [Keybinding.FOCUS_NEXT]: 'helpBmdControllerButtonFocusNext',
    [Keybinding.FOCUS_PREVIOUS]: 'helpBmdControllerButtonFocusPrevious',
    [Keybinding.PAGE_NEXT]: 'helpBmdControllerButtonPageNext',
    [Keybinding.PAGE_PREVIOUS]: 'helpBmdControllerButtonPagePrevious',
    [Keybinding.PLAYBACK_RATE_DOWN]: 'helpBmdControllerButtonPlaybackRateDown',
    [Keybinding.PLAYBACK_RATE_UP]: 'helpBmdControllerButtonPlaybackRateUp',
    [Keybinding.SELECT]: 'helpBmdControllerButtonSelect',
    [Keybinding.TOGGLE_HELP]: 'helpBmdControllerButtonToggleHelp',
    [Keybinding.TOGGLE_PAUSE]: 'helpBmdControllerButtonTogglePause',
    [Keybinding.VOLUME_DOWN]: 'helpBmdControllerButtonVolumeDown',
    [Keybinding.VOLUME_UP]: 'helpBmdControllerButtonVolumeUp',
  };

export function MarkScanControllerSandbox(): JSX.Element {
  return (
    <AccessibleControllerSandbox
      feedbackStringKeys={FEEDBACK_STRING_KEYS}
      illustration={MarkScanControllerIllustration}
      introAudioStringKey="instructionsBmdControllerSandboxMarkScan"
    />
  );
}
