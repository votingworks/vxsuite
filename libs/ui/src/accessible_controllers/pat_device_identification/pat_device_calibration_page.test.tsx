import React from 'react';
import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { Keybinding } from '../../keybindings';
import {
  PatDeviceCalibrationPage,
  PatDeviceCalibrationPageProps,
} from './pat_device_calibration_page';

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

function identifyInputs(): void {
  // Continue past instructions
  userEvent.keyboard(Keybinding.PAT_MOVE);

  // Identify first input
  userEvent.keyboard(Keybinding.PAT_MOVE);
  userEvent.keyboard(Keybinding.PAT_MOVE);

  // Identify second input
  userEvent.keyboard(Keybinding.PAT_SELECT);
  userEvent.keyboard(Keybinding.PAT_SELECT);

  screen.getByText('Device Inputs Identified');
}

function renderComponent(props: Partial<PatDeviceCalibrationPageProps> = {}) {
  const onSuccessfulCalibration = props.onSuccessfulCalibration ?? vi.fn();
  const onSkipCalibration = props.onSkipCalibration ?? vi.fn();

  const renderResult = render(
    <PatDeviceCalibrationPage
      onSuccessfulCalibration={onSuccessfulCalibration}
      onSkipCalibration={onSkipCalibration}
      ScreenWrapper={MockScreenWrapper}
      {...props}
    />
  );

  return { ...renderResult, onSuccessfulCalibration, onSkipCalibration };
}

test('can restart the device ID flow', () => {
  renderComponent();

  screen.getByText('Personal Assistive Technology Device Identification');

  identifyInputs();
  userEvent.click(screen.getByText('Back'));

  screen.getByText('Test Your Device');
});

test('calls onSkipCalibration if "Skip" button is pressed', () => {
  const { onSkipCalibration } = renderComponent();

  screen.getByText('Personal Assistive Technology Device Identification');
  userEvent.click(screen.getByText('Skip Identification'));
  expect(onSkipCalibration).toHaveBeenCalledTimes(1);
});
test('calls onSuccessfulCalibration if "Continue" button is pressed', () => {
  const { onSuccessfulCalibration } = renderComponent();

  screen.getByText('Personal Assistive Technology Device Identification');

  identifyInputs();
  userEvent.click(screen.getByText('Continue'));
  expect(onSuccessfulCalibration).toHaveBeenCalledTimes(1);
});
