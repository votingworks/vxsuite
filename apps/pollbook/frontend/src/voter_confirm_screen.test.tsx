import { expect, test, beforeEach, afterEach, vi } from 'vitest';
import {
  Voter,
  ValidStreetInfo,
  VoterIdentificationMethod,
} from '@votingworks/pollbook-backend';
import userEvent from '@testing-library/user-event';
import {
  electionMultiPartyPrimaryFixtures,
  electionSimpleSinglePrecinctFixtures,
} from '@votingworks/fixtures';
import { Election } from '@votingworks/types';
import { screen, waitFor, within } from '../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  createMockVoter,
} from '../test/mock_api_client';
import { renderInAppContext } from '../test/render_in_app_context';
import { VoterConfirmScreen } from './voter_confirm_screen';

let apiMock: ApiMock;
let unmount: () => void;
const mockVoterId = '123';
let voter: Voter;
let onCancel: ReturnType<typeof vi.fn>;
let onConfirm: ReturnType<typeof vi.fn>;

const electionDefinition =
  electionMultiPartyPrimaryFixtures.readElectionDefinition();
const precinct = electionDefinition.election.precincts[0].id;

beforeEach(() => {
  voter = createMockVoter(mockVoterId, 'ABIGAIL', 'ADAMS', precinct);
  vi.clearAllMocks();
  onCancel = vi.fn();
  onConfirm = vi.fn();
  apiMock = createApiMock();
  apiMock.expectGetVoter(voter);
  apiMock.setElection(electionDefinition, precinct);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  unmount();
});

async function renderComponent({
  isAbsenteeMode = false,
  configuredPrecinctId = precinct,
  election = electionDefinition.election,
  voterOverride,
}: {
  isAbsenteeMode?: boolean;
  configuredPrecinctId?: string;
  voterOverride?: Voter;
  election?: Election;
} = {}) {
  if (voterOverride) {
    apiMock.expectGetVoter(voterOverride);
  }

  const renderResult = renderInAppContext(
    <VoterConfirmScreen
      voterId={mockVoterId}
      isAbsenteeMode={isAbsenteeMode}
      onCancel={onCancel}
      onConfirm={onConfirm}
      election={election}
      configuredPrecinctId={configuredPrecinctId}
    />,
    {
      apiMock,
    }
  );
  unmount = renderResult.unmount;

  await screen.findByRole('heading', { name: 'Confirm Voter Identity' });
  await screen.findByText('ABIGAIL ADAMS');
}

test('renders voter information correctly', async () => {
  await renderComponent();

  // Check voter details are displayed
  screen.getByText('ABIGAIL ADAMS');
  screen.getByText('Undeclared');
  screen.getByText(voter.voterId);
  screen.getByText(/123 Main St/);
});

test('shows absentee mode callout when in absentee mode', async () => {
  await renderComponent({ isAbsenteeMode: true });

  screen.getByText('Absentee Mode');
});

test('shows warning callout for active voters in non-absentee mode', async () => {
  await renderComponent({ isAbsenteeMode: false });

  screen.getByText(
    /Read the voter's information aloud to confirm their identity/
  );
});

test('shows flag callout for inactive voters', async () => {
  const inactiveVoter: Voter = { ...voter, isInactive: true };
  await renderComponent({ voterOverride: inactiveVoter });

  screen.getByText(/This voter was flagged as inactive/);
  screen.getByText(/Notify an election manager if anyone attempts to check in/);
});

test('happy path - active voter check-in with default identification', async () => {
  await renderComponent();

  const confirmButton = screen.getButton('Confirm Check-In');
  expect(confirmButton).not.toBeDisabled();

  userEvent.click(confirmButton);

  const expectedIdentification: VoterIdentificationMethod = { type: 'default' };
  expect(onConfirm).toHaveBeenCalledWith(expectedIdentification);
});

test('happy path - active voter check-in in absentee mode', async () => {
  await renderComponent({ isAbsenteeMode: true });

  // Out-of-state ID controls should not be visible in absentee mode
  expect(screen.queryByText('Out-of-State ID')).toBeNull();

  const confirmButton = screen.getButton('Confirm Check-In');
  userEvent.click(confirmButton);

  const expectedIdentification: VoterIdentificationMethod = { type: 'default' };
  expect(onConfirm).toHaveBeenCalledWith(expectedIdentification);
});

