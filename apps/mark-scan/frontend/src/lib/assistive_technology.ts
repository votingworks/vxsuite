import {
  Keybinding,
  PageNavigationButtonId,
  advanceElementFocus,
  triggerPageNavigationButton,
} from '@votingworks/ui';

function handleClick() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.click();
  }
}

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

/* istanbul ignore next - @preserve */
export function handleKeyboardEvent(event: KeyboardEvent): void {
  switch (event.key) {
    case Keybinding.PAGE_PREVIOUS:
      triggerPageNavigationButton(PageNavigationButtonId.PREVIOUS);
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
    case Keybinding.PAT_MOVE:
      advanceElementFocus(1);
      preventBrowserScroll(event);
      break;
    case Keybinding.PAT_SELECT:
      handleClick();
      break;
    case Keybinding.SELECT:
      // Enter already acts like a click
      // handleClick();
      break;
    // no default
  }
}

/* istanbul ignore next - @preserve */
export function handleKeyboardEventForVirtualKeyboard(
  event: KeyboardEvent
): void {
  switch (event.key) {
    case Keybinding.PAGE_PREVIOUS:
      advanceElementFocus(-1);
      break;
    case Keybinding.PAGE_NEXT:
      advanceElementFocus(1);
      break;
    case Keybinding.FOCUS_PREVIOUS:
      advanceElementFocus(-1);
      preventBrowserScroll(event);
      break;
    case Keybinding.FOCUS_NEXT:
    case Keybinding.PAT_MOVE:
      advanceElementFocus(1);
      preventBrowserScroll(event);
      break;
    case Keybinding.PAT_SELECT:
      handleClick();
      break;
    case Keybinding.SELECT:
      // Enter already acts like a click
      // handleClick();
      break;
    // no default
  }
}
