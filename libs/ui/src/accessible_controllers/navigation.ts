export enum PageNavigationButtonId {
  NEXT = 'next',
  NEXT_AFTER_CONFIRM = 'next_after_confirm',
  PREVIOUS = 'previous',
}

const TAB_ENABLED_ELEMENT_SELECTORS = [
  'button:not([aria-hidden="true"]):not([disabled]):not([tabindex="-1"])',
  '[role="button"]:not([aria-hidden="true"]):not([disabled]):not([tabindex="-1"])',
].join(', ');

/**
 * Selectors for elements that may be tab-enabled, but not focusable as a result
 * of being a descendant of an `aria-hidden` node.
 */
const TAB_ENABLED_ELEMENT_IN_HIDDEN_BLOCK_SELECTORS = [
  '[aria-hidden="true"] button',
  '[aria-hidden="true"] [role="button"]',
].join(', ');

function getTabEnabledElementsInHiddenBlocks() {
  return new Set(
    document.querySelectorAll(TAB_ENABLED_ELEMENT_IN_HIDDEN_BLOCK_SELECTORS)
  );
}

/**
 * Simulates browser `Tab`/`Shift+Tab` behavior by moving focus to the next
 * focusable element in the document, in the specified {@link direction}.
 */
export function advanceElementFocus(direction: 1 | -1): void {
  const allTabEnabledElements = document.querySelectorAll<HTMLElement>(
    TAB_ENABLED_ELEMENT_SELECTORS
  );
  const tabEnabledElementsInHiddenBlocks =
    getTabEnabledElementsInHiddenBlocks();

  const focusableElements = Array.from(allTabEnabledElements).filter(
    (e) => !tabEnabledElementsInHiddenBlocks.has(e)
  );
  if (focusableElements.length === 0) {
    return;
  }

  if (direction === -1) {
    focusableElements.reverse();
  }

  const { activeElement } = document;
  const currentIndex = focusableElements.indexOf(activeElement as HTMLElement);
  const nextIndex = (currentIndex + 1) % focusableElements.length;

  focusableElements[nextIndex].focus();
}

/**
 * Looks for all page navigation elements with the specified {@link navigationId} or
 * {@link nagivationOnConfirmId} (if provided). If a visible {@link navigationId} is found, the first element is clicked.
 * Otherwise if a visible {@link navigationOnConfirmId} is found, the first element is focused.
 */
export function triggerPageNavigationButton(
  navigationId: PageNavigationButtonId,
  navigationOnConfirmId?: PageNavigationButtonId
): void {
  const hiddenElements = getTabEnabledElementsInHiddenBlocks();
  const navigationButtons = Array.from(
    document.querySelectorAll(`#${navigationId}`)
  ).filter((e) => !hiddenElements.has(e) && e instanceof HTMLElement);

  if (navigationButtons.length >= 1) {
    (navigationButtons[0] as HTMLElement).click();
    return;
  }
  if (!navigationOnConfirmId) {
    return;
  }
  const navigationOnConfirmButtons = Array.from(
    document.querySelectorAll(`#${navigationOnConfirmId}`)
  ).filter((e) => !hiddenElements.has(e) && e instanceof HTMLElement);

  if (navigationOnConfirmButtons.length >= 1) {
    (navigationOnConfirmButtons[0] as HTMLElement).focus();
  }
}
