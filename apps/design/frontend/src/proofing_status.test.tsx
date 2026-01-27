import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import type { BackgroundTask } from '@votingworks/design-backend';
import { format } from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { sleep } from '@votingworks/basics';

import {
  provideApi,
  createMockApiClient,
  MockApiClient,
} from '../test/api_helpers';
import { render, screen } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { ProofingStatus } from './proofing_status';

const electionId = 'election-1';
const finalizedAt = new Date('1/21/2026, 2:00 PM');
const mainExportsDoneAt = new Date('1/21/2026, 2:05 PM');
const testDecksDoneAt = new Date('1/21/2026, 2:10 PM');
const approvedAt = new Date('1/21/2026, 4:30 PM');

test('ballots not finalized', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, null);
  mockApprovedAt(api, null);
  mockMainExports(api, undefined);
  mockTestDecks(api, undefined);

  const { container } = renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  const expectedContent = [
    'Proofing Status',
    'Ballots not finalized',
    'Ballots not approved',
  ];
  expect(container).toHaveTextContent(expectedContent.join(''));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('finalized, main export in progress, no test decks', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockTestDecks(api, undefined);

  const mainProgressLabel = 'Rendering PDFs';
  mockMainExports(api, {
    progress: { label: mainProgressLabel, progress: 5, total: 10 },
  });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  expectDoneStatus(finalizedAt, 'Ballots finalized');
  screen.getByText('Ballots not approved');
  expect(screen.getButton(/unfinalize/i)).toBeEnabled();
  expect(screen.getButton(/approve/i)).toBeDisabled();

  screen.getByText(/exporting election package & ballots/i);
  screen.getByText(mainProgressLabel);
  screen.getByRole('progressbar');

  expect(screen.queryByText(/ballots exported/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/test decks exported/i)).not.toBeInTheDocument();
});

test('main exports done, not approved', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { completedAt: mainExportsDoneAt });
  mockTestDecks(api, undefined);

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  expectDoneStatus(finalizedAt, 'Ballots finalized');
  expectDoneStatus(mainExportsDoneAt, 'Election Package & Ballots exported');

  screen.getByText('Ballots not approved');
  expect(screen.getButton(/unfinalize/i)).toBeEnabled();
  expect(screen.getButton(/approve/i)).toBeEnabled();

  expect(screen.queryByText(/test decks exported/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

test('main export done, test decks in progress', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { completedAt: mainExportsDoneAt });

  const testDecksProgressLabel = 'Marking ballots';
  mockTestDecks(api, {
    progress: { label: testDecksProgressLabel, progress: 5, total: 10 },
  });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  expectDoneStatus(finalizedAt, 'Ballots finalized');
  expectDoneStatus(mainExportsDoneAt, 'Election Package & Ballots exported');

  screen.getByText('Ballots not approved');
  expect(screen.getButton(/unfinalize/i)).toBeEnabled();
  expect(screen.getButton(/approve/i)).toBeDisabled();

  screen.getByText(/exporting test decks/i);
  screen.getByText(testDecksProgressLabel);
  screen.getByRole('progressbar');

  expect(screen.queryByText(/test decks exported/i)).not.toBeInTheDocument();
});

test('finalized, main exports and test decks done, not approved', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { completedAt: mainExportsDoneAt });
  mockTestDecks(api, { completedAt: testDecksDoneAt });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  expectDoneStatus(finalizedAt, 'Ballots finalized');
  expectDoneStatus(mainExportsDoneAt, 'Election Package & Ballots exported');
  expectDoneStatus(testDecksDoneAt, 'Test Decks exported');

  screen.getByText('Ballots not approved');
  expect(screen.getButton(/unfinalize/i)).toBeEnabled();
  expect(screen.getButton(/approve/i)).toBeEnabled();

  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

