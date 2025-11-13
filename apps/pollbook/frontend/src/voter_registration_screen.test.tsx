import { expect, test, beforeEach, afterEach, vi } from 'vitest';
import {
  ElectionDefinition,
  ValidStreetInfo,
  VoterRegistrationRequest,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import {
  electionFamousNames2021Fixtures,
  electionSimpleSinglePrecinctFixtures,
} from '@votingworks/fixtures';
import { screen } from '../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  createMockVoter,
} from '../test/mock_api_client';
import { renderInAppContext } from '../test/render_in_app_context';
import { VoterRegistrationScreen } from './voter_registration_screen';
import { getMockElectionManagerAuth } from '../test/auth';

let apiMock: ApiMock;

const validStreetInfo: ValidStreetInfo = {
  streetName: 'Main St',
  side: 'even',
  lowRange: 0,
  highRange: 100,
  postalCityTown: 'Concord',
  zip5: '03301',
  zip4: '6789',
  precinct: '23',
};

const mockRegistrationData: VoterRegistrationRequest = {
  firstName: 'JANE',
  lastName: 'SMITH',
  middleName: '',
  suffix: '',
  party: 'DEM',
  streetNumber: '10',
  streetName: 'MAIN ST',
  streetSuffix: '',
  houseFractionNumber: '',
  apartmentUnitNumber: '',
  addressLine2: '',
  addressLine3: '',
  city: 'CONCORD',
  state: 'NH',
  zipCode: '03301',
  precinct: '23',
};

const famousNamesElectionDef: ElectionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

let unmount: () => void;

beforeEach(() => {
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.setElection(famousNamesElectionDef, '23');
  apiMock.setAuthStatus(getMockElectionManagerAuth());
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  unmount();
});

async function renderComponent() {
  const renderResult = renderInAppContext(<VoterRegistrationScreen />, {
    apiMock,
  });
  unmount = renderResult.unmount;
  await screen.findByRole('heading', { name: 'Voter Registration' });
}

test('renders and disables submit until required fields are filled', async () => {
  apiMock.setPrinterStatus(true);
  apiMock.expectGetDeviceStatuses();
  apiMock.expectGetValidStreetInfo([validStreetInfo]);
  await renderComponent();
  const addButton = screen.getByTestId('add-voter-btn');
  expect(addButton).toBeDisabled();

  // Fill in required fields
  userEvent.type(screen.getByRole('textbox', { name: 'First Name' }), 'John');
  userEvent.type(screen.getByRole('textbox', { name: 'Last Name' }), 'Doe');
  userEvent.type(screen.getByRole('textbox', { name: 'Street Number' }), '10');
  userEvent.click(screen.getByLabelText('Street Name'));
  userEvent.keyboard('[Enter]');

  // Still disabled
  expect(addButton).toBeDisabled();

  // Select party
  userEvent.click(screen.getByLabelText('Party Affiliation'));
  userEvent.keyboard('[ArrowDown][Enter]');

  expect(addButton).not.toBeDisabled();
});

test('shows printer warning if no printer is attached', async () => {
  apiMock.setPrinterStatus(false);
  apiMock.expectGetDeviceStatuses();
  const renderResult = renderInAppContext(<VoterRegistrationScreen />, {
    apiMock,
  });
  unmount = renderResult.unmount;
  await screen.findByRole('heading', { name: 'No Printer Detected' });
  screen.getByText('Connect printer to continue.');
});

test('shows no precinct warning if no precinct is configured', async () => {
  apiMock.setElection(famousNamesElectionDef);
  apiMock.setPrinterStatus(true);
  apiMock.expectGetDeviceStatuses();
  const renderResult = renderInAppContext(<VoterRegistrationScreen />, {
    apiMock,
  });
  unmount = renderResult.unmount;
  await screen.findByRole('heading', { name: 'No Precinct Selected' });
});

test('shows duplicate name modal and allows override', async () => {
  apiMock.setPrinterStatus(true);
  apiMock.expectGetDeviceStatuses();
  apiMock.expectGetValidStreetInfo([validStreetInfo]);
  await renderComponent();

  // Fill in required fields
  userEvent.type(screen.getByRole('textbox', { name: 'First Name' }), 'Jane');
  userEvent.type(screen.getByRole('textbox', { name: 'Last Name' }), 'Smith');
  userEvent.type(screen.getByRole('textbox', { name: 'Street Number' }), '10');
  userEvent.click(screen.getByLabelText('Street Name'));
  userEvent.keyboard('[Enter]');
  userEvent.click(screen.getByLabelText('Party Affiliation'));
  userEvent.keyboard('[ArrowDown][Enter]');

  // Simulate duplicate name error
  apiMock.expectRegisterVoterError(mockRegistrationData, false, [
    createMockVoter('test-duplicate-id', 'Jane', 'Smith', '23'),
  ]);

  userEvent.click(screen.getByTestId('add-voter-btn'));
  await screen.findByText('Duplicate Name Detected');
  screen.getByText(
    /There is already a voter with the name JANE SMITH in North Lincoln/
  );

  // Simulate override
  apiMock.expectRegisterVoter(
    mockRegistrationData,
    true,
    createMockVoter('created', 'Jane', 'Smith', '23')
  );

  userEvent.click(screen.getByTestId('confirm-duplicate-btn'));
  await screen.findByText('Voter Added');
  screen.getByText('Give the voter their receipt.');
});

