import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Keybinding } from '@votingworks/ui';
import { render, screen } from '../../../test/react_testing_library';
import {
  PatDeviceCalibrationPage,
  PatDeviceCalibrationPageProps,
} from './pat_device_calibration_page';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { ApiProvider } from '../../api_provider';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

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
  render(
    <ApiProvider apiClient={apiMock.mockApiClient} noAudio>
      <PatDeviceCalibrationPage {...props} />
    </ApiProvider>
  );
}

test('can restart the device ID flow', () => {
  renderComponent();

  screen.getByText('Personal Assistive Technology Device Identification');

  identifyInputs();
  userEvent.click(screen.getByText('Back'));

  screen.getByText('Test Your Device');
});

test('sets backend calibration state if "Skip" button is pressed', () => {
  renderComponent();

  screen.getByText('Personal Assistive Technology Device Identification');
  apiMock.expectSetPatDeviceIsCalibrated();
  userEvent.click(screen.getByText('Skip Identification'));
});

test('calls optional passed function if "Skip" button is pressed', () => {
  const skipFn = vi.fn();
  renderComponent({ onSkipCalibration: skipFn });

  screen.getByText('Personal Assistive Technology Device Identification');
  apiMock.expectSetPatDeviceIsCalibrated();
  userEvent.click(screen.getByText('Skip Identification'));
  expect(skipFn).toHaveBeenCalledTimes(1);
});

test('sets backend calibration state if "Continue " button is pressed', () => {
  renderComponent();

  screen.getByText('Personal Assistive Technology Device Identification');

  identifyInputs();
  apiMock.expectSetPatDeviceIsCalibrated();
  userEvent.click(screen.getByText('Continue'));
});

test('calls optional passed function if "Continue" button is pressed', () => {
  const continueFn = vi.fn();
  renderComponent({ onSuccessfulCalibration: continueFn });

  screen.getByText('Personal Assistive Technology Device Identification');
  identifyInputs();
  apiMock.expectSetPatDeviceIsCalibrated();
  userEvent.click(screen.getByText('Continue'));
  expect(continueFn).toHaveBeenCalledTimes(1);
});
