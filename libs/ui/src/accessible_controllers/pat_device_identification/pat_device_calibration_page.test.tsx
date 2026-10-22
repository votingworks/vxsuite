import type React from 'react';
import { expect, test, vi } from 'vitest';
import { userEvent } from '../../user_event.js';
import { render, screen } from '../../../test/react_testing_library.js';
import { Keybinding } from '../../keybindings.js';
import {
  PatDeviceCalibrationPage,
  type PatDeviceCalibrationPageProps,
} from './pat_device_calibration_page.js';

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

async function identifyInputs(): Promise<void> {
  // Continue past instructions
  await userEvent.keyboard(Keybinding.PAT_MOVE);

  // Identify first input
  await userEvent.keyboard(Keybinding.PAT_MOVE);
  await userEvent.keyboard(Keybinding.PAT_MOVE);

  // Identify second input
  await userEvent.keyboard(Keybinding.PAT_SELECT);
  await userEvent.keyboard(Keybinding.PAT_SELECT);

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

test('can restart the device ID flow', async () => {
  renderComponent();

  screen.getByText('Personal Assistive Technology Device Identification');

  await identifyInputs();
  await userEvent.click(screen.getByText('Back'));

  screen.getByText('Test Your Device');
});

test('calls onSkipCalibration if "Skip" button is pressed', async () => {
  const { onSkipCalibration } = renderComponent();

  screen.getByText('Personal Assistive Technology Device Identification');
  await userEvent.click(screen.getByText('Skip Identification'));
  expect(onSkipCalibration).toHaveBeenCalledTimes(1);
});
test('calls onSuccessfulCalibration if "Continue" button is pressed', async () => {
  const { onSuccessfulCalibration } = renderComponent();

  screen.getByText('Personal Assistive Technology Device Identification');

  await identifyInputs();
  await userEvent.click(screen.getByText('Continue'));
  expect(onSuccessfulCalibration).toHaveBeenCalledTimes(1);
});