test('shows duplicate name modal and allows override - single precinct election', async () => {
  const electionSimpleSinglePrecinct =
    electionSimpleSinglePrecinctFixtures.readElectionDefinition();
  const singlePrecinctId =
    electionSimpleSinglePrecinct.election.precincts[0].id;
  apiMock.setElection(electionSimpleSinglePrecinct, singlePrecinctId);
  apiMock.setPrinterStatus(true);
  apiMock.expectGetDeviceStatuses();
  apiMock.expectGetValidStreetInfo([
    {
      ...validStreetInfo,
      precinct: singlePrecinctId,
    },
  ]);
  await renderComponent();

  // Fill in required fields
  userEvent.type(screen.getByRole('textbox', { name: 'First Name' }), 'Jane');
  userEvent.type(screen.getByRole('textbox', { name: 'Last Name' }), 'Smith');
  userEvent.type(screen.getByRole('textbox', { name: 'Street Number' }), '10');
  userEvent.click(screen.getByLabelText('Street Name'));
  userEvent.keyboard('[Enter]');
  userEvent.click(screen.getByLabelText('Party Affiliation'));
  userEvent.keyboard('[ArrowDown][Enter]');

  // Simulate duplicate name error
  apiMock.expectRegisterVoterError(
    {
      ...mockRegistrationData,
      precinct: singlePrecinctId,
    },
    false,
    [createMockVoter('test-duplicate-id', 'Jane', 'Smith', singlePrecinctId)]
  );

  userEvent.click(screen.getByTestId('add-voter-btn'));
  await screen.findByText('Duplicate Name Detected');
  screen.getByText(
    /There is already a voter with the name JANE SMITH. Please confirm this is not a duplicate registration./
  );

  // Simulate override
  apiMock.expectRegisterVoter(
    {
      ...mockRegistrationData,
      precinct: singlePrecinctId,
    },
    true,
    createMockVoter('created', 'Jane', 'Smith', singlePrecinctId)
  );

  userEvent.click(screen.getByTestId('confirm-duplicate-btn'));
  await screen.findByText('Voter Added');
  screen.getByText('Give the voter their receipt.');
});

test('shows duplicate name modal and allows override - many matches include precinct', async () => {
  apiMock.setPrinterStatus(true);
  apiMock.expectGetDeviceStatuses();
  apiMock.expectGetValidStreetInfo([validStreetInfo]);
  await renderComponent();

  // Fill in required fields
  userEvent.type(screen.getByRole('textbox', { name: 'First Name' }), 'Jane');
  userEvent.type(screen.getByRole('textbox', { name: 'Last Name' }), 'Smith');
  userEvent.type(screen.getByRole('textbox', { name: 'Street Number' }), '10');
  userEvent.click(screen.getByLabelText('Street Name'));
  userEvent.keyboard('[Enter]');
  userEvent.click(screen.getByLabelText('Party Affiliation'));
  userEvent.click(screen.getByLabelText('Party Affiliation'));
  userEvent.keyboard('[ArrowDown][Enter]');

  // Simulate duplicate name error
  apiMock.expectRegisterVoterError(mockRegistrationData, false, [
    createMockVoter('created', 'Jane', 'Smith', '23'),
    createMockVoter('created2', 'Jane', 'Smith', '22'),
    createMockVoter('created3', 'Jane', 'Smith', '22'),
  ]);

  userEvent.click(screen.getButton('Add Voter'));
  await screen.findByText('Duplicate Name Detected');
  screen.getByText(
    /There is already a voter with the name JANE SMITH in North Lincoln/
  );

  // Simulate override
  apiMock.expectRegisterVoter(
    mockRegistrationData,
    true,
    createMockVoter('created', 'Jane', 'Smith', '23')
  );

  userEvent.click(screen.getByTestId('confirm-duplicate-btn'));
  await screen.findByText('Voter Added');
  await screen.findAllByText('Give the voter their receipt.');
});

