import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  mockSystemAdministratorUser,
  mockSessionExpiresAt,
  mockElectionManagerUser,
} from '@votingworks/test-utils';
import { constructElectionKey, DippedSmartCardAuth } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../test/render_in_app_context';
import { screen, waitFor, within } from '../../test/react_testing_library';
import { ElectionScreen } from './election_screen';

const electionDefinition = readElectionGeneralDefinition();
const { election } = electionDefinition;

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2022-06-22T00:00:00'),
  });
  apiMock = createApiMock();
});

afterEach(() => {
  vi.useRealTimers();
  apiMock.assertComplete();
});

describe('as System Admin', () => {
  const auth: DippedSmartCardAuth.SystemAdministratorLoggedIn = {
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  };

  test('renders election details', () => {
    renderInAppContext(<ElectionScreen />, {
      apiMock,
      auth,
      electionDefinition,
    });

    screen.getByText(
      'Configured with the current election at Wednesday, June 22, 2022 at 12:00:00 AM AKDT.'
    );
    screen.getByRole('heading', { name: election.title });
    screen.getByText(new RegExp(`${election.county.name}, ${election.state}`));
    screen.getByText('November 3, 2020');

    screen.getButton('Save Election Package');
    screen.getButton('Unconfigure Machine');
    expect(
      screen.queryByText('Revert Results to Unofficial')
    ).not.toBeInTheDocument();
  });

  test('has button to revert results to unofficial', async () => {
    renderInAppContext(<ElectionScreen />, {
      apiMock,
      auth,
      electionDefinition,
      isOfficialResults: true,
    });

    userEvent.click(screen.getButton('Revert Election Results to Unofficial'));
    let confirmModal = await screen.findByRole('alertdialog');
    within(confirmModal).getByRole('heading', {
      name: 'Revert Election Results to Unofficial',
    });

    userEvent.click(within(confirmModal).getButton('Cancel'));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    apiMock.apiClient.revertResultsToUnofficial.expectCallWith().resolves();
    userEvent.click(screen.getButton('Revert Election Results to Unofficial'));
    confirmModal = await screen.findByRole('alertdialog');
    userEvent.click(
      within(confirmModal).getButton('Revert Election Results to Unofficial')
    );
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });
});

describe('as election manager', () => {
  const auth: DippedSmartCardAuth.ElectionManagerLoggedIn = {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  test('renders election details', () => {
    renderInAppContext(<ElectionScreen />, {
      apiMock,
      auth,
      electionDefinition,
    });

    screen.getByText(
      'Configured with the current election at Wednesday, June 22, 2022 at 12:00:00 AM AKDT.'
    );
    screen.getByRole('heading', { name: election.title });
    screen.getByText(new RegExp(`${election.county.name}, ${election.state}`));
    screen.getByText('November 3, 2020');

    screen.getButton('Save Election Package');
  });
});
