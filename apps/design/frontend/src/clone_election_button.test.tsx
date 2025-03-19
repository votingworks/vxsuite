import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { ElectionId } from '@votingworks/types';
import { sleep } from '@votingworks/basics';
import {
  createMockApiClient,
  MockApiClient,
  mockUserFeatures,
  user,
  provideApi,
} from '../test/api_helpers';
import { electionListing, generalElectionRecord } from '../test/fixtures';
import { render, screen, within } from '../test/react_testing_library';
import { CloneElectionButton } from './clone_election_button';
import { generateId } from './utils';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import * as api from './api';

vi.mock(import('./utils.js'), async (importActual) => ({
  ...(await importActual()),
  generateId: vi.fn(),
}));
const mockGenerateId = vi.mocked(generateId);

let apiMock: MockApiClient;

function renderButton(element: React.ReactElement) {
  const history = createMemoryHistory();

  const ui = withRoute(element, {
    paramPath: routes.root.path,
    path: routes.root.path,
    history,
  });

  const queryClient = api.createQueryClient();
  queryClient.setQueryData(api.getUser.queryKey(), user);

  return {
    ...render(provideApi(apiMock, ui, queryClient)),
    history,
    queryClient,
  };
}

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('clones immediately when ACCESS_ALL_ORGS feature disabled', async () => {
  mockUserFeatures(apiMock, user, { ACCESS_ALL_ORGS: false });
  const electionRecord = generalElectionRecord(user.orgId);
  const { election } = electionRecord;
  const { history } = renderButton(
    <CloneElectionButton election={electionListing(electionRecord)} />
  );

  const newElectionId = 'new-election' as ElectionId;
  mockGenerateId.mockReturnValue(newElectionId);
  apiMock.cloneElection
    .expectCallWith({
      destId: newElectionId,
      destOrgId: user.orgId,
      srcId: election.id,
      user,
    })
    .resolves(newElectionId);

  userEvent.click(await screen.findButton(`Make a copy of ${election.title}`));
  await sleep(0); // Allow redirect to resolve
  expect(history.location.pathname).toEqual(`/elections/${newElectionId}`);
});

const VX_ORG = {
  id: 'votingworks-org',
  name: 'votingworks',
  displayName: 'VotingWorks',
} as const;

const NON_VX_ORG = {
  id: 'not-votingworks-org',
  name: 'not-voting-works',
  displayName: 'Not VotingWorks',
} as const;

test('shows org picker when ACCESS_ALL_ORGS feature enabled', async () => {
  mockUserFeatures(apiMock, user, { ACCESS_ALL_ORGS: true });
  const electionRecord = generalElectionRecord(user.orgId);
  const { election } = electionRecord;
  const { history, queryClient } = renderButton(
    <CloneElectionButton election={electionListing(electionRecord)} />
  );

  queryClient.setQueryData(api.getAllOrgs.queryKey(), [VX_ORG, NON_VX_ORG]);

  userEvent.click(await screen.findButton(`Make a copy of ${election.title}`));
  const modal = screen.getByRole('alertdialog');

  userEvent.click(within(modal).getByRole('combobox'));
  userEvent.click(within(modal).getByText(NON_VX_ORG.displayName));

  const newElectionId = 'new-election' as ElectionId;
  mockGenerateId.mockReturnValue(newElectionId);
  apiMock.cloneElection
    .expectCallWith({
      destId: newElectionId,
      destOrgId: NON_VX_ORG.id,
      srcId: election.id,
      user,
    })
    .resolves(newElectionId);

  userEvent.click(screen.getButton('Confirm'));
  await sleep(0); // Allow redirect to resolve
  expect(history.location.pathname).toEqual(`/elections/${newElectionId}`);
});
