import mod from '../utils/mod'

function getFocusableElements(): HTMLElement[] {
  const tabbableElements = Array.from(
    document.querySelectorAll('button:not([tabindex="-1"]), input')
  )
  const ariaHiddenTabbableElements = Array.from(
    document.querySelectorAll(
      '[aria-hidden="true"] button:not([tabindex="-1"]), [aria-hidden="true"] input'
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
  if (currentIndex > -1) {
    focusable[mod(currentIndex - 1, focusable.length)].focus()
  } else {
    focusable[focusable.length - 1].focus()
  }
}

function handleArrowDown() {
  const focusable = getFocusableElements()
  const currentIndex = focusable.indexOf(getActiveElement())
  focusable[mod(currentIndex + 1, focusable.length)].focus()
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

function handleClick() {
  getActiveElement().click()
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
      handleClick()
      break
    // no default
  }
}

// Add Cypress tests if this solution will become permanent
// https://docs.cypress.io/api/commands/type.html
export /* istanbul ignore next */ function handleGamepadKeyboardEvent(
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
    // no default
  }
}