test('shows duplicate name modal and allows override - one match out of precinct', async () => {
  apiMock.setPrinterStatus(true);
  apiMock.expectGetDeviceStatuses();
  apiMock.expectGetValidStreetInfo([validStreetInfo]);
  await renderComponent();

  // Fill in required fields
  userEvent.type(screen.getByRole('textbox', { name: 'First Name' }), 'Jane');
  userEvent.type(screen.getByRole('textbox', { name: 'Last Name' }), 'Smith');
  userEvent.type(screen.getByRole('textbox', { name: 'Street Number' }), '10');
  userEvent.click(screen.getByLabelText('Street Name'));
  userEvent.keyboard('[Enter]');
  userEvent.click(screen.getByLabelText('Party Affiliation'));
  userEvent.click(screen.getByLabelText('Party Affiliation'));
  userEvent.keyboard('[ArrowDown][Enter]');

  // Simulate duplicate name error
  apiMock.expectRegisterVoterError(mockRegistrationData, false, [
    createMockVoter('created2', 'Jane', 'Smith', '22'),
  ]);

  userEvent.click(screen.getButton('Add Voter'));
  await screen.findByText('Duplicate Name Detected');
  screen.getByText(
    /There is already a voter with the name JANE SMITH in South Lincoln/
  );

  // Simulate override
  apiMock.expectRegisterVoter(
    mockRegistrationData,
    true,
    createMockVoter('created', 'Jane', 'Smith', '23')
  );

  userEvent.click(screen.getByTestId('confirm-duplicate-btn'));
  await screen.findByText('Voter Added');
  await screen.findAllByText('Give the voter their receipt.');
});

test('shows duplicate name modal and allows override - many matches out of precinct', async () => {
  apiMock.setPrinterStatus(true);
  apiMock.expectGetDeviceStatuses();
  apiMock.expectGetValidStreetInfo([validStreetInfo]);
  await renderComponent();

  // Fill in required fields
  userEvent.type(screen.getByRole('textbox', { name: 'First Name' }), 'Jane');
  userEvent.type(screen.getByRole('textbox', { name: 'Last Name' }), 'Smith');
  userEvent.type(screen.getByRole('textbox', { name: 'Street Number' }), '10');
  userEvent.click(screen.getByLabelText('Street Name'));
  userEvent.keyboard('[Enter]');
  userEvent.click(screen.getByLabelText('Party Affiliation'));
  userEvent.click(screen.getByLabelText('Party Affiliation'));
  userEvent.keyboard('[ArrowDown][Enter]');

  // Simulate duplicate name error
  apiMock.expectRegisterVoterError(mockRegistrationData, false, [
    createMockVoter('created2', 'Jane', 'Smith', '22'),
    createMockVoter('created2', 'Jane', 'Smith', '21'),
  ]);

  userEvent.click(screen.getButton('Add Voter'));
  await screen.findByText('Duplicate Name Detected');
  screen.getByText(
    /There are already 2 voters with the name JANE SMITH in other precincts/
  );

  // Simulate override
  apiMock.expectRegisterVoter(
    mockRegistrationData,
    true,
    createMockVoter('created', 'Jane', 'Smith', '23')
  );

  userEvent.click(screen.getByTestId('confirm-duplicate-btn'));
  await screen.findByText('Voter Added');
  await screen.findAllByText('Give the voter their receipt.');
});

test('shows success message after registration - no duplicate warning', async () => {
  apiMock.setPrinterStatus(true);
  apiMock.expectGetDeviceStatuses();
  apiMock.expectGetValidStreetInfo([validStreetInfo]);
  await renderComponent();

  // Fill in required fields
  userEvent.type(screen.getByRole('textbox', { name: 'First Name' }), 'Jane');
  userEvent.type(screen.getByRole('textbox', { name: 'Last Name' }), 'Smith');
  userEvent.type(screen.getByRole('textbox', { name: 'Street Number' }), '10');
  userEvent.click(screen.getByLabelText('Street Name'));
  userEvent.keyboard('[Enter]');
  userEvent.click(screen.getByLabelText('Party Affiliation'));
  userEvent.keyboard('[ArrowDown][Enter]');

  apiMock.expectRegisterVoter(
    mockRegistrationData,
    false,
    createMockVoter('created', 'Jane', 'Smith', '23')
  );

  userEvent.click(screen.getButton('Add Voter'));
  await screen.findByText('Voter Added');
  screen.getByText('Give the voter their receipt.');
});

test('shows invalid address warning', async () => {
  apiMock.setPrinterStatus(true);
  apiMock.expectGetDeviceStatuses();
  apiMock.expectGetValidStreetInfo([validStreetInfo]);
  await renderComponent();

  // Fill in required fields
  userEvent.type(screen.getByRole('textbox', { name: 'First Name' }), 'Jane');
  userEvent.type(screen.getByRole('textbox', { name: 'Last Name' }), 'Smith');
  userEvent.type(screen.getByRole('textbox', { name: 'Street Number' }), '55');
  userEvent.click(screen.getByLabelText('Street Name'));
  userEvent.keyboard('[Enter]');
  userEvent.click(screen.getByLabelText('Party Affiliation'));
  userEvent.keyboard('[ArrowDown][Enter]');
  const addButton = screen.getButton('Add Voter');
  expect(addButton).toBeDisabled();

  await screen.findByText(/Invalid address/);

  const streetNumberInput = screen.getByRole('textbox', {
    name: 'Street Number',
  });
  userEvent.clear(streetNumberInput);
  userEvent.type(streetNumberInput, '10');

  await vi.waitFor(() => expect(addButton).not.toBeDisabled());
});
