import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { User } from '@votingworks/design-backend';
import userEvent from '@testing-library/user-event';
import { ElectionId } from '@votingworks/types';
import { sleep } from '@votingworks/basics';
import {
  createMockApiClient,
  MockApiClient,
  nonVxUser,
  provideApi,
  vxUser,
} from '../test/api_helpers';
import { generalElectionRecord } from '../test/fixtures';
import { render, screen, within } from '../test/react_testing_library';
import { CloneElectionButton } from './clone_election_button';
import { userFeatureConfigs, useUserFeatures } from './features_context';
import { generateId } from './utils';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import * as api from './api';

vi.mock(import('./features_context.js'), async (importActual) => ({
  ...(await importActual()),
  useUserFeatures: vi.fn(),
}));
const mockUseUserFeatures = vi.mocked(useUserFeatures);

vi.mock(import('./utils.js'), async (importActual) => ({
  ...(await importActual()),
  generateId: vi.fn(),
}));
const mockGenerateId = vi.mocked(generateId);

let apiMock: MockApiClient;

function renderButton(user: User, element: React.ReactElement) {
  const history = createMemoryHistory();

  const ui = withRoute(element, {
    paramPath: routes.root.path,
    path: routes.root.path,
    history,
  });

  const queryClient = api.createQueryClient();
  queryClient.setQueryData(api.getUser.queryKey(), user);

  return {
    ...render(provideApi(apiMock, ui, undefined, queryClient)),
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

test('clones immediately for non-Vx users', async () => {
  mockUseUserFeatures.mockReturnValue(userFeatureConfigs.nh);

  const { election } = generalElectionRecord(nonVxUser.orgId);
  const { history } = renderButton(
    nonVxUser,
    <CloneElectionButton election={election} />
  );

  const newElectionId = 'new-election' as ElectionId;
  mockGenerateId.mockReturnValue(newElectionId);
  apiMock.cloneElection
    .expectCallWith({
      destId: newElectionId,
      destOrgId: nonVxUser.orgId,
      srcId: election.id,
      user: nonVxUser,
    })
    .resolves(newElectionId);

  userEvent.click(screen.getButton(`Make a copy of ${election.title}`));
  await sleep(0); // Allow redirect to resolve
  expect(history.location.pathname).toEqual(`/elections/${newElectionId}`);
});

const VX_ORG = {
  id: vxUser.orgId,
  name: 'votingworks',
  displayName: 'VotingWorks',
} as const;

const NON_VX_ORG = {
  id: nonVxUser.orgId,
  name: 'not-voting-works',
  displayName: 'Not VotingWorks',
} as const;

test('shows org picker for Vx users', async () => {
  mockUseUserFeatures.mockReturnValue(userFeatureConfigs.vx);

  const { election } = generalElectionRecord(vxUser.orgId);
  const { history, queryClient } = renderButton(
    vxUser,
    <CloneElectionButton election={election} />
  );

  queryClient.setQueryData(api.getAllOrgs.queryKey(), [VX_ORG, NON_VX_ORG]);

  userEvent.click(screen.getButton(`Make a copy of ${election.title}`));
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
      user: vxUser,
    })
    .resolves(newElectionId);

  userEvent.click(screen.getButton('Confirm'));
  await sleep(0); // Allow redirect to resolve
  expect(history.location.pathname).toEqual(`/elections/${newElectionId}`);
});
