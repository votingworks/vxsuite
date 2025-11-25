import { Keybinding } from './keybindings';
import {
  PageNavigationButtonId,
  advanceElementFocus,
  triggerPageNavigationButton,
} from './accessible_controllers';

/**
 * Prevents the default browser scroll behavior for the arrow keys, since we're
 * re-mapping them for focus navigation.
 *
 * This avoids the page constantly scrolling while focus is moved, which could
 * be a little disorienting for some voters.
 */
function preventBrowserScroll(event: KeyboardEvent) {
  event.preventDefault();
}

export interface HandleKeyboardEventOptions {
  /**
   * Optional callback invoked when a PAT input device keypress is detected
   * (Keybinding.PAT_MOVE or Keybinding.PAT_SELECT). This allows apps to
   * trigger PAT device calibration flows when a PAT device is first used.
   *
   * @returns true if the callback handled the input (e.g., showed calibration),
   * false to allow normal PAT navigation to proceed
   */
  onPatInput?: () => boolean;
}

/* istanbul ignore next - @preserve */
export function handleKeyboardEvent(
  event: KeyboardEvent,
  options?: HandleKeyboardEventOptions
): void {
  // VVSG 2.0 7.2-M – No repetitive activation
  if (event.repeat) return;

  switch (event.key) {
    case Keybinding.PAGE_PREVIOUS:
      triggerPageNavigationButton(
        PageNavigationButtonId.PREVIOUS,
        PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM
      );
      break;

    case Keybinding.PAGE_NEXT:
      triggerPageNavigationButton(
        PageNavigationButtonId.NEXT,
        PageNavigationButtonId.NEXT_AFTER_CONFIRM
      );
      break;

    case Keybinding.FOCUS_PREVIOUS:
      advanceElementFocus(-1);
      preventBrowserScroll(event);
      break;

    case Keybinding.FOCUS_NEXT:
      advanceElementFocus(1);
      preventBrowserScroll(event);
      break;

    case Keybinding.PAT_MOVE:
      if (options?.onPatInput?.()) {
        // Callback handled it (e.g., showing calibration), don't navigate
        break;
      }
      advanceElementFocus(1);
      preventBrowserScroll(event);
      break;

    case Keybinding.PAT_SELECT:
      if (options?.onPatInput?.()) {
        // Callback handled it (e.g., showing calibration), don't click
        break;
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.click();
      }
      break;

    default:
    // Ignore.
  }
}
