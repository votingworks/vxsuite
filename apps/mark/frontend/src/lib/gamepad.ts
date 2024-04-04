import { Button } from 'react-gamepad';
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

export function handleGamepadButtonDown(buttonName: Button): void {
  switch (buttonName) {
    case 'DPadUp':
      advanceElementFocus(-1);
      break;
    case 'B':
    case 'DPadDown':
      advanceElementFocus(1);
      break;
    case 'DPadLeft':
      triggerPageNavigationButton(PageNavigationButtonId.PREVIOUS);
      break;
    case 'DPadRight':
      triggerPageNavigationButton(PageNavigationButtonId.NEXT);
      break;
    case 'A':
      handleClick();
      break;
    // no default
  }
}

// Add Playwright tests if this solution will become permanent
/* istanbul ignore next - triggering keystrokes issue - https://github.com/votingworks/bmd/issues/62 */
export function handleGamepadKeyboardEvent(event: KeyboardEvent): void {
  switch (event.key) {
    case Keybinding.FOCUS_PREVIOUS:
      advanceElementFocus(-1);
      break;
    case Keybinding.FOCUS_NEXT:
      advanceElementFocus(1);
      break;
    case Keybinding.PAGE_PREVIOUS:
      triggerPageNavigationButton(PageNavigationButtonId.PREVIOUS);
      break;
    case Keybinding.PAGE_NEXT:
      triggerPageNavigationButton(PageNavigationButtonId.NEXT);
      break;
    case Keybinding.SELECT:
      // Enter already acts like a click
      // handleClick()
      break;
    // no default
  }
}
