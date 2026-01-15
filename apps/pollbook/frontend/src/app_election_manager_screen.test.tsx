import { expect, test, beforeEach, afterEach, vi } from 'vitest';

import {
  Election,
  ElectionDefinition,
  ValidStreetInfo,
  VoterRegistrationRequest,
} from '@votingworks/types';
import { electionMultiPartyPrimaryFixtures } from '@votingworks/fixtures';

import userEvent from '@testing-library/user-event';
import {
  ApiMock,
  createApiMock,
  createMockVoter,
} from '../test/mock_api_client';
import { act, render, screen } from '../test/react_testing_library';
import { App } from './app';
import { AUTOMATIC_FLOW_STATE_RESET_DELAY_MS } from './globals';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from './api';

let apiMock: ApiMock;
const election: Election = electionMultiPartyPrimaryFixtures.readElection();
const electionDef: ElectionDefinition =
  electionMultiPartyPrimaryFixtures.readElectionDefinition();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.expectGetActiveAnomalies([]);
  apiMock.setElection(undefined);
  apiMock.setIsAbsenteeMode(false);
  apiMock.expectHaveElectionEventsOccurred();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('basic e2e registration flow works', async () => {
  const validStreetInfos: ValidStreetInfo[] = [
    {
      streetName: 'Main St',
      side: 'even',
      lowRange: 1000,
      highRange: 2000,
      postalCityTown: 'CITYVILLE',
      zip5: '12345',
      zip4: '6789',
      precinct: 'precinct-1',
    },
    {
      streetName: 'Main St',
      side: 'even',
      lowRange: 2000,
      highRange: 3000,
      postalCityTown: 'CITYVILLE',
      zip5: '12345',
      zip4: '6789',
      precinct: 'precinct-2',
    },
  ];
  const voter = createMockVoter('123', 'Abigail', 'Adams');
  const registrationData: VoterRegistrationRequest = {
    streetNumber: '1000',
    streetName: 'MAIN ST',
    city: 'CITYVILLE',
    state: 'NH',
    zipCode: '12345',
    lastName: voter.lastName.toUpperCase(),
    firstName: voter.firstName.toUpperCase(),
    party: 'REP',
    streetSuffix: '',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    suffix: '',
    middleName: '',
    precinct: 'precinct-1',
  };

  apiMock.expectGetDeviceStatuses();
  apiMock.authenticateAsElectionManager(election);
  apiMock.setElection(electionDef, 'precinct-1');
  const { unmount } = render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.expectGetValidStreetInfo(validStreetInfos);
  await screen.findByText('Registration');

  const registrationTab = await screen.findByRole('button', {
    name: 'Registration',
  });
  userEvent.click(registrationTab);

  await screen.findByText('Connect printer to continue.');

  apiMock.setPrinterStatus(true);

  // Allow printer status query to refresh
  vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);

  await screen.findByText('Voter Registration');

  // Set name
  const lastNameInput = await screen.findByLabelText('Last Name');
  userEvent.type(lastNameInput, voter.lastName);
  const firstNameInput = screen.getByLabelText('First Name');
  userEvent.type(firstNameInput, voter.firstName);

  // Set invalid street address
  const streetNumberInput = screen.getByLabelText('Street Number');
  userEvent.type(streetNumberInput, '4000');
  userEvent.click(screen.getByLabelText('Street Name'));
  userEvent.keyboard('[Enter]');
  await screen.findByText(/Invalid address/);

  // Set street address for a different precinct
  userEvent.clear(streetNumberInput);
  userEvent.type(streetNumberInput, '2500');
  await screen.findByText(
    /This address is associated with a different precinct/
  );

  // Set valid street address
  userEvent.clear(streetNumberInput);
  userEvent.type(streetNumberInput, '1000');

  // Set party affiliation
  userEvent.click(screen.getByLabelText('Party Affiliation'));
  userEvent.keyboard('[Enter]');

  apiMock.expectRegisterVoter(registrationData, false, voter);

  userEvent.click(screen.getByRole('button', { name: 'Add Voter' }));

  await screen.findByText('Give the voter their receipt.');
  act(() => {
    vi.advanceTimersByTime(AUTOMATIC_FLOW_STATE_RESET_DELAY_MS);
  });
  expect(screen.queryByText('Give the voter their receipt.')).toBeNull();

  unmount();
});
