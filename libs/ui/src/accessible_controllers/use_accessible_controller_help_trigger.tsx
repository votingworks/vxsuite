import React from 'react';
import { useKeybindings } from '../keybindings_context.js';

export interface UseAccessibleControllerHelpTriggerResult {
  shouldShowControllerSandbox: boolean;
}

const IGNORED_MODIFIER_KEY_PRESSES = new Set(['Shift']);

export function useAccessibleControllerHelpTrigger(): UseAccessibleControllerHelpTriggerResult {
  const [shouldShowHelp, setShouldShowHelp] = React.useState(false);
  const [lastKeyPress, setLastKeyPress] = React.useState<string>();
  const { TOGGLE_HELP: helpKey } = useKeybindings();

  // Toggles `shouldShowHelp` from `false` to `true` on a single help key
  // event and toggles `true` to `false` only after two consecutive help key
  // events.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const helpKeyPressed = event.key === helpKey;
      const isSecondConsecutiveHelpKeyPress =
        helpKeyPressed && lastKeyPress === helpKey;

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
  }, [helpKey, lastKeyPress, shouldShowHelp]);

  return { shouldShowControllerSandbox: shouldShowHelp };
}
