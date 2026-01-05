import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { ElectionId } from '@votingworks/types';
import { sleep } from '@votingworks/basics';
import {
  createMockApiClient,
  MockApiClient,
  multiJurisdictionUser,
  jurisdiction,
  user,
  provideApi,
  jurisdiction2,
  organizationUser,
} from '../test/api_helpers';
import {
  blankElectionRecord,
  electionListing,
  generalElectionRecord,
} from '../test/fixtures';
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

test('clones immediately when user has exactly one jurisdiction', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const { history } = renderButton(
    <CloneElectionButton election={electionListing(electionRecord)} />
  );

  const newElectionId = 'new-election' as ElectionId;
  mockGenerateId.mockReturnValue(newElectionId);
  apiMock.cloneElection
    .expectCallWith({
      electionId: election.id,
      destElectionId: newElectionId,
      destJurisdictionId: jurisdiction.id,
    })
    .resolves(newElectionId);

  userEvent.click(await screen.findButton(`Make a copy of ${election.title}`));
  await sleep(0); // Allow redirect to resolve
  expect(history.location.pathname).toEqual(`/elections/${newElectionId}`);
});

test('shows jurisdiction picker when user has more than one jurisdiction', async () => {
  apiMock.getUser.expectCallWith().resolves(multiJurisdictionUser);
  apiMock.listJurisdictions
    .expectCallWith()
    .resolves(multiJurisdictionUser.jurisdictions);
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const { history } = renderButton(
    <CloneElectionButton election={electionListing(electionRecord)} />
  );

  userEvent.click(await screen.findButton(`Make a copy of ${election.title}`));
  const modal = await screen.findByRole('alertdialog');

  userEvent.click(within(modal).getByRole('combobox'));
  userEvent.click(screen.getByText(jurisdiction2.name));

  const newElectionId = 'new-election' as ElectionId;
  mockGenerateId.mockReturnValue(newElectionId);
  apiMock.cloneElection
    .expectCallWith({
      electionId: election.id,
      destElectionId: newElectionId,
      destJurisdictionId: jurisdiction2.id,
    })
    .resolves(newElectionId);

  userEvent.click(screen.getButton('Confirm'));
  await sleep(0); // Allow redirect to resolve
  expect(history.location.pathname).toEqual(`/elections/${newElectionId}`);
});

test('shows jurisdiction picker for organization users', async () => {
  apiMock.getUser.expectCallWith().resolves(organizationUser);
  apiMock.listJurisdictions
    .expectCallWith()
    .resolves([jurisdiction, jurisdiction2]);
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  renderButton(
    <CloneElectionButton election={electionListing(electionRecord)} />
  );
  userEvent.click(await screen.findButton(`Make a copy of ${election.title}`));
  await screen.findByRole('alertdialog');
});

test('label says Untitled Election for elections without a title', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  const electionRecord = blankElectionRecord(jurisdiction);
  renderButton(
    <CloneElectionButton election={electionListing(electionRecord)} />
  );
  await screen.findButton('Make a copy of Untitled Election');
});

test('disables button for elections with external source', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  const electionRecord = generalElectionRecord(jurisdiction.id);
  renderButton(
    <CloneElectionButton
      election={{
        ...electionListing(electionRecord),
        externalSource: 'ms-sems',
      }}
    />
  );
  const button = await screen.findButton(
    'Cannot copy election loaded from an external source'
  );
  expect(button).toBeDisabled();
});
