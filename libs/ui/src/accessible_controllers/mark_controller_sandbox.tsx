import type { MarkControllerButton } from './types.js';
import {
  type AccessibleControllerHelpStrings,
  AccessibleControllerSandbox,
} from './accessible_controller_sandbox.js';
import { MarkControllerIllustration } from './mark_controller_illustration.js';
import { Keybinding } from '../keybindings.js';

const FEEDBACK_STRING_KEYS: AccessibleControllerHelpStrings<MarkControllerButton> =
  {
    [Keybinding.FOCUS_NEXT]: 'helpBmdControllerButtonFocusNext',
    [Keybinding.FOCUS_PREVIOUS]: 'helpBmdControllerButtonFocusPrevious',
    [Keybinding.PAGE_NEXT]: 'helpBmdControllerButtonPageNext',
    [Keybinding.PAGE_PREVIOUS]: 'helpBmdControllerButtonPagePrevious',
    [Keybinding.SELECT]: 'helpBmdControllerButtonSelect',
    [Keybinding.TOGGLE_HELP]: 'helpBmdControllerButtonToggleHelp',
    [Keybinding.TOGGLE_PAUSE]: 'helpBmdControllerButtonTogglePause',
    [Keybinding.VOLUME_DOWN]: 'helpBmdControllerButtonVolumeDown',
    [Keybinding.VOLUME_UP]: 'helpBmdControllerButtonVolumeUp',
  };

export function MarkControllerSandbox(): JSX.Element {
  return (
    <AccessibleControllerSandbox
      feedbackStringKeys={FEEDBACK_STRING_KEYS}
      illustration={MarkControllerIllustration}
      introAudioStringKey="instructionsBmdControllerSandboxMark"
    />
  );
}
