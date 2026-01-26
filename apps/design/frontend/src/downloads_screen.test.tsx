import { beforeEach, expect, test, vi } from 'vitest';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { DownloadsScreen } from './downloads_screen';
import { routes } from './routes';
import { withRoute } from '../test/routing_helpers';
import {
  createMockApiClient,
  jurisdiction,
  MockApiClient,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers';
import { render, screen } from '../test/react_testing_library';
import { BallotsStatus } from './ballots_status';
import { Downloads } from './downloads';
import {
  blankElectionRecord,
  electionInfoFromElection,
} from '../test/fixtures';

vi.mock('./ballots_status');
const MockBallotsStatus = vi.mocked(BallotsStatus);
const MOCK_BALLOTS_STATUS_ID = 'MockBallotsStatus';

vi.mock('./downloads');
const MockDownloads = vi.mocked(Downloads);
const MOCK_DOWNLOADS_ID = 'MockDownloads';

const electionId = 'election-1';

beforeEach(() => {
  MockBallotsStatus.mockReturnValue(
    <div data-testid={MOCK_BALLOTS_STATUS_ID} />
  );

  MockDownloads.mockReturnValue(<div data-testid={MOCK_DOWNLOADS_ID} />);
});

test('shows downloads when approved', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api);
  api.getBallotsApprovedAt.expectCallWith({ electionId }).resolves(new Date());

  renderUi(api);

  await screen.findByRole('heading', { name: 'Downloads' });
  screen.getByTestId(MOCK_DOWNLOADS_ID);
  expect(screen.queryByTestId(MOCK_BALLOTS_STATUS_ID)).not.toBeInTheDocument();
});

test('shows ballots status callout when not approved', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api);
  api.getBallotsApprovedAt.expectCallWith({ electionId }).resolves(null);

  renderUi(api);

  await screen.findByRole('heading', { name: 'Downloads' });
  screen.getByTestId(MOCK_BALLOTS_STATUS_ID);
  expect(screen.queryByTestId(MOCK_DOWNLOADS_ID)).not.toBeInTheDocument();
});

function mockNavScreenDependencies(api: MockApiClient) {
  api.getUser.expectCallWith().resolves(user);
  mockUserFeatures(api);

  api.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);

  const electionRecord = blankElectionRecord(jurisdiction);
  api.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromElection(electionRecord.election));
}

function renderUi(api: MockApiClient) {
  const paramPath = routes.election(':electionId').downloads.path;
  const { path } = routes.election(electionId).downloads;

  return render(
    provideApi(api, withRoute(<DownloadsScreen />, { paramPath, path }))
  );
}
