import { mod } from '../utils/mod';

export function getActiveElement(): HTMLElement {
  return document.activeElement as HTMLElement;
}

function getFocusableElements(): HTMLElement[] {
  const tabbableElements = Array.from(
    document.querySelectorAll(
      'button:not([aria-hidden="true"]):not([disabled])'
    )
  );
  const ariaHiddenTabbableElements = Array.from(
    document.querySelectorAll('[aria-hidden="true"] button')
  );
  return tabbableElements.filter(
    (element) => ariaHiddenTabbableElements.indexOf(element) === -1
  ) as HTMLElement[];
}

function handleArrowUp() {
  const focusable = getFocusableElements();
  const currentIndex = focusable.indexOf(getActiveElement());
  /* istanbul ignore else */
  if (focusable.length) {
    if (currentIndex > -1) {
      focusable[mod(currentIndex - 1, focusable.length)].focus();
    } else {
      focusable[focusable.length - 1].focus();
    }
  }
}

function handleArrowDown() {
  const focusable = getFocusableElements();
  const currentIndex = focusable.indexOf(getActiveElement());
  /* istanbul ignore else */
  if (focusable.length) {
    focusable[mod(currentIndex + 1, focusable.length)].focus();
  }
}

function handleArrowLeft() {
  const prevButton = document.getElementById('previous');
  /* istanbul ignore else */
  if (prevButton) {
    prevButton.click();
  }
}

function handleArrowRight() {
  const nextButton = document.getElementById('next');
  /* istanbul ignore else */
  if (nextButton) {
    nextButton.click();
  }
}

function handleClick() {
  const activeElement = getActiveElement();
  activeElement.click();
}

/* istanbul ignore next */
export function handleKeyboardEvent(event: KeyboardEvent): void {
  switch (event.key) {
    case 'ArrowLeft':
      handleArrowLeft();
      break;
    case 'ArrowRight':
      handleArrowRight();
      break;
    case 'ArrowUp':
      handleArrowUp();
      break;
    case 'ArrowDown':
    case '1':
      handleArrowDown();
      break;
    case '2':
      handleClick();
      break;
    case 'Enter':
      // Enter already acts like a click
      // handleClick();
      break;
    // no default
  }
}