test('export errors are displayed', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { error: 'Contest too tall' });
  mockTestDecks(api, { error: 'Something went wrong' });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  screen.getByText(/election package & ballots.+export error/i);
  screen.getByText('Contest too tall');

  screen.getByText(/test decks.+export error/i);
  screen.getByText('Something went wrong');

  expect(screen.getButton(/unfinalize/i)).toBeEnabled();
  expect(screen.getButton(/approve/i)).toBeDisabled();

  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByText(/ballots exported/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/test decks exported/i)).not.toBeInTheDocument();
});

test('finalized and approved', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, approvedAt);
  mockMainExports(api, { completedAt: mainExportsDoneAt });
  mockTestDecks(api, { completedAt: testDecksDoneAt });

  api.getBaseUrl.expectCallWith().resolves('https://foo.com');
  const downloadsPath = routes.election(electionId).downloads.path;
  const downloadsUrl = `https://foo.com${downloadsPath}`;

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  expectDoneStatus(finalizedAt, 'Ballots finalized');
  expectDoneStatus(mainExportsDoneAt, 'Election Package & Ballots exported');
  expectDoneStatus(testDecksDoneAt, 'Test Decks exported');
  expectDoneStatus(approvedAt, 'Ballots approved');
  screen.getByText(/downloads url/i);
  screen.getByText(downloadsUrl);
  screen.getButton(/unfinalize/i);

  expect(screen.queryButton(/approve/i)).not.toBeInTheDocument();

  const mockClipboardCopy = vi.fn();
  mockClipboard(mockClipboardCopy);

  userEvent.click(screen.getButton(/copy url/i));

  expect(mockClipboardCopy).toHaveBeenCalledWith(downloadsUrl);
});

test('approve button action', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { completedAt: mainExportsDoneAt });
  mockTestDecks(api, { completedAt: testDecksDoneAt });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  api.approveBallots.expectCallWith({ electionId }).resolves();
  mockApprovedAt(api, approvedAt);
  api.getBaseUrl.expectCallWith().resolves('https://foo.com');

  userEvent.click(screen.getButton(/approve/i));

  await screen.findByText(/foo.com/);
  api.assertComplete();
});

test('unfinalize button action', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { completedAt: mainExportsDoneAt });
  mockTestDecks(api, { completedAt: testDecksDoneAt });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  api.unfinalizeBallots.expectCallWith({ electionId }).resolves();
  mockFinalizedAt(api, null);
  mockApprovedAt(api, null);

  userEvent.click(screen.getButton(/unfinalize/i));

  await sleep(0); // Give cascading queries a chance to settle.
  api.assertComplete();
});

function expectDoneStatus(date: Date, text: string) {
  const dateString = format.localeShortDateAndTime(date);
  screen.getByText(hasTextAcrossElements(`${dateString}:${text}`));
}

function mockApprovedAt(api: MockApiClient, date: Date | null) {
  api.getBallotsApprovedAt.expectCallWith({ electionId }).resolves(date);
}

function mockFinalizedAt(api: MockApiClient, date: Date | null) {
  api.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(date);
}

const realWindowNavigator = window.navigator;

function mockClipboard(writeText: (text: string) => Promise<void>) {
  const clipboard: Partial<Clipboard> = { writeText };
  window.navigator = {
    ...realWindowNavigator,
    // `navigator.clipboard` not implemented by `jsdom`:
    clipboard: clipboard as Clipboard,
  };
}

function mockMainExports(api: MockApiClient, task?: Partial<BackgroundTask>) {
  api.getElectionPackage.expectCallWith({ electionId }).resolves({
    task: task && {
      createdAt: new Date(),
      id: 'foo',
      payload: '',
      taskName: 'generate_election_package',
      ...task,
    },
  });
}

function mockTestDecks(api: MockApiClient, task?: Partial<BackgroundTask>) {
  api.getTestDecks.expectCallWith({ electionId }).resolves({
    task: task && {
      createdAt: new Date(),
      id: 'foo',
      payload: '',
      taskName: 'generate_test_decks',
      ...task,
    },
  });
}

function renderUi(api: MockApiClient) {
  return render(
    provideApi(
      api,
      withRoute(<ProofingStatus />, {
        paramPath: routes.election(':electionId').export.path,
        path: routes.election(electionId).export.path,
      })
    )
  );
}
