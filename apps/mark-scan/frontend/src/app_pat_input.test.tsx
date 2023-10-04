import { electionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { screen } from '../test/react_testing_library';
import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { buildApp } from '../test/helpers/build_app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);

  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
  apiMock.expectGetPrecinctSelectionResolvesDefault(
    electionGeneralDefinition.election
  );
  apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(
    electionGeneralDefinition
  );
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(7500);

const basePageText = 'Calibrate PAT Device';
const navigateText = "'Navigate' Input Triggered";
const selectText = "'Select' Input Triggered";

async function expectBaseCalibrationPage() {
  await screen.findByText(basePageText);
}

function expectConfirmExitPatDeviceIdentificationPage() {
  screen.getByText('Device Inputs Identified');
}

function identifyDeviceInputs() {
  // Open 'Navigate' modal
  userEvent.keyboard('1');
  screen.getByText(navigateText);

  // Close 'Navigate' modal
  userEvent.keyboard('1');
  expect(screen.queryByText(navigateText)).toBeNull();

  // Open 'Select' modal
  userEvent.keyboard('2');
  screen.getByText(selectText);

  // Close 'Select'
  userEvent.keyboard('2');
  expect(screen.queryByText(selectText)).toBeNull();
}

test('connecting a PAT device', async () => {
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionGeneralDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_open' });
  renderApp();

  // Identify device inputs first time
  await expectBaseCalibrationPage();
  identifyDeviceInputs();
  expectConfirmExitPatDeviceIdentificationPage();

  // Navigate back
  userEvent.click(screen.getByText('Back'));

  // Identify device inputs second time
  await expectBaseCalibrationPage();
  identifyDeviceInputs();

  expectConfirmExitPatDeviceIdentificationPage();
  userEvent.click(screen.getByText('Continue with Voting'));

  // Assert none of the 4 possible states in the input identification flow are rendered
  expect(screen.queryByText(basePageText)).toBeNull();
  expect(screen.queryByText('Device Inputs Identified')).toBeNull();
  expect(screen.queryByText(navigateText)).toBeNull();
  expect(screen.queryByText(selectText)).toBeNull();
});

test('PAT input identification modals do not interfere with each other', async () => {
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionGeneralDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_open' });
  renderApp();
  await expectBaseCalibrationPage();

  // Open 'Navigate' modal
  userEvent.keyboard('1');
  screen.getByText(navigateText);

  // Triggering 'Select' input shouldn't change the modal
  userEvent.keyboard('2');
  screen.getByText(navigateText);

  // Triggering 'Navigate' input should close modal
  userEvent.keyboard('1');
  screen.getByText(basePageText);

  // Open 'Select' modal
  userEvent.keyboard('2');
  screen.getByText(selectText);

  // Triggering 'Navigate' input shouldn't change the modal
  userEvent.keyboard('1');
  screen.getByText(selectText);

  // Unexpected keypresses shouldn't change anything
  userEvent.keyboard('3');
  screen.getByText(selectText);
});
