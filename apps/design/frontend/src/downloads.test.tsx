import { expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import {
  BackgroundTask,
  MainExportTaskMetadata,
  TestDecksTaskMetadata,
} from '@votingworks/design-backend';
import { assert, sleep } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { downloadFile } from './utils';
import {
  createMockApiClient,
  MockApiClient,
  provideApi,
} from '../test/api_helpers';
import { routes } from './routes';
import { Downloads } from './downloads';
import { render, screen, within } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';

vi.mock('./utils');
const mockDownloadFile = vi.mocked(downloadFile);

const electionId = 'election-1';

test('no downloads available', async () => {
  const mockApi = createMockApiClient();
  mockApi.getElectionPackage.expectCallWith({ electionId }).resolves({});
  mockApi.getTestDecks.expectCallWith({ electionId }).resolves({});

  renderDownloads(mockApi);
  mockApi.assertComplete();
  await sleep(0); // Make sure data queries have a chance to settle.

  expect(screen.queryButton('Download')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
});

test('all downloads available', async () => {
  const mainTask: MainExportTaskMetadata = {
    task: mockCompletedTask('id-1', 'generate_election_package'),
    electionPackageUrl: '/election-package.zip',
    officialBallotsUrl: '/official-ballots.zip',
    sampleBallotsUrl: '/sample-ballots.zip',
    testBallotsUrl: '/test-ballots.zip',
  };

  const testDecksTask: TestDecksTaskMetadata = {
    task: mockCompletedTask('id-2', 'generate_test_decks'),
    url: '/test-decks.zip',
  };

  const mockApi = createMockApiClient();
  mockApi.getElectionPackage.expectCallWith({ electionId }).resolves(mainTask);
  mockApi.getTestDecks.expectCallWith({ electionId }).resolves(testDecksTask);

  const { container } = renderDownloads(mockApi);
  mockApi.assertComplete();

  await screen.findByText('Election Package');

  const specs = [
    { title: 'Election Package', url: mainTask.electionPackageUrl },
    { title: 'Official Ballots', url: mainTask.officialBallotsUrl },
    { title: 'Sample Ballots', url: mainTask.sampleBallotsUrl },
    { title: 'Test Ballots', url: mainTask.testBallotsUrl },
    { title: 'L&A Test Decks', url: testDecksTask.url },
  ] as const;

  const cards = container.firstElementChild!.children;
  expect(cards).toHaveLength(specs.length);

  let cardIndex = 0;
  for (const spec of specs) {
    const card = cards.item(cardIndex);
    assert(card instanceof HTMLElement);
    cardIndex += 1;

    within(card).getByRole('heading', { name: spec.title });
    userEvent.click(within(card).getButton('Download'));
    expect(mockDownloadFile).toHaveBeenLastCalledWith(spec.url);
  }
});

test('only test decks available', async () => {
  const testDecksTask: TestDecksTaskMetadata = {
    task: mockCompletedTask('id-2', 'generate_test_decks'),
    url: '/test-decks.zip',
  };

  const mockApi = createMockApiClient();
  mockApi.getTestDecks.expectCallWith({ electionId }).resolves(testDecksTask);
  mockApi.getElectionPackage.expectCallWith({ electionId }).resolves({
    task: mockPendingTask('id-1', 'generate_election_package'),
  });

  renderDownloads(mockApi);
  mockApi.assertComplete();

  const cardTitle = await screen.findByRole('heading');
  expect(cardTitle).toHaveTextContent('L&A Test Decks');

  userEvent.click(screen.getButton('Download'));
  expect(mockDownloadFile).toHaveBeenLastCalledWith(testDecksTask.url);
});

test('only subset of main downloads available', async () => {
  const mainTask: MainExportTaskMetadata = {
    task: mockCompletedTask('id-1', 'generate_election_package'),
    electionPackageUrl: '/election-package.zip',
    officialBallotsUrl: '/official-ballots.zip',
  };

  const mockApi = createMockApiClient();
  mockApi.getElectionPackage.expectCallWith({ electionId }).resolves(mainTask);
  mockApi.getTestDecks.expectCallWith({ electionId }).resolves({
    task: mockPendingTask('id-2', 'generate_test_decks'),
  });

  renderDownloads(mockApi);
  mockApi.assertComplete();

  await screen.findByText('Election Package');
  expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual([
    'Election Package',
    'Official Ballots',
  ]);

  for (const btn of screen.getAllButtons('Download')) userEvent.click(btn);
  expect(mockDownloadFile.mock.calls).toEqual([
    [mainTask.electionPackageUrl],
    [mainTask.officialBallotsUrl],
  ]);
});

function mockCompletedTask(
  id: string,
  taskName: BackgroundTask['taskName']
): BackgroundTask {
  return {
    completedAt: new Date(),
    createdAt: new Date(),
    id,
    payload: '',
    taskName,
  };
}

function mockPendingTask(
  id: string,
  taskName: BackgroundTask['taskName']
): BackgroundTask {
  return {
    createdAt: new Date(),
    id,
    payload: '',
    taskName,
  };
}

function renderDownloads(api: MockApiClient) {
  const { path } = routes.election(electionId).root;

  return render(
    provideApi(
      api,
      withRoute(<Downloads />, {
        paramPath: routes.election(':electionId').root.path,
        path,
        history: createMemoryHistory({ initialEntries: [path] }),
      })
    )
  );
}
