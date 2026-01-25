import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import {
  CheckInBallotParty,
  ValidStreetInfo,
  Voter,
  VoterAddressChangeRequest,
  VoterMailingAddressChangeRequest,
  VoterNameChangeRequest,
  VoterRegistrationRequest,
} from '@votingworks/types';
import { Route, Switch } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import {
  electionFamousNames2021Fixtures,
  electionMultiPartyPrimaryFixtures,
  electionSimpleSinglePrecinctFixtures,
} from '@votingworks/fixtures';
import { screen, waitFor, within } from '../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  createMockVoter,
} from '../test/mock_api_client';
import { renderInAppContext } from '../test/render_in_app_context';
import { VoterDetailsScreen } from './voter_details_screen';

let apiMock: ApiMock;

let unmount: () => void;
const mockVoterId = '123';
let voter: Voter;

const registrationData: VoterRegistrationRequest = {
  streetNumber: '1000',
  streetName: 'MAIN ST',
  city: 'CITYVILLE',
  state: 'NH',
  zipCode: '12345',
  lastName: 'LAST',
  firstName: 'FIRST',
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

async function renderComponent() {
  const renderResult = renderInAppContext(
    <Switch>
      <Route path="/voters/:voterId">
        <VoterDetailsScreen />
      </Route>
    </Switch>,
    {
      route: `/voters/${mockVoterId}`,
      apiMock,
    }
  );
  unmount = renderResult.unmount;

  // Wait for the main voter details content to load - wait for a button that's always present
  await screen.findByRole('button', { name: 'Update Name' });
}

describe('common functionality', () => {
  const electionFamousNames =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const precinct1 = electionFamousNames.election.precincts[0];

  beforeEach(() => {
    voter = createMockVoter(mockVoterId, 'ABIGAIL', 'ADAMS', precinct1.id);
    vi.clearAllMocks();
    apiMock = createApiMock();
    apiMock.expectGetVoter(voter);
    apiMock.setElection(electionFamousNames, precinct1.id);
  });

  afterEach(() => {
    apiMock.mockApiClient.assertComplete();
    unmount();
  });

  test.each([
    ['Update Name'],
    ['Update Domicile Address'],
    ['Update Mailing Address'],
  ])(
    '%s flow renders a warning when no printer is attached',
    async (buttonName) => {
      apiMock.setPrinterStatus(false);
      apiMock.expectGetDeviceStatuses();

      await renderComponent();

      userEvent.click(screen.getButton(buttonName));

      await screen.findByRole('heading', { name: 'No Printer Detected' });
    }
  );

  // Specifies a DOM element to look for and value to enter
  interface InputElementChangeSpec {
    domElementText: string;
    domElementRole?: string;
    newValue: string;
  }

  test('name change', async () => {
    apiMock.setPrinterStatus(true);
    apiMock.expectGetDeviceStatuses();

    await renderComponent();

    userEvent.click(screen.getButton('Update Name'));

    const nameParts: InputElementChangeSpec[] = [
      {
        domElementText: 'First Name',
        newValue: 'NABBY',
      },
      {
        domElementText: 'Middle Name',
        newValue: 'ABIGAIL',
      },
      {
        domElementText: 'Last Name',
        newValue: 'ADDAMS',
      },
      {
        domElementText: 'Suffix',
        newValue: 'Jr',
      },
    ];
    for (const part of nameParts) {
      const partInput = await screen.findByRole('textbox', {
        name: part.domElementText,
      });
      userEvent.type(partInput, part.newValue);
    }

    const nameChangeData: VoterNameChangeRequest = {
      lastName: 'ADDAMS',
      firstName: 'NABBY',
      middleName: 'ABIGAIL',
      suffix: 'JR',
    };
    const expectation = {
      voterId: mockVoterId,
      nameChangeData,
      voterToUpdate: voter,
    } as const;
    apiMock.expectChangeVoterName(expectation);
    const updatedVoter: Voter = {
      ...voter,
      nameChange: { ...nameChangeData, timestamp: new Date().toISOString() },
    };
    const updateButton = screen.getButton('Confirm Name Update');
    userEvent.click(updateButton);

    apiMock.expectGetVoter(updatedVoter);
    userEvent.click(await screen.findButton('Return to Voter Details'));

    await waitFor(() => {
      expect(screen.queryByText('Update Voter Name')).toBeNull();
    });

    await screen.findByText('NABBY ABIGAIL ADDAMS JR');
    const oldName = screen.getByText('ABIGAIL ADAMS');
    expect(oldName.parentElement?.tagName).toEqual('S');
  });

  test('invalid address change', async () => {
    apiMock.setPrinterStatus(true);
    apiMock.expectGetDeviceStatuses();
    const validStreetInfo: ValidStreetInfo[] = [
      {
        streetName: 'MAIN ST',
        side: 'all',
        lowRange: 1,
        highRange: 100,
        postalCityTown: 'CONCORD',
        zip5: '03301',
        zip4: '1111',
        precinct: precinct1.id,
      },
    ];
    apiMock.expectGetValidStreetInfo(validStreetInfo);

    await renderComponent();

    // Precinct information should be shown in a multi-precinct election
    await screen.findByText(precinct1.name);

    userEvent.click(screen.getButton('Update Domicile Address'));

    await screen.findByRole('heading', {
      name: 'Update Voter Domicile Address',
    });

    userEvent.click(screen.getByLabelText('Street Name'));
    userEvent.keyboard('[Enter]');

    const partInput = await screen.findByRole('textbox', {
      name: 'Street Number',
    });
    userEvent.type(partInput, '1000000');

    await screen.findByText(/Invalid address/);
    await screen.findByText(/Franklin County/);
  });

  test('invalid address change for precinct', async () => {
    apiMock.setPrinterStatus(true);
    apiMock.expectGetDeviceStatuses();
    apiMock.setElection(electionFamousNames, precinct1.id);
    const validStreetInfo: ValidStreetInfo[] = [
      {
        streetName: 'MAIN ST',
        side: 'all',
        lowRange: 1,
        highRange: 100,
        postalCityTown: 'CONCORD',
        zip5: '03301',
        zip4: '1111',
        precinct: electionFamousNames.election.precincts[1].id, // Different precinct
      },
    ];
    apiMock.expectGetValidStreetInfo(validStreetInfo);

    await renderComponent();

    await screen.findByText(`${voter.streetNumber} ${voter.streetName}`);
    userEvent.click(screen.getButton('Update Domicile Address'));

    await screen.findByRole('heading', {
      name: 'Update Voter Domicile Address',
    });

    userEvent.click(screen.getByLabelText('Street Name'));
    userEvent.keyboard('[Enter]');

    const partInput = await screen.findByRole('textbox', {
      name: 'Street Number',
    });
    userEvent.type(partInput, '42');

    await vi.waitFor(
      async () =>
        await screen.findByText(
          /This address is associated with a different precinct, /
        )
    );
  });

  test('valid address change', async () => {
    const electionSinglePrecinct =
      electionSimpleSinglePrecinctFixtures.readElectionDefinition();
    const precinct = electionSinglePrecinct.election.precincts[0];
    const sampleVoter: Voter = {
      ...createMockVoter(mockVoterId, 'ABIGAIL', 'ADAMS', precinct.id),
      houseFractionNumber: '1/2',
      streetNumber: '200',
      streetName: 'SOMETHING STREET',
    };

    // clear out the beforeEach setup as we are using a different election here.
    apiMock = createApiMock();
    apiMock.expectGetVoter(sampleVoter);
    apiMock.setElection(electionSinglePrecinct, precinct.id);
    apiMock.setPrinterStatus(true);
    apiMock.expectGetDeviceStatuses();
    const validStreetInfo: ValidStreetInfo[] = [
      {
        streetName: 'MAIN ST',
        side: 'all',
        lowRange: 1,
        highRange: 100,
        postalCityTown: 'CONCORD',
        zip5: '03301',
        zip4: '1111',
        precinct: precinct.id,
      },
    ];
    apiMock.expectGetValidStreetInfo(validStreetInfo);

    await renderComponent();

    await screen.findByText('200 1/2 SOMETHING STREET');
    userEvent.click(screen.getButton('Update Domicile Address'));

    // Precinct information should NOT be shown in a single-precinct election
    expect(screen.queryByText(precinct1.name)).toBeNull();

    await screen.findByRole('heading', {
      name: 'Update Voter Domicile Address',
    });

    userEvent.click(screen.getByLabelText('Street Name'));
    userEvent.keyboard('[Enter]');

    const addressParts: InputElementChangeSpec[] = [
      {
        domElementText: 'Street Number',
        newValue: '99',
      },
      {
        domElementText: 'Apartment or Unit Number',
        newValue: '#789',
      },
      {
        domElementText: 'Address Line 2',
        newValue: 'LINE 2',
      },
    ];
    for (const part of addressParts) {
      const partInput = await screen.findByRole('textbox', {
        name: part.domElementText,
      });
      userEvent.type(partInput, part.newValue);
    }

    const addressChangeData: VoterAddressChangeRequest = {
      streetNumber: '99',
      streetName: 'MAIN ST',
      apartmentUnitNumber: '#789',
      addressLine2: 'LINE 2',
      addressLine3: '',
      city: 'CONCORD',
      zipCode: '03301',
      streetSuffix: '',
      houseFractionNumber: '',
      state: 'NH',
      precinct: precinct.id,
    };
    const expectation = {
      voterId: mockVoterId,
      addressChangeData,
      voterToUpdate: sampleVoter,
    } as const;
    apiMock.expectChangeVoterAddress(expectation);
    const updatedVoter: Voter = {
      ...sampleVoter,
      addressChange: {
        ...addressChangeData,
        timestamp: new Date().toISOString(),
      },
    };
    const updateButton = screen.getButton('Confirm Domicile Address Update');
    userEvent.click(updateButton);

    apiMock.expectGetVoter(updatedVoter);
    userEvent.click(await screen.findButton('Return to Voter Details'));

    await waitFor(() => {
      expect(screen.queryByText('Update Voter Domicile Address')).toBeNull();
    });

    await screen.findByText('99 MAIN ST #789');
    const oldAddress = await screen.findByText(`200 1/2 SOMETHING STREET`);
    expect(oldAddress.parentElement?.style?.textDecoration).toEqual(
      'line-through'
    );
  });

  test('undo check-in', async () => {
    const checkedInVoter: Voter = {
      ...voter,
      checkIn: {
        identificationMethod: { type: 'default' },
        timestamp: new Date().toISOString(),
        isAbsentee: false,
        receiptNumber: 0,
        machineId: 'test-machine-01',
        ballotParty: 'REP',
      },
    };

    apiMock.expectGetVoter(checkedInVoter);
    apiMock.setPrinterStatus(true);
    apiMock.expectGetDeviceStatuses();

    await renderComponent();

    const undoCheckInReason = 'accidental check-in';
    apiMock.expectUndoVoterCheckIn(checkedInVoter, undoCheckInReason);
    userEvent.click(await screen.findButton('Undo Check-In'));

    await screen.findByRole('heading', { name: 'Undo Check-In' });
    screen.getByText('Record the reason for undoing the check-in:');
    const textInput = screen.getByRole('textbox', {
      name: 'reason for undoing check-in',
    });
    userEvent.type(textInput, undoCheckInReason);

    // updatedVoter should be the same as the default mock voter in this file, but
    // we make this assignment to make it clear what the expected diff is
    const updatedVoter: Voter = { ...checkedInVoter, checkIn: undefined };
    apiMock.expectGetVoter(updatedVoter);

    // Get the modal and find the button within it
    const modal = screen.getByRole('alertdialog');
    const undoButton = within(modal).getByRole('button', {
      name: 'Undo Check-In',
    });
    userEvent.click(undoButton);

    await screen.findByText('Not Checked In');
  });

  test('undo check-in modal closes and does not crash if another client undoes the check-in', async () => {
    const checkedInVoter: Voter = {
      ...voter,
      checkIn: {
        identificationMethod: { type: 'default' },
        timestamp: new Date().toISOString(),
        isAbsentee: false,
        receiptNumber: 0,
        machineId: 'test-machine-01',
        ballotParty: 'REP',
      },
    };

    apiMock.expectGetVoter(checkedInVoter);
    apiMock.setPrinterStatus(true);
    apiMock.expectGetDeviceStatuses();

    await renderComponent();

    // Open the undo check-in modal
    userEvent.click(await screen.findButton('Undo Check-In'));
    await screen.findByRole('heading', { name: 'Undo Check-In' });

    // Simulate another client undoing the check-in by returning voter without check-in
    const updatedVoter: Voter = { ...checkedInVoter, checkIn: undefined };
    apiMock.expectGetVoter(updatedVoter);

    // Modal should automatically close and show "Not Checked In" status
    await screen.findByText('Not Checked In');

    // Modal should be gone
    expect(screen.queryByRole('heading', { name: 'Undo Check-In' })).toBeNull();
  });

  test('reprint check-in receipt', async () => {
    const checkedInVoter: Voter = {
      ...voter,
      checkIn: {
        identificationMethod: { type: 'default' },
        timestamp: new Date().toISOString(),
        isAbsentee: false,
        receiptNumber: 0,
        machineId: 'test-machine-01',
        ballotParty: 'DEM',
      },
    };
    apiMock.expectGetVoter(checkedInVoter);
    apiMock.expectGetDeviceStatuses();
    apiMock.setPrinterStatus(true);

    await renderComponent();

    // Check that we do not see the ability to Mark Voter Inactive
    expect(screen.queryByText('Mark Voter Inactive')).toBeNull();

    const reprintButton = screen.getButton('Reprint Receipt');
    expect(reprintButton).not.toBeDisabled();
    apiMock.expectReprintReceipt(checkedInVoter);
    userEvent.click(reprintButton);

    screen.getByText('Printing');
  });

  test('reprint check-in receipt - no printer', async () => {
    const checkedInVoter: Voter = {
      ...voter,
      checkIn: {
        identificationMethod: { type: 'default' },
        timestamp: new Date().toISOString(),
        isAbsentee: false,
        receiptNumber: 0,
        machineId: 'test-machine-01',
        ballotParty: 'DEM',
      },
    };
    apiMock.expectGetVoter(checkedInVoter);
    apiMock.expectGetDeviceStatuses();
    apiMock.setPrinterStatus(false);

    await renderComponent();

    const reprintButton = screen.getButton('Reprint Receipt');
    expect(reprintButton).toBeDisabled();
  });

  test('reprint check-in receipt - error path', async () => {
    const checkedInVoter: Voter = {
      ...voter,
      checkIn: {
        identificationMethod: { type: 'default' },
        timestamp: new Date().toISOString(),
        isAbsentee: false,
        receiptNumber: 0,
        machineId: 'test-machine-01',
        ballotParty: 'REP',
      },
    };
    apiMock.expectGetVoter(checkedInVoter);
    apiMock.expectGetDeviceStatuses();
    apiMock.setPrinterStatus(true);

    await renderComponent();

    const reprintButton = screen.getButton('Reprint Receipt');
    apiMock.expectReprintReceiptError(checkedInVoter);
    userEvent.click(reprintButton);

    await vi.waitFor(() => {
      screen.getByText('Error Reprinting');
    });
  });

  test('mark inactive - happy path', async () => {
    apiMock.expectGetVoter(voter);
    apiMock.expectGetDeviceStatuses();

    await renderComponent();

    const markInactiveButton = screen.getButton('Mark Voter Inactive');
    userEvent.click(markInactiveButton);
    await screen.findByText(/After a voter is marked inactive/);

    apiMock.expectMarkInactive(voter);
    apiMock.expectGetVoter({
      ...voter,
      isInactive: true,
    });

    // Get the modal and find the button within it
    const modal = screen.getByRole('alertdialog');
    const confirmButton = within(modal).getByRole('button', {
      name: 'Mark Voter Inactive',
    });
    userEvent.click(confirmButton);
  });

  test('mark voter inactive - error path', async () => {
    apiMock.expectGetVoter(voter);
    apiMock.expectGetDeviceStatuses();

    await renderComponent();

    const markInactiveButton = screen.getButton('Mark Voter Inactive');
    userEvent.click(markInactiveButton);
    await screen.findByText(/After a voter is marked inactive/);

    apiMock.expectMarkInactiveError(voter);
    apiMock.expectGetVoter(voter);
    // Get the modal and find the button within it
    const modal = screen.getByRole('alertdialog');
    const confirmButton = within(modal).getByRole('button', {
      name: 'Mark Voter Inactive',
    });
    userEvent.click(confirmButton);

    await screen.findByText('Error Marking Inactive');
  });

  test('Delete Registration - happy path', async () => {
    // Create a voter that is a same-day registration (has registrationEvent)
    const registeredVoter: Voter = {
      ...voter,
      registrationEvent: {
        ...registrationData,
        voterId: mockVoterId,
        timestamp: new Date().toISOString(),
        precinct: 'precinct-1',
        party: 'UND',
      },
    };
    apiMock.expectGetVoter(registeredVoter);
    apiMock.expectGetDeviceStatuses();

    await renderComponent();

    const markInvalidButton = screen.getButton('Delete Registration');
    userEvent.click(markInvalidButton);
    await screen.findByText(/The voter will be excluded/);

    apiMock.expectInvalidateRegistration(registeredVoter);
    apiMock.expectGetVoter({
      ...registeredVoter,
      isInvalidatedRegistration: true,
    });

    // Get the modal and find the button within it
    const modal = screen.getByRole('alertdialog');
    const confirmButton = within(modal).getByRole('button', {
      name: 'Delete Registration',
    });
    userEvent.click(confirmButton);

    await screen.findByRole('heading', { name: 'Registration Deleted' });
  });

  test('Delete Registration - error (voter already checked in)', async () => {
    // Create a voter that is a same-day registration (has registrationEvent)
    const registeredVoter: Voter = {
      ...voter,
      registrationEvent: {
        ...registrationData,
        voterId: mockVoterId,
        timestamp: new Date().toISOString(),
        precinct: 'precinct-1',
        party: 'UND',
      },
    };
    apiMock.expectGetVoter(registeredVoter);
    apiMock.expectGetDeviceStatuses();

    await renderComponent();

    const markInvalidButton = screen.getButton('Delete Registration');
    userEvent.click(markInvalidButton);
    await screen.findByText(/The voter will be excluded/);

    apiMock.expectInvalidateRegistrationError(
      registeredVoter,
      'voter_checked_in'
    );
    apiMock.expectGetVoter(registeredVoter);

    // Get the modal and find the button within it
    const modal = screen.getByRole('alertdialog');
    const confirmButton = within(modal).getByRole('button', {
      name: 'Delete Registration',
    });
    userEvent.click(confirmButton);

    await screen.findByText('Error Deleting Registration');
    await screen.findByText(
      'This voter is already checked in. Their registration cannot be deleted.'
    );
  });

  test('Delete Registration button only appears for same-day registrations', async () => {
    // Normal voter without registrationEvent should NOT show Delete Registration button
    apiMock.expectGetVoter(voter);
    apiMock.expectGetDeviceStatuses();

    await renderComponent();

    // Should show Mark Voter Inactive for normal voters
    expect(
      screen.queryByRole('button', { name: 'Mark Voter Inactive' })
    ).toBeInTheDocument();
    // Should NOT show Delete Registration for normal voters
    expect(
      screen.queryByRole('button', { name: 'Delete Registration' })
    ).not.toBeInTheDocument();
  });

  test('invalidated registration shows correct status', async () => {
    // Create a voter that has been marked as invalid
    const invalidatedVoter: Voter = {
      ...voter,
      isInvalidatedRegistration: true,
      registrationEvent: {
        ...registrationData,
        voterId: mockVoterId,
        timestamp: new Date().toISOString(),
        precinct: 'precinct-1',
        party: 'UND',
      },
    };
    apiMock.expectGetVoter(invalidatedVoter);
    apiMock.expectGetDeviceStatuses();

    await renderComponent();

    // Should show the invalidated status
    await screen.findByRole('heading', { name: 'Registration Deleted' });

    // Should NOT show the Delete Registration button since already invalidated
    expect(
      screen.queryByRole('button', { name: 'Delete Registration' })
    ).not.toBeInTheDocument();

    // Should NOT show Mark Voter Inactive since it's invalidated
    expect(
      screen.queryByRole('button', { name: 'Mark Voter Inactive' })
    ).not.toBeInTheDocument();
  });

  test('actions are disabled when precinct not configured', async () => {
    apiMock.expectGetVoter(voter);
    apiMock.setElection(
      electionFamousNames2021Fixtures.readElectionDefinition()
    );
    apiMock.expectGetDeviceStatuses();

    await renderComponent();

    const markInactiveButtons = screen.getAllByRole('button', {
      name: 'Mark Voter Inactive',
    });
    // Find the first button (should be from main screen, not modal)
    const markInactiveButton = markInactiveButtons[0];
    expect(markInactiveButton).toBeDisabled();

    const updateNameButtons = screen.getAllByRole('button', {
      name: 'Update Name',
    });
    // Find the first button (should be from main screen, not modal)
    const nameButton = updateNameButtons[0];
    expect(nameButton).toBeDisabled();

    const updateAddressButtons = screen.getAllByRole('button', {
      name: 'Update Domicile Address',
    });
    // Find the first button (should be from main screen, not modal)
    const addressButton = updateAddressButtons[0];
    expect(addressButton).toBeDisabled();

    const updateMailingAddressButtons = screen.getAllByRole('button', {
      name: 'Update Mailing Address',
    });
    // Find the first button (should be from main screen, not modal)
    const updateMailingAddressButton = updateMailingAddressButtons[0];
    expect(updateMailingAddressButton).toBeDisabled();
  });

  test('actions are disabled when precinct does not match voter', async () => {
    const otherPrecinct = electionFamousNames.election.precincts[1];
    const changedVoter = createMockVoter(
      mockVoterId,
      'ABIGAIL',
      'ADAMS',
      otherPrecinct.id
    );
    apiMock.expectGetVoter(changedVoter);
    apiMock.expectGetDeviceStatuses();

    await renderComponent();

    const markInactiveButtons = screen.getAllByRole('button', {
      name: 'Mark Voter Inactive',
    });
    // Find the first button (should be from main screen, not modal)
    const markInactiveButton = markInactiveButtons[0];
    expect(markInactiveButton).toBeDisabled();

    const updateNameButtons = screen.getAllByRole('button', {
      name: 'Update Name',
    });
    // Find the first button (should be from main screen, not modal)
    const nameButton = updateNameButtons[0];
    expect(nameButton).toBeDisabled();

    const updateAddressButtons = screen.getAllByRole('button', {
      name: 'Update Domicile Address',
    });
    const addressButton = updateAddressButtons[0];
    expect(addressButton).toBeDisabled();

    const updateMailingAddressButtons = screen.getAllByRole('button', {
      name: 'Update Mailing Address',
    });
    // Find the first button (should be from main screen, not modal)
    const updateMailingAddressButton = updateMailingAddressButtons[0];
    expect(updateMailingAddressButton).toBeDisabled();
  });

  test('update mailing address - no previous mailing address', async () => {
    apiMock.expectGetDeviceStatuses();
    apiMock.setPrinterStatus(true);
    await renderComponent();

    // Check that Mailing Address is not present when voter has no mailing address
    // (hasMailingAddress returns false)
    expect(screen.queryByText('Mailing Address')).toBeNull();

    // Also, the "Update Mailing Address" button should still be present and enabled/disabled appropriately
    const updateMailingAddressButtons = screen.getAllByRole('button', {
      name: 'Update Mailing Address',
    });
    // Find the first button (should be from main screen, not modal)
    const updateMailingAddressButton = updateMailingAddressButtons[0];
    // Should be enabled if precinct is configured and matches voter
    expect(updateMailingAddressButton).not.toBeDisabled();
    userEvent.click(updateMailingAddressButton);

    userEvent.click(screen.getByText('Select state...'));
    userEvent.keyboard('[Enter]');

    const addressParts: InputElementChangeSpec[] = [
      {
        domElementText: 'Mailing Street Number',
        newValue: '100 1/2',
      },
      {
        domElementText: 'Mailing Street Name',
        newValue: 'Street Street',
      },
      {
        domElementText: 'Mailing Apartment or Unit Number',
        newValue: '#1',
      },
      {
        domElementText: 'Mailing Address Line 2',
        newValue: 'LINE 2',
      },
      {
        domElementText: 'Mailing City',
        newValue: 'Somewhere',
      },
      {
        domElementText: 'Mailing Zip Code',
        newValue: '12345-6789',
      },
    ];

    const updateButton = screen.getButton('Confirm Mailing Address Update');
    for (const part of addressParts) {
      const partInput = await screen.findByRole('textbox', {
        name: part.domElementText,
      });

      // should be disabled until all required fields are filled
      expect(updateButton).toBeDisabled();

      userEvent.type(partInput, part.newValue);
    }

    const mailingData: VoterMailingAddressChangeRequest = {
      mailingStreetNumber: '100',
      mailingStreetName: 'STREET STREET',
      mailingApartmentUnitNumber: '#1',
      mailingAddressLine2: 'LINE 2',
      mailingAddressLine3: '',
      mailingCityTown: 'SOMEWHERE',
      mailingZip5: '12345',
      mailingZip4: '6789',
      mailingSuffix: '',
      mailingHouseFractionNumber: '1/2',
      mailingState: 'AL',
    };
    const expectation = {
      voterId: mockVoterId,
      mailingAddressChangeData: mailingData,
      voterToUpdate: voter,
    } as const;
    apiMock.expectChangeVoterMailingAddress(expectation);
    const updatedVoter: Voter = {
      ...voter,
      mailingAddressChange: {
        ...mailingData,
        timestamp: new Date().toISOString(),
      },
    };
    expect(updateButton).not.toBeDisabled();
    userEvent.click(updateButton);

    apiMock.expectGetVoter(updatedVoter);
    await screen.findByText('Voter Mailing Address Updated');
    userEvent.click(await screen.findButton('Return to Voter Details'));

    await waitFor(() => {
      expect(screen.queryByText('Update Voter Mailing Address')).toBeNull();
    });

    await screen.findByText('Updated Mailing Address');
    await screen.findByText('100 1/2 STREET STREET #1');
    await screen.findByText('SOMEWHERE, AL 12345-6789');
  });

  test('update mailing address - has previous mailing address', async () => {
    apiMock.expectGetDeviceStatuses();
    apiMock.setPrinterStatus(true);
    const voterWithMailingAddress: Voter = {
      ...voter,
      mailingStreetNumber: '123',
      mailingStreetName: 'UNICORN ST',
      mailingApartmentUnitNumber: 'Apt 4',
      mailingAddressLine2: '',
      mailingCityTown: 'FAIRYLAND',
      mailingState: 'CA',
      mailingZip5: '12345',
      mailingZip4: '',
      mailingSuffix: 'B',
    };
    apiMock.expectGetVoter(voterWithMailingAddress);
    await renderComponent();

    await screen.findByText('Mailing Address');
    await screen.findByText(/123B UNICORN ST Apt 4/);
    await screen.findByText('FAIRYLAND, CA 12345');

    // Also, the "Update Mailing Address" button should still be present and enabled/disabled appropriately
    const updateMailingAddressButtons = screen.getAllByRole('button', {
      name: 'Update Mailing Address',
    });
    // Find the first button (should be from main screen, not modal)
    const updateMailingAddressButton = updateMailingAddressButtons[0];
    // Should be enabled if precinct is configured and matches voter
    expect(updateMailingAddressButton).not.toBeDisabled();
    userEvent.click(updateMailingAddressButton);

    userEvent.click(screen.getByText('Select state...'));
    userEvent.keyboard('[Enter]');

    const addressParts: InputElementChangeSpec[] = [
      {
        domElementText: 'Mailing Street Number',
        newValue: '100 1/2A',
      },
      {
        domElementText: 'Mailing Street Name',
        newValue: 'Street Street',
      },
      {
        domElementText: 'Mailing Apartment or Unit Number',
        newValue: '#1',
      },
      {
        domElementText: 'Mailing Address Line 2',
        newValue: 'LINE 2',
      },
      {
        domElementText: 'Mailing City',
        newValue: 'Somewhere',
      },
      {
        domElementText: 'Mailing Zip Code',
        newValue: '12345-6789',
      },
    ];
    for (const part of addressParts) {
      const partInput = await screen.findByRole('textbox', {
        name: part.domElementText,
      });
      userEvent.type(partInput, part.newValue);
    }

    const mailingData: VoterMailingAddressChangeRequest = {
      mailingStreetNumber: '100',
      mailingStreetName: 'STREET STREET',
      mailingApartmentUnitNumber: '#1',
      mailingAddressLine2: 'LINE 2',
      mailingAddressLine3: '',
      mailingCityTown: 'SOMEWHERE',
      mailingZip5: '12345',
      mailingZip4: '6789',
      mailingSuffix: 'A',
      mailingHouseFractionNumber: '1/2',
      mailingState: 'AL',
    };
    const expectation = {
      voterId: mockVoterId,
      mailingAddressChangeData: mailingData,
      voterToUpdate: voterWithMailingAddress,
    } as const;
    apiMock.expectChangeVoterMailingAddress(expectation);
    const updatedVoter: Voter = {
      ...voterWithMailingAddress,
      mailingAddressChange: {
        ...mailingData,
        timestamp: new Date().toISOString(),
      },
    };
    const updateButton = screen.getButton('Confirm Mailing Address Update');
    userEvent.click(updateButton);

    apiMock.expectGetVoter(updatedVoter);
    await screen.findByText('Voter Mailing Address Updated');
    userEvent.click(await screen.findButton('Return to Voter Details'));

    await waitFor(() => {
      expect(screen.queryByText('Update Voter Mailing Address')).toBeNull();
    });

    const oldAddress = await screen.findByText('123B UNICORN ST Apt 4');
    expect(oldAddress.parentElement?.style?.textDecoration).toEqual(
      'line-through'
    );

    await screen.findByText('Updated Mailing Address');
    await screen.findByText('100 1/2A STREET STREET #1');
    await screen.findByText('SOMEWHERE, AL 12345-6789');
  });

  test('absentee check-in shows "Absentee Checked In"', async () => {
    const checkedInAbsenteeVoter: Voter = {
      ...voter,
      checkIn: {
        identificationMethod: { type: 'default' },
        timestamp: new Date().toISOString(),
        isAbsentee: true,
        receiptNumber: 0,
        machineId: 'test-machine-01',
        ballotParty: 'DEM',
      },
    };

    apiMock.expectGetVoter(checkedInAbsenteeVoter);
    apiMock.expectGetDeviceStatuses();
    apiMock.setPrinterStatus(true);

    await renderComponent();

    // Verify that "Absentee" value appears
    screen.getByRole('heading', { name: 'Absentee Checked In' });
  });

  test('displays label for newly registered voters', async () => {
    const addedVoter = createMockVoter(
      mockVoterId,
      'ABIGAIL',
      'ADAMS',
      precinct1.id,
      undefined,
      { includeRegistrationEvent: true }
    );
    apiMock.expectGetVoter(addedVoter);
    apiMock.expectGetDeviceStatuses();

    await renderComponent();

    screen.getByText('New Registration');
    screen.getByText('ABIGAIL ADAMS');
  });
});

describe('primary election functionality', () => {
  const electionPrimary =
    electionMultiPartyPrimaryFixtures.readElectionDefinition();
  const precinct1 = electionPrimary.election.precincts[0];

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock = createApiMock();
    apiMock.setElection(electionPrimary, precinct1.id);
  });

  afterEach(() => {
    apiMock.mockApiClient.assertComplete();
    unmount();
  });

  const parties: Array<{ party: CheckInBallotParty; expectedText: string }> = [
    { party: 'DEM', expectedText: 'Democratic' },
    { party: 'REP', expectedText: 'Republican' },
  ];
  test.each(parties)(
    'check-in for party: $party',
    async ({ party, expectedText }) => {
      voter = {
        ...createMockVoter(mockVoterId, 'ABIGAIL', 'ADAMS', precinct1.id),
        checkIn: {
          identificationMethod: { type: 'default' },
          timestamp: new Date().toISOString(),
          isAbsentee: false,
          receiptNumber: 0,
          machineId: 'test-machine-01',
          ballotParty: party,
        },
      };

      apiMock.expectGetVoter(voter);
      apiMock.setPrinterStatus(true);
      apiMock.expectGetDeviceStatuses();

      await renderComponent();

      expect(screen.getByText('Ballot Party')).toBeDefined();
      expect(screen.getByText(expectedText)).toBeDefined();
    }
  );
});
