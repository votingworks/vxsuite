export enum PageNavigationButtonId {
  NEXT = 'next',
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
 * Simulates a click on the page navigation button with the specified {@link id}
 * to advance
 */
export function triggerPageNavigationButton(id: PageNavigationButtonId): void {
  const possibleNextElements = document.querySelectorAll(`#${id}`);
  const hiddenElements = getTabEnabledElementsInHiddenBlocks();
  // create an array of elements in both possibleButtons and hiddenElements
  const visibleButtons = Array.from(possibleNextElements).filter(
    (e) => !hiddenElements.has(e) && e instanceof HTMLElement
  );

  if (visibleButtons.length !== 1) {
    return;
  }

  (visibleButtons[0] as HTMLElement).click();
}
