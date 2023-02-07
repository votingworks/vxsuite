import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { ToggleTestModeButton } from './toggle_test_mode_button';

test('shows a button to toggle to live mode when in test mode', () => {
  const { getByText } = render(
    <ToggleTestModeButton
      canUnconfigure={false}
      isTestMode
      isTogglingTestMode={false}
      toggleTestMode={jest.fn()}
    />
  );

  getByText('Toggle to Live Mode');
});

test('shows a button to toggle to test mode when in live mode', () => {
  const { getByText } = render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode={false}
      isTogglingTestMode={false}
      toggleTestMode={jest.fn()}
    />
  );

  getByText('Toggle to Test Mode');
});

test('shows a disabled button when in live mode but the machine cannot be unconfigured', () => {
  const { getByText } = render(
    <ToggleTestModeButton
      canUnconfigure={false}
      isTestMode={false}
      isTogglingTestMode={false}
      toggleTestMode={jest.fn()}
    />
  );

  expect(
    (getByText('Toggle to Test Mode') as HTMLButtonElement).disabled
  ).toEqual(true);
});

test('shows a disabled button with "Toggling" when toggling', () => {
  const { getByText } = render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode
      isTogglingTestMode
      toggleTestMode={jest.fn()}
    />
  );

  expect((getByText('Toggling…') as HTMLButtonElement).disabled).toEqual(true);
});

test('calls the callback on confirmation', () => {
  const toggleTestMode = jest.fn();
  const { getByText, getAllByText } = render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode
      isTogglingTestMode={false}
      toggleTestMode={toggleTestMode}
    />
  );

  // Click the button.
  fireEvent.click(getByText('Toggle to Live Mode'));

  // Then click the confirmation button inside the modal.
  const [confirmButton] = getAllByText('Toggle to Live Mode').filter(
    (element) => element instanceof HTMLButtonElement && !element.disabled
  );
  expect(toggleTestMode).not.toHaveBeenCalled();
  fireEvent.click(confirmButton);
  expect(toggleTestMode).toHaveBeenCalled();
});

test('shows a modal when toggling to live mode', () => {
  const toggleTestMode = jest.fn();
  const { getByText } = render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode
      isTogglingTestMode
      toggleTestMode={toggleTestMode}
    />
  );

  getByText('Toggling to Live Mode');
  getByText('Zeroing out scanned ballots and reloading…');
});

test('shows a modal when toggling to test mode', () => {
  const toggleTestMode = jest.fn();
  const { getByText } = render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode={false}
      isTogglingTestMode
      toggleTestMode={toggleTestMode}
    />
  );

  getByText('Toggling to Test Mode');
  getByText('Zeroing out scanned ballots and reloading…');
});
