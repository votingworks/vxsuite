import userEvent from '@testing-library/user-event';
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
  // Continue past intructions
  userEvent.keyboard('1');

  // Identify first input
  userEvent.keyboard('1');
  userEvent.keyboard('1');

  // Identify second input
  userEvent.keyboard('2');
  userEvent.keyboard('2');

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
  const skipFn = jest.fn();
  renderComponent({ onSkipCalibration: skipFn });

  screen.getByText('Personal Assistive Technology Device Identification');
  apiMock.expectSetPatDeviceIsCalibrated();
  userEvent.click(screen.getByText('Skip Identification'));
  expect(skipFn).toHaveBeenCalledTimes(1);
});

test('sets backend calibration state if "Continue with Voting" button is pressed', () => {
  renderComponent();

  screen.getByText('Personal Assistive Technology Device Identification');

  identifyInputs();
  apiMock.expectSetPatDeviceIsCalibrated();
  userEvent.click(screen.getByText('Continue with Voting'));
});

test('calls optional passed function if "Continue" button is pressed', () => {
  const continueFn = jest.fn();
  renderComponent({ onSuccessfulCalibration: continueFn });

  screen.getByText('Personal Assistive Technology Device Identification');
  identifyInputs();
  apiMock.expectSetPatDeviceIsCalibrated();
  userEvent.click(screen.getByText('Continue with Voting'));
  expect(continueFn).toHaveBeenCalledTimes(1);
});

test('renders button label override', () => {
  renderComponent({ successScreenButtonLabel: <p>button override</p> });

  screen.getByText('Personal Assistive Technology Device Identification');
  identifyInputs();
  expect(screen.queryByText('Continue with Voting')).toBeNull();
  screen.getByText('button override');
});

test('renders description override', () => {
  renderComponent({ successScreenDescription: <p>description override</p> });

  screen.getByText('Personal Assistive Technology Device Identification');
  identifyInputs();
  expect(
    screen.queryByText(
      /You may continue with voting or go back to the previous screen./
    )
  ).toBeNull();
  screen.getByText('description override');
});
