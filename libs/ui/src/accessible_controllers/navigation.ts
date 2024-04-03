export enum PageNavigationButtonId {
  NEXT = 'next',
  PREVIOUS = 'previous',
}

const FOCUSABLE_ELEMENT_SELECTORS = [
  'button:not([aria-hidden="true"]):not([disabled]):not([tabindex="-1"])',
  '[role="button"]:not([aria-hidden="true"]):not([disabled]):not([tabindex="-1"])',
].join(', ');

const HIDDEN_TAB_ENABLED_ELEMENT_SELECTORS = [
  '[aria-hidden="true"] button',
  '[aria-hidden="true"] [role="button"]',
].join(', ');

function getHiddenTabEnabledElements() {
  return new Set(
    document.querySelectorAll(HIDDEN_TAB_ENABLED_ELEMENT_SELECTORS)
  );
}

/**
 * Simulates browser `Tab`/`Shift+Tab` behavior by moving focus to the next
 * focusable element in the document, in the specified {@link direction}.
 */
export function advanceElementFocus(direction: 1 | -1): void {
  const hiddenTabEnabledElements = getHiddenTabEnabledElements();

  const focusableElements = Array.from(
    document.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENT_SELECTORS)
  ).filter((e) => !hiddenTabEnabledElements.has(e));
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
  const hiddenTabEnabledElements = getHiddenTabEnabledElements();
  const button = document.getElementById(id);

  if (!button || hiddenTabEnabledElements.has(button)) {
    return;
  }

  button.click();
}
