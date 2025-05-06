import { describe, test, beforeEach, afterEach, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { screen } from '../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  createMockVoter,
} from '../test/mock_api_client';
import { renderInAppContext } from '../test/render_in_app_context';
import { ElectionManagerScreen } from './election_manager_screen';

let apiMock: ApiMock;
const electionFamousNames = electionFamousNames2021Fixtures.readElection();

let unmount: () => void;

beforeEach(() => {
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.setIsAbsenteeMode(false);
  apiMock.setElection(electionFamousNames);
  apiMock.expectGetMachineConfig();
  apiMock.expectGetDeviceStatuses();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  unmount();
});

describe('Voters tab', () => {
  test('view voter details from voter search', async () => {
    const renderResult = renderInAppContext(<ElectionManagerScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;

    apiMock.expectSearchVotersNull({});
    userEvent.click(await screen.findButton('Voters'));

    await screen.findByRole('heading', { name: 'Voters' });

    const voter = createMockVoter('123', 'Abigail', 'Adams');
    apiMock.expectSearchVotersWithResults(
      { firstName: 'ABI', lastName: 'AD' },
      [voter]
    );

    const lastNameInput = screen.getByLabelText('Last Name');
    userEvent.clear(lastNameInput);
    userEvent.type(lastNameInput, 'AD');
    const firstNameInput = screen.getByLabelText('First Name');
    userEvent.type(firstNameInput, 'ABI');

    await screen.findByText(/Adams, Abigail/i);

    apiMock.expectGetVoter(voter);
    userEvent.click(screen.getButton('View Details'));

    await screen.findByRole('heading', { name: 'Voter Details' });
  });
});
