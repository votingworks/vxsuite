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

/* istanbul ignore next */
export function handleKeyboardEvent(event: KeyboardEvent): void {
  switch (event.key) {
    case Keybinding.PAGE_PREVIOUS:
      triggerPageNavigationButton(PageNavigationButtonId.PREVIOUS);
      break;
    case Keybinding.PAGE_NEXT:
      triggerPageNavigationButton(PageNavigationButtonId.NEXT);
      break;
    case Keybinding.FOCUS_PREVIOUS:
      advanceElementFocus(-1);
      break;
    case Keybinding.FOCUS_NEXT:
    case Keybinding.PAT_MOVE:
      advanceElementFocus(1);
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
