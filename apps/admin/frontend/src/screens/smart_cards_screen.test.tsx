import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { constructElectionKey, DippedSmartCardAuth } from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { deferred, ok } from '@votingworks/basics';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { screen } from '../../test/react_testing_library';
import {
  renderInAppContext,
  RenderInAppContextParams,
} from '../../test/render_in_app_context';
import { SmartCardsScreen } from './smart_cards_screen';

const electionDefinition = readElectionGeneralDefinition();
const { election } = electionDefinition;
const prettyElectionDate = /Tuesday, November 3, 2020/;
const electionKey = constructElectionKey(election);

let apiMock: ApiMock;

function renderScreen(params: RenderInAppContextParams = {}) {
  return renderInAppContext(<SmartCardsScreen />, {
    electionDefinition,
    ...params,
  });
}

const baseAuth = {
  status: 'logged_in',
  user: mockSystemAdministratorUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
} as const;

const auth = {
  noCard: {
    ...baseAuth,
    programmableCard: { status: 'no_card' },
  },
  blankCard: {
    ...baseAuth,
    programmableCard: { status: 'ready' },
  },
  electionManagerCard: {
    ...baseAuth,
    programmableCard: {
      status: 'ready',
      programmedUser: mockElectionManagerUser({ electionKey }),
    },
  },
} satisfies Record<string, DippedSmartCardAuth.SystemAdministratorLoggedIn>;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('Insert card prompt', async () => {
  apiMock.setAuthStatus(auth.noCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });
  screen.getByText('Insert a smart card');

  expect(screen.getButton('Program Election Manager Card')).toBeDisabled();
  expect(screen.getButton('Program Poll Worker Card')).toBeDisabled();
  expect(screen.getButton('Program System Administrator Card')).toBeDisabled();
});

type ProgramResult = Awaited<ReturnType<ApiMock['apiClient']['programCard']>>;

// Component is fully tested in libs/ui/src/smart_cards_screen
test('Insert blank card, program election manager card', async () => {
  apiMock.setAuthStatus(auth.blankCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Blank Card');

  const deferredProgram = deferred<ProgramResult>();
  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'election_manager' })
    .returns(deferredProgram.promise);
  userEvent.click(screen.getButton('Program Election Manager Card'));
  await vi.waitFor(() => {
    expect(screen.getButton('Program Election Manager Card')).toBeDisabled();
  });
  expect(screen.getButton('Program Poll Worker Card')).toBeDisabled();
  expect(screen.getButton('Program System Administrator Card')).toBeDisabled();

  deferredProgram.resolve(ok({ pin: '123456' }));
  apiMock.setAuthStatus(auth.electionManagerCard);
  await screen.findByText('Election Manager Card');
  screen.getByText(election.title);
  screen.getByText(prettyElectionDate);
  screen.getByText('123-456');
  screen.getByText(/Election manager card programmed/);
  expect(screen.queryButton('Unprogram Card')).not.toBeInTheDocument();
});