test('out-of-state identification method', async () => {
  await renderComponent();

  const outOfStateCheckbox = screen.getByRole('checkbox', {
    name: 'Out-of-State ID',
  });
  userEvent.click(outOfStateCheckbox);

  // Confirm button should be disabled until state is selected
  const confirmButton = screen.getButton('Confirm Check-In');
  expect(confirmButton).toBeDisabled();

  // Select a state
  const stateSelect = screen.getByLabelText('Select state');
  userEvent.click(stateSelect);
  const californiaOption = await screen.findByText('CA - California');
  userEvent.click(californiaOption);

  // Now confirm button should be enabled
  expect(confirmButton).not.toBeDisabled();
  userEvent.click(confirmButton);

  const expectedIdentification: VoterIdentificationMethod = {
    type: 'outOfStateLicense',
    state: 'CA',
  };
  expect(onConfirm).toHaveBeenCalledWith(expectedIdentification);
});

test('inactive voter confirmation modal - confirm check-in', async () => {
  const inactiveVoter: Voter = { ...voter, isInactive: true };
  await renderComponent({ voterOverride: inactiveVoter });

  const confirmButton = screen.getButton('Confirm Check-In');
  userEvent.click(confirmButton);

  // Modal should appear
  await screen.findByRole('heading', {
    name: 'Confirm Check-In',
  });
  screen.getByText(
    /This voter was flagged as inactive. Continue only if you have confirmed/
  );

  // Find the modal and click confirm button within it
  const modal = screen.getByRole('alertdialog');
  const modalConfirmButton = within(modal).getButton('Confirm Check-In');
  userEvent.click(modalConfirmButton);

  const expectedIdentification: VoterIdentificationMethod = { type: 'default' };
  expect(onConfirm).toHaveBeenCalledWith(expectedIdentification);
});

test('inactive voter confirmation modal - close modal', async () => {
  const inactiveVoter: Voter = { ...voter, isInactive: true };
  await renderComponent({ voterOverride: inactiveVoter });

  const confirmButton = screen.getButton('Confirm Check-In');
  userEvent.click(confirmButton);

  // Modal should appear
  await screen.findByRole('heading', {
    name: 'Confirm Check-In',
  });

  // Find the modal and click close button within it
  const modal = screen.getByRole('alertdialog');
  const closeButton = within(modal).getButton('Cancel');
  userEvent.click(closeButton);

  // Modal should close and onConfirm should not be called
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  expect(onConfirm).not.toHaveBeenCalled();
});

test('cancel button calls onCancel', async () => {
  await renderComponent();

  const cancelButton = screen.getButton('Cancel');
  userEvent.click(cancelButton);

  expect(onCancel).toHaveBeenCalled();
});

test('update domicile address button opens address flow', async () => {
  // Mock the address update flow requirements
  const validStreetInfo: ValidStreetInfo[] = [
    {
      streetName: 'MAIN ST',
      side: 'all',
      lowRange: 1,
      highRange: 100,
      postalCityTown: 'CONCORD',
      zip5: '03301',
      zip4: '1111',
      precinct,
    },
  ];
  apiMock.expectGetValidStreetInfo(validStreetInfo);

  await renderComponent();

  const updateAddressButton = screen.getButton('Update Domicile Address');
  userEvent.click(updateAddressButton);

  // Should show the address update flow
  await screen.findByRole('heading', { name: 'Update Voter Domicile Address' });
});

test('displays voter with name change', async () => {
  const voterWithNameChange: Voter = {
    ...voter,
    nameChange: {
      firstName: 'NABBY',
      middleName: 'ABIGAIL',
      lastName: 'ADDAMS',
      suffix: 'JR',
      timestamp: new Date().toISOString(),
    },
  };

  await renderComponent({ voterOverride: voterWithNameChange });

  // Should show old name crossed out
  const oldName = screen.getByText('ABIGAIL ADAMS');
  expect(oldName.closest('s')).toBeDefined();

  // Should show new name
  screen.getByText('NABBY ABIGAIL ADDAMS JR');
});

test('displays voter with address change', async () => {
  const voterWithAddressChange: Voter = {
    ...voter,
    addressChange: {
      streetNumber: '456',
      streetName: 'OAK AVE',
      streetSuffix: '',
      apartmentUnitNumber: '#2B',
      houseFractionNumber: '',
      addressLine2: '',
      addressLine3: '',
      city: 'SPRINGFIELD',
      state: 'IL',
      zipCode: '62701-2345',
      timestamp: new Date().toISOString(),
      precinct,
    },
  };

  await renderComponent({ voterOverride: voterWithAddressChange });

  // Should show old address crossed out
  screen.getByText(/123 Main St/);

  // Should show new address
  screen.getByText('456 OAK AVE #2B');
  screen.getByText('SPRINGFIELD, IL 62701-2345');
});

