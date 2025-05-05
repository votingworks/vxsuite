import { expect, test, beforeEach, afterEach, vi } from 'vitest';
import {
  ValidStreetInfo,
  Voter,
  VoterAddressChangeRequest,
  VoterNameChangeRequest,
} from '@votingworks/pollbook-backend';
import { Route, Switch } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
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
  voter = createMockVoter(mockVoterId, 'Abigail', 'Adams');
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.expectGetVoter(voter);
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

  await screen.findByRole('heading', { name: 'Voter details' });
  await screen.findByRole('heading', { name: 'Abigail Adams' });
}

test('flows that require printer render a warning when no printer is connected', async () => {
  apiMock.setPrinterStatus(false);
  apiMock.expectGetDeviceStatuses();

  await renderComponent();

  userEvent.click(screen.getButton('Update Name'));

  await screen.findByRole('heading', { name: 'No Printer Detected' });
});

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
      newValue: 'Nabby',
    },
    {
      domElementText: 'Middle Name',
      newValue: 'Abigail',
    },
    {
      domElementText: 'Last Name',
      newValue: 'Addams',
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
  const updatedVoter: Voter = { ...voter, ...nameChangeData };
  const updateButton = screen.getButton('Confirm Name Update');
  userEvent.click(updateButton);

  apiMock.expectGetVoter(updatedVoter);
  userEvent.click(await screen.findButton('Return to Voter Details'));

  await waitFor(() => {
    expect(screen.queryByText('Update Voter Name')).toBeNull();
  });

  await screen.findByText('NABBY ABIGAIL ADDAMS JR');
});

test('address change', async () => {
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

  const nameParts: InputElementChangeSpec[] = [
    {
      domElementText: 'Street Number',
      newValue: '99',
    },
    // {
    //   domElementText: 'Street Name',
    //   domElementRole: 'combobox',
    //   newValue: 'Main St',
    // },
    {
      domElementText: 'Apartment or Unit Number',
      newValue: '#789',
    },
    {
      domElementText: 'Address Line 2',
      newValue: 'LINE 2',
    },
  ];
  for (const part of nameParts) {
    const partInput = await screen.findByRole(
      part.domElementRole ?? 'textbox',
      {
        name: part.domElementText,
      }
    );
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
  const updatedVoter: Voter = { ...voter, ...addressChangeData };
  const updateButton = screen.getButton('Confirm Address Update');
  userEvent.click(updateButton);

  apiMock.expectGetVoter(updatedVoter);
  userEvent.click(await screen.findButton('Return to Voter Details'));

  await waitFor(() => {
    expect(screen.queryByText('Update Voter Address')).toBeNull();
  });

  await screen.findByText('99 MAIN ST #789');
});
