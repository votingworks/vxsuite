import { fireEvent, render } from '@testing-library/react'
import React from 'react'
import ToggleTestModeButton from './ToggleTestModeButton'

test('shows a button to toggle to live mode when in test mode', async () => {
  const { getByText } = render(
    <ToggleTestModeButton
      isTestMode
      isTogglingTestMode={false}
      toggleTestMode={jest.fn()}
    />
  )

  getByText('Toggle to Live Mode')
})

test('shows a button to toggle to test mode when in live mode', async () => {
  const { getByText } = render(
    <ToggleTestModeButton
      isTestMode={false}
      isTogglingTestMode={false}
      toggleTestMode={jest.fn()}
    />
  )

  getByText('Toggle to Test Mode')
})

test('shows a disabled button with "Toggling" when toggling', async () => {
  const { getByText } = render(
    <ToggleTestModeButton
      isTestMode
      isTogglingTestMode
      toggleTestMode={jest.fn()}
    />
  )

  expect((getByText('Toggling…') as HTMLButtonElement).disabled).toBe(true)
})

test('calls the callback on confirmation', () => {
  const toggleTestMode = jest.fn()
  const { getByText, getAllByText } = render(
    <ToggleTestModeButton
      isTestMode
      isTogglingTestMode={false}
      toggleTestMode={toggleTestMode}
    />
  )

  // Click the button.
  fireEvent.click(getByText('Toggle to Live Mode'))

  // Then click the confirmation button inside the modal.
  const [confirmButton] = getAllByText('Toggle to Live Mode').filter(
    (element) => element instanceof HTMLButtonElement && !element.disabled
  )
  expect(toggleTestMode).not.toHaveBeenCalled()
  fireEvent.click(confirmButton)
  expect(toggleTestMode).toHaveBeenCalled()
})

test('shows a modal when toggling to live mode', () => {
  const toggleTestMode = jest.fn()
  const { getByText } = render(
    <ToggleTestModeButton
      isTestMode
      isTogglingTestMode
      toggleTestMode={toggleTestMode}
    />
  )

  getByText('Toggling to Live Mode')
  getByText('Zeroing out scanned ballots and reloading…')
})

test('shows a modal when toggling to test mode', () => {
  const toggleTestMode = jest.fn()
  const { getByText } = render(
    <ToggleTestModeButton
      isTestMode={false}
      isTogglingTestMode
      toggleTestMode={toggleTestMode}
    />
  )

  getByText('Toggling to Test Mode')
  getByText('Zeroing out scanned ballots and reloading…')
})
