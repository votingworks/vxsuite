import userEvent from '@testing-library/user-event';
import React from 'react';
import { render, screen } from '../../test/react_testing_library';
import { ToggleTestModeButton } from './toggle_test_mode_button';

test('shows a button to toggle to live mode when in test mode', () => {
  render(
    <ToggleTestModeButton
      canUnconfigure={false}
      isTestMode
      isTogglingTestMode={false}
      toggleTestMode={jest.fn()}
    />
  );

  screen.getByText('Toggle to Official Ballot Mode');
});

test('shows a button to toggle to test mode when in live mode', () => {
  render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode={false}
      isTogglingTestMode={false}
      toggleTestMode={jest.fn()}
    />
  );

  screen.getByText('Toggle to Test Ballot Mode');
});

test('shows a disabled button when in live mode but the machine cannot be unconfigured', () => {
  const { getButton } = render(
    <ToggleTestModeButton
      canUnconfigure={false}
      isTestMode={false}
      isTogglingTestMode={false}
      toggleTestMode={jest.fn()}
    />
  );

  expect(getButton('Toggle to Test Ballot Mode')).toBeDisabled();
});

test('shows a disabled button with "Toggling" when toggling', () => {
  const { getButton } = render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode
      isTogglingTestMode
      toggleTestMode={jest.fn()}
    />
  );

  expect(
    getButton('Toggling…', { useSparinglyIncludeHidden: true })
  ).toBeDisabled();
});

test('calls the callback on confirmation', () => {
  const toggleTestMode = jest.fn();
  const { getButton } = render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode
      isTogglingTestMode={false}
      toggleTestMode={toggleTestMode}
    />
  );

  // Click the button.
  userEvent.click(getButton('Toggle to Official Ballot Mode'));

  // Then click the confirmation button inside the modal.
  const confirmButton = getButton('Toggle to Official Ballot Mode');
  expect(toggleTestMode).not.toHaveBeenCalled();
  userEvent.click(confirmButton);
  expect(toggleTestMode).toHaveBeenCalled();
});

test('toggle modal shows "official ballot mode" when toggling away from test ballot mode', () => {
  const toggleTestMode = jest.fn();
  render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode
      isTogglingTestMode={false}
      toggleTestMode={toggleTestMode}
    />
  );

  // Click the button.
  userEvent.click(screen.getByText('Toggle to Official Ballot Mode'));

  screen.getByText(
    'Toggling to Official Ballot Mode will zero out your scanned ballots. Are you sure?'
  );
});

test('toggle modal shows "test ballot mode" when toggling away from official ballot mode', () => {
  const toggleTestMode = jest.fn();
  render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode={false}
      isTogglingTestMode={false}
      toggleTestMode={toggleTestMode}
    />
  );

  // Click the button.
  userEvent.click(screen.getByText('Toggle to Test Ballot Mode'));

  screen.getByText(
    'Toggling to Test Ballot Mode will zero out your scanned ballots. Are you sure?'
  );
});

test('shows a modal when toggling to official ballot mode is in progress', () => {
  const toggleTestMode = jest.fn();
  render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode
      isTogglingTestMode
      toggleTestMode={toggleTestMode}
    />
  );

  screen.getByText('Toggling to Official Ballot Mode');
  screen.getByText('Zeroing out scanned ballots and reloading…');
});

test('shows a modal when toggling to test ballot mode is in progress', () => {
  const toggleTestMode = jest.fn();
  render(
    <ToggleTestModeButton
      canUnconfigure
      isTestMode={false}
      isTogglingTestMode
      toggleTestMode={toggleTestMode}
    />
  );

  screen.getByText('Toggling to Test Ballot Mode');
  screen.getByText('Zeroing out scanned ballots and reloading…');
});
