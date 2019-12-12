import { Button } from 'react-gamepad'
import mod from '../utils/mod'

export const getActiveElement = () => document.activeElement! as HTMLElement

function getFocusableElements(): HTMLElement[] {
  const tabbableElements = Array.from(
    document.querySelectorAll(
      'button:not([aria-hidden="true"]):not([disabled])'
    )
  )
  const ariaHiddenTabbableElements = Array.from(
    document.querySelectorAll('[aria-hidden="true"] button')
  )
  return tabbableElements.filter(
    element => ariaHiddenTabbableElements.indexOf(element) === -1
  ) as HTMLElement[]
}

function handleArrowUp() {
  const focusable = getFocusableElements()
  const currentIndex = focusable.indexOf(getActiveElement())
  /* istanbul ignore else */
  if (focusable.length) {
    if (currentIndex > -1) {
      focusable[mod(currentIndex - 1, focusable.length)].focus()
    } else {
      focusable[focusable.length - 1].focus()
    }
  }
}

function handleArrowDown() {
  const focusable = getFocusableElements()
  const currentIndex = focusable.indexOf(getActiveElement())
  /* istanbul ignore else */
  if (focusable.length) {
    focusable[mod(currentIndex + 1, focusable.length)].focus()
  }
}

function handleArrowLeft() {
  const prevButton = document.getElementById('previous')
  /* istanbul ignore else */
  if (prevButton) {
    prevButton.click()
  }
}

function handleArrowRight() {
  const nextButton = document.getElementById('next')
  /* istanbul ignore else */
  if (nextButton) {
    nextButton.click()
  }
}

function handleClick() {
  const activeElement = getActiveElement()
  activeElement.click()
}

export function handleGamepadButtonDown(buttonName: Button) {
  switch (buttonName) {
    case 'DPadUp':
      handleArrowUp()
      break
    case 'B':
    case 'DPadDown':
      handleArrowDown()
      break
    case 'DPadLeft':
      handleArrowLeft()
      break
    case 'DPadRight':
      handleArrowRight()
      break
    case 'A':
      handleClick()
      break
    // no default
  }
}

// Add Cypress tests if this solution will become permanent
// https://docs.cypress.io/api/commands/type.html
export /* istanbul ignore next - triggering keystrokes issue - https://github.com/votingworks/bmd/issues/62 */ function handleGamepadKeyboardEvent(
  event: KeyboardEvent
) {
  switch (event.key) {
    case 'ArrowUp':
      handleArrowUp()
      break
    case '[':
    case 'ArrowDown':
      handleArrowDown()
      break
    case 'ArrowLeft':
      handleArrowLeft()
      break
    case 'ArrowRight':
      handleArrowRight()
      break
    case ']':
      handleClick()
      break
    case 'Enter':
      // Enter already acts like a click
      // handleClick()
      break
    // no default
  }
}
