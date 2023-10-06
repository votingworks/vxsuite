import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '../../../test/react_testing_library';
import { PatDeviceCalibrationPage } from './pat_device_calibration_page';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { ApiClientContext, createQueryClient } from '../../api';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function identifyInputs() {
  // Continue pass intructions
  userEvent.keyboard('1');

  // Identify first input
  userEvent.keyboard('1');
  userEvent.keyboard('1');

  // Identify second input
  userEvent.keyboard('2');
  userEvent.keyboard('2');

  screen.getByText('Device Inputs Identified');
}

function renderComponent() {
  render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <PatDeviceCalibrationPage />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

test('can restart the device ID flow', () => {
  renderComponent();

  screen.getByText('PAT Device Identification');

  identifyInputs();
  userEvent.click(screen.getByText('Back'));

  screen.getByText('Test Your Device');
});

test('sets backend calibration state if "Skip" button is pressed', () => {
  renderComponent();

  screen.getByText('PAT Device Identification');
  apiMock.expectSetPatDeviceIsCalibrated();
  userEvent.click(screen.getByText('Skip Identification'));
});

test('sets backend calibration state if "Continue with Voting" button is pressed', () => {
  renderComponent();

  screen.getByText('PAT Device Identification');

  identifyInputs();
  apiMock.expectSetPatDeviceIsCalibrated();
  userEvent.click(screen.getByText('Continue with Voting'));
});