test('returns null when voter query is not successful', () => {
  // Don't set up the expectGetVoter call to simulate loading state
  const renderResult = renderInAppContext(
    <VoterConfirmScreen
      voterId={mockVoterId}
      isAbsenteeMode={false}
      onCancel={onCancel}
      onConfirm={onConfirm}
      election={electionDefinition.election}
      configuredPrecinctId={precinct}
    />,
    {
      apiMock,
    }
  );

  // Component should render nothing while loading
  expect(
    screen.queryByRole('heading', { name: 'Confirm Voter Identity' })
  ).toBeNull();

  renderResult.unmount();
});

test('unchecking out-of-state ID returns to default identification', async () => {
  await renderComponent();

  screen.getByText(electionDefinition.election.precincts[0].name);
  const outOfStateCheckbox = screen.getByRole('checkbox', {
    name: 'Out-of-State ID',
  });
  userEvent.click(outOfStateCheckbox);

  // Select a state
  const stateSelect = screen.getByLabelText('Select state');
  userEvent.click(stateSelect);
  const californiaOption = await screen.findByText('CA - California');
  userEvent.click(californiaOption);

  // Uncheck the out-of-state ID checkbox
  userEvent.click(outOfStateCheckbox);

  // State select should disappear and confirm should work with default
  expect(screen.queryByLabelText('Select state')).toBeNull();

  const confirmButton = screen.getButton('Confirm Check-In');
  expect(confirmButton).not.toBeDisabled();
  userEvent.click(confirmButton);

  const expectedIdentification: VoterIdentificationMethod = { type: 'default' };
  expect(onConfirm).toHaveBeenCalledWith(expectedIdentification);
});

test('displays updated precinct after address change', async () => {
  const voterWithAddressChange: Voter = {
    ...voter,
    addressChange: {
      streetNumber: '456',
      streetName: 'OAK AVE',
      streetSuffix: '',
      apartmentUnitNumber: '#2B',
      houseFractionNumber: '',
      addressLine2: '',
      addressLine3: '',
      city: 'SPRINGFIELD',
      state: 'IL',
      zipCode: '62701-2345',
      timestamp: new Date().toISOString(),
      precinct: electionDefinition.election.precincts[1].id, // Use the same precinct for simplicity
    },
  };

  await renderComponent({ voterOverride: voterWithAddressChange });

  // Should display the updated precinct
  screen.getByText(electionDefinition.election.precincts[1].name);
});

test('disables confirm check-in and out-of-state ID checkbox if precincts do not match', async () => {
  const mismatchedPrecinct = electionDefinition.election.precincts[1].id;
  await renderComponent({ configuredPrecinctId: mismatchedPrecinct });

  // Confirm button should be disabled
  const confirmButton = screen.getButton('Confirm Check-In');
  expect(confirmButton).toBeDisabled();

  // Update mailing address button should also be disabled
  const mailingAddrButton = screen.getButton('Update Mailing Address');
  expect(mailingAddrButton).toBeDisabled();

  // Update domicle address button should NOT be disabled
  const domicileAddrButton = screen.getButton('Update Domicile Address');
  expect(domicileAddrButton).not.toBeDisabled();

  // Out-of-state ID checkbox should also be disabled
  const outOfStateCheckbox = screen.getByRole('checkbox', {
    name: 'Out-of-State ID',
  });
  expect(outOfStateCheckbox).toBeDisabled();

  screen.getByText(
    /The voter cannot be checked in because their address is in another precinct/
  );
});

test('precinct information not shown in single precinct election', async () => {
  const singlePrecinctElection =
    electionSimpleSinglePrecinctFixtures.readElectionDefinition();
  const singlePrecinctId = singlePrecinctElection.election.precincts[0].id;
  const newVoter = createMockVoter(
    mockVoterId,
    'ABIGAIL',
    'ADAMS',
    singlePrecinctId
  );
  apiMock = createApiMock();
  apiMock.expectGetVoter(newVoter);
  apiMock.setElection(singlePrecinctElection, singlePrecinctId);
  await renderComponent({
    configuredPrecinctId: singlePrecinctId,
    election: singlePrecinctElection.election,
  });

  // Should not display "Precinct" label in single precinct election
  expect(screen.queryByText('Precinct')).toBeNull();
  expect(
    screen.queryByText(singlePrecinctElection.election.precincts[0].name)
  ).toBeNull();

  // Checking in should be enabled.
  const outOfStateCheckbox = screen.getByRole('checkbox', {
    name: 'Out-of-State ID',
  });
  expect(outOfStateCheckbox).not.toBeDisabled();
});
