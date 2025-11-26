import React from 'react';
import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { ConfirmExitPatDeviceIdentificationPage } from './confirm_exit_pat_device_identification_page';

// Simple mock screen wrapper for testing
function MockScreenWrapper({
  children,
  actionButtons,
}: {
  children: React.ReactNode;
  actionButtons?: React.ReactNode;
}): JSX.Element {
  return (
    <div data-testid="mock-screen-wrapper">
      {children}
      {actionButtons}
    </div>
  );
}

test('calls provided Back and Continue functions', () => {
  const backFn = vi.fn();
  const continueFn = vi.fn();

  render(
    <ConfirmExitPatDeviceIdentificationPage
      onPressBack={backFn}
      onPressContinue={continueFn}
      ScreenWrapper={MockScreenWrapper}
    />
  );

  screen.getByText('Device Inputs Identified');
  expect(backFn).not.toHaveBeenCalled();
  userEvent.click(screen.getByText('Back'));
  expect(backFn).toHaveBeenCalled();

  expect(continueFn).not.toHaveBeenCalled();
  userEvent.click(screen.getByText('Continue'));
  expect(continueFn).toHaveBeenCalled();
});
