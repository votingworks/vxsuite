import { afterEach, beforeEach, describe, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  mockSystemAdministratorUser,
  mockSessionExpiresAt,
  mockElectionManagerUser,
} from '@votingworks/test-utils';
import { constructElectionKey, DippedSmartCardAuth } from '@votingworks/types';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../test/render_in_app_context';
import { screen } from '../../test/react_testing_library';
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
