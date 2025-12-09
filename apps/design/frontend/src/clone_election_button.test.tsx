import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { ElectionId } from '@votingworks/types';
import { sleep } from '@votingworks/basics';
import type { User } from '@votingworks/design-backend';
import {
  createMockApiClient,
  MockApiClient,
  mockUserFeatures,
  multiOrgUser,
  org,
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

// eslint-disable-next-line @typescript-eslint/no-shadow
function renderButton(element: React.ReactElement, user: User) {
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
  mockUserFeatures(apiMock, { ACCESS_ALL_ORGS: false });
  const electionRecord = generalElectionRecord(org.id);
  const { election } = electionRecord;
  const { history } = renderButton(
    <CloneElectionButton election={electionListing(electionRecord)} />,
    user
  );

  const newElectionId = 'new-election' as ElectionId;
  mockGenerateId.mockReturnValue(newElectionId);
  apiMock.cloneElection
    .expectCallWith({
      electionId: election.id,
      destElectionId: newElectionId,
      destJurisdictionId: org.id,
    })
    .resolves(newElectionId);

  userEvent.click(await screen.findButton(`Make a copy of ${election.title}`));
  await sleep(0); // Allow redirect to resolve
  expect(history.location.pathname).toEqual(`/elections/${newElectionId}`);
});

const VX_ORG = {
  id: 'votingworks-org',
  name: 'VotingWorks',
} as const;

const NON_VX_ORG = {
  id: 'not-votingworks-org',
  name: 'Not VotingWorks',
} as const;

test('shows org picker when ACCESS_ALL_ORGS feature enabled', async () => {
  mockUserFeatures(apiMock, { ACCESS_ALL_ORGS: true });
  const electionRecord = generalElectionRecord(org.id);
  const { election } = electionRecord;
  const { history, queryClient } = renderButton(
    <CloneElectionButton election={electionListing(electionRecord)} />,
    user
  );

  queryClient.setQueryData(api.listOrganizations.queryKey(), [
    VX_ORG,
    NON_VX_ORG,
  ]);

  userEvent.click(await screen.findButton(`Make a copy of ${election.title}`));
  const modal = screen.getByRole('alertdialog');

  userEvent.click(within(modal).getByRole('combobox'));
  userEvent.click(screen.getByText(NON_VX_ORG.name));

  const newElectionId = 'new-election' as ElectionId;
  mockGenerateId.mockReturnValue(newElectionId);
  apiMock.cloneElection
    .expectCallWith({
      electionId: election.id,
      destElectionId: newElectionId,
      destJurisdictionId: NON_VX_ORG.id,
    })
    .resolves(newElectionId);

  userEvent.click(screen.getButton('Confirm'));
  await sleep(0); // Allow redirect to resolve
  expect(history.location.pathname).toEqual(`/elections/${newElectionId}`);
});

test('shows org picker for multi-org user', async () => {
  mockUserFeatures(apiMock, { ACCESS_ALL_ORGS: false });
  const electionRecord = generalElectionRecord(org.id);
  const { election } = electionRecord;
  const { queryClient } = renderButton(
    <CloneElectionButton election={electionListing(electionRecord)} />,
    multiOrgUser
  );

  queryClient.setQueryData(api.listOrganizations.queryKey(), [
    VX_ORG,
    NON_VX_ORG,
  ]);

  userEvent.click(await screen.findButton(`Make a copy of ${election.title}`));
  const modal = screen.getByRole('alertdialog');
  within(modal).getByRole('combobox', { name: 'Organization' });
});
