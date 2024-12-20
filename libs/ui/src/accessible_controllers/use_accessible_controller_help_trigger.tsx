import React from 'react';
import { Keybinding } from '../keybindings';

export interface UseAccessibleControllerHelpTriggerResult {
  shouldShowControllerSandbox: boolean;
}

const IGNORED_MODIFIER_KEY_PRESSES = new Set(['Shift']);

export function useAccessibleControllerHelpTrigger(): UseAccessibleControllerHelpTriggerResult {
  const [shouldShowHelp, setShouldShowHelp] = React.useState(false);
  const [lastKeyPress, setLastKeyPress] = React.useState<string>();

  // Toggles `shouldShowHelp` from `false` to `true` on a single
  // `Keybinding.TOGGLE_HELP` event and toggles `true` to `false` only after
  // two consecutive `Keybinding.TOGGLE_HELP` events.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const helpKeyPressed = event.key === Keybinding.TOGGLE_HELP;
      const isSecondConsecutiveHelpKeyPress =
        helpKeyPressed && lastKeyPress === Keybinding.TOGGLE_HELP;

      const isSandboxActive = shouldShowHelp;
      const shouldToggle =
        (!isSandboxActive && helpKeyPressed) || isSecondConsecutiveHelpKeyPress;

      if (shouldToggle) {
        setShouldShowHelp(!isSandboxActive);
        setLastKeyPress(undefined);
        return;
      }

      // Store the last recognized key press, ignoring modifier keys that are
      // used in combination with character keys for some keybindings.
      if (!IGNORED_MODIFIER_KEY_PRESSES.has(event.key)) {
        setLastKeyPress(event.key);
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lastKeyPress, shouldShowHelp]);

  return { shouldShowControllerSandbox: shouldShowHelp };
}
