import mod from '../utils/mod'

function getFocusableElements(): HTMLElement[] {
  const tabbableElements = Array.from(
    document.querySelectorAll(
      'button:not([aria-hidden="true"]):not([disabled]), input:not([aria-hidden="true"]):not([disabled])'
    )
  )
  const ariaHiddenTabbableElements = Array.from(
    document.querySelectorAll(
      '[aria-hidden="true"] button, [aria-hidden="true"] input'
    )
  )
  return tabbableElements.filter(
    element => ariaHiddenTabbableElements.indexOf(element) === -1
  ) as HTMLElement[]
}

const getActiveElement = () => document.activeElement! as HTMLInputElement

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
  const prevButton = document.getElementById('previous') as HTMLButtonElement
  if (prevButton) {
    prevButton.click()
  }
}

function handleArrowRight() {
  const nextButton = document.getElementById('next') as HTMLButtonElement
  if (nextButton) {
    nextButton.click()
  }
}

function handleClick(sendEvenIfButton: boolean) {
  const activeElement = getActiveElement()
  if (activeElement.type !== 'button' || sendEvenIfButton) {
    activeElement.click()
  }
}

export function handleGamepadButtonDown(buttonName: string) {
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
      handleClick(true)
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
      handleClick(true)
      break
    case 'Enter':
      handleClick(false)
      break
    // no default
  }
}
