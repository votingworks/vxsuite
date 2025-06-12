import { expect, test, beforeEach, afterEach, vi } from 'vitest';
import {
  ValidStreetInfo,
  Voter,
  VoterAddressChangeRequest,
  VoterNameChangeRequest,
} from '@votingworks/pollbook-backend';
import { Route, Switch } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { screen, waitFor } from '../test/react_testing_library';
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

beforeEach(() => {
  voter = createMockVoter(mockVoterId, 'ABIGAIL', 'ADAMS');
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.expectGetVoter(voter);
  apiMock.setElection(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    'precinct-1'
  );
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  unmount();
});

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

  await screen.findByRole('heading', { name: 'Voter Details' });
  await screen.findByRole('heading', { name: 'ABIGAIL ADAMS' });
}

test.each([['Update Name'], ['Update Address']])(
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
      postalCity: 'CONCORD',
      zip5: '03301',
      zip4: '1111',
      district: '',
    },
  ];
  apiMock.expectGetValidStreetInfo(validStreetInfo);

  await renderComponent();

  userEvent.click(screen.getButton('Update Address'));

  await screen.findByRole('heading', { name: 'Update Voter Address' });

  userEvent.click(screen.getByLabelText('Street Name'));
  userEvent.keyboard('[Enter]');

  const partInput = await screen.findByRole('textbox', {
    name: 'Street Number',
  });
  userEvent.type(partInput, '1000000');

  await screen.findByText(
    'Invalid address. Make sure the street number and name match a valid address for this jurisdiction.'
  );
});

test('valid address change', async () => {
  apiMock.setPrinterStatus(true);
  apiMock.expectGetDeviceStatuses();
  const validStreetInfo: ValidStreetInfo[] = [
    {
      streetName: 'MAIN ST',
      side: 'all',
      lowRange: 1,
      highRange: 100,
      postalCity: 'CONCORD',
      zip5: '03301',
      zip4: '1111',
      district: '',
    },
  ];
  apiMock.expectGetValidStreetInfo(validStreetInfo);

  await renderComponent();

  userEvent.click(screen.getButton('Update Address'));

  await screen.findByRole('heading', { name: 'Update Voter Address' });

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
  };
  const expectation = {
    voterId: mockVoterId,
    addressChangeData,
    voterToUpdate: voter,
  } as const;
  apiMock.expectChangeVoterAddress(expectation);
  const updatedVoter: Voter = {
    ...voter,
    addressChange: {
      ...addressChangeData,
      timestamp: new Date().toISOString(),
    },
  };
  const updateButton = screen.getButton('Confirm Address Update');
  userEvent.click(updateButton);

  apiMock.expectGetVoter(updatedVoter);
  userEvent.click(await screen.findButton('Return to Voter Details'));

  await waitFor(() => {
    expect(screen.queryByText('Update Voter Address')).toBeNull();
  });

  await screen.findByText('99 MAIN ST #789');
  const oldAddress = await screen.findByText(
    `${voter.streetNumber} ${voter.streetName}`
  );
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

  userEvent.click(screen.getButton('Undo Check-In'));

  await screen.findByText('Not checked in');
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
    },
  };
  apiMock.expectGetVoter(checkedInVoter);
  apiMock.expectGetDeviceStatuses();
  apiMock.setPrinterStatus(true);

  await renderComponent();

  // Check that we do not see the ability to Mark as Inactive
  expect(screen.queryByText('Mark Voter as Inactive')).toBeNull();

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

  const markInactiveButton = screen.getButton('Mark Voter as Inactive');
  userEvent.click(markInactiveButton);
  await screen.findByText(/After the voter is marked as inactive/);

  apiMock.expectMarkInactive(voter);
  apiMock.expectGetVoter({
    ...voter,
    isInactive: true,
  });

  const confirmButton = screen.getButton('Mark Inactive');
  userEvent.click(confirmButton);
});

test('mark inactive - error path', async () => {
  apiMock.expectGetVoter(voter);
  apiMock.expectGetDeviceStatuses();

  await renderComponent();

  const markInactiveButton = screen.getButton('Mark Voter as Inactive');
  userEvent.click(markInactiveButton);
  await screen.findByText(/After the voter is marked as inactive/);

  apiMock.expectMarkInactiveError(voter);
  apiMock.expectGetVoter(voter);
  const confirmButton = screen.getButton('Mark Inactive');
  userEvent.click(confirmButton);

  await screen.findByText('Error Marking Inactive');
});

test('actions are disabled when precinct not configured', async () => {
  apiMock.expectGetVoter(voter);
  apiMock.setElection(electionFamousNames2021Fixtures.readElectionDefinition());
  apiMock.expectGetDeviceStatuses();

  await renderComponent();

  const markInactiveButton = screen.getButton('Mark Voter as Inactive');
  expect(markInactiveButton).toBeDisabled();

  const updateNameButton = screen.getButton('Update Name');
  expect(updateNameButton).toBeDisabled();

  const updateAddressButton = screen.getButton('Update Address');
  expect(updateAddressButton).toBeDisabled();
});
