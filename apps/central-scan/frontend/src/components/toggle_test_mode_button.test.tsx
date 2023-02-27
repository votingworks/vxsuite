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

  getByText('Toggle to Official Ballot Mode');
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

  getByText('Toggle to Test Ballot Mode');
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
    (getByText('Toggle to Test Ballot Mode') as HTMLButtonElement).disabled
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
  fireEvent.click(getByText('Toggle to Official Ballot Mode'));

  // Then click the confirmation button inside the modal.
  const [confirmButton] = getAllByText('Toggle to Official Ballot Mode').filter(
    (element) => element instanceof HTMLButtonElement && !element.disabled
  );
  expect(toggleTestMode).not.toHaveBeenCalled();
  fireEvent.click(confirmButton);
  expect(toggleTestMode).toHaveBeenCalled();
});

test('toggle modal shows "official ballot mode" when toggling away from test ballot mode', () => {
  const toggleTestMode = jest.fn();
  const { getByText } = render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode
      isTogglingTestMode={false}
      toggleTestMode={toggleTestMode}
    />
  );

  // Click the button.
  fireEvent.click(getByText('Toggle to Official Ballot Mode'));

  getByText(
    'Toggling to Official Ballot Mode will zero out your scanned ballots. Are you sure?'
  );
});

test('toggle modal shows "test ballot mode" when toggling away from official ballot mode', () => {
  const toggleTestMode = jest.fn();
  const { getByText } = render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode={false}
      isTogglingTestMode={false}
      toggleTestMode={toggleTestMode}
    />
  );

  // Click the button.
  fireEvent.click(getByText('Toggle to Test Ballot Mode'));

  getByText(
    'Toggling to Test Ballot Mode will zero out your scanned ballots. Are you sure?'
  );
});

test('shows a modal when toggling to official ballot mode is in progress', () => {
  const toggleTestMode = jest.fn();
  const { getByText } = render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode
      isTogglingTestMode
      toggleTestMode={toggleTestMode}
    />
  );

  getByText('Toggling to Official Ballot Mode');
  getByText('Zeroing out scanned ballots and reloading…');
});

test('shows a modal when toggling to test ballot mode is in progress', () => {
  const toggleTestMode = jest.fn();
  const { getByText } = render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode={false}
      isTogglingTestMode
      toggleTestMode={toggleTestMode}
    />
  );

  getByText('Toggling to Test Ballot Mode');
  getByText('Zeroing out scanned ballots and reloading…');
});
