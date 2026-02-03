import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import type { BackgroundTask, ExportQaRun } from '@votingworks/design-backend';
import { format } from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { sleep } from '@votingworks/basics';

import {
  provideApi,
  createMockApiClient,
  MockApiClient,
} from '../test/api_helpers';
import { render, screen, within } from '../test/react_testing_library';
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
  mockLatestQaRun(api, undefined);

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
  mockLatestQaRun(api, undefined);

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
  mockLatestQaRun(api, undefined);

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
  mockLatestQaRun(api, undefined);

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
  mockLatestQaRun(api, undefined);

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
  mockLatestQaRun(api, undefined);

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
  mockLatestQaRun(api, undefined);

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
  mockLatestQaRun(api, undefined);

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
  mockLatestQaRun(api, undefined);

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

test('QA run pending status is displayed', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { completedAt: mainExportsDoneAt });
  mockTestDecks(api, { completedAt: testDecksDoneAt });
  mockLatestQaRun(api, { status: 'pending' });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  screen.getByText('QA check pending…');
});

test('QA run in progress status is displayed', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { completedAt: mainExportsDoneAt });
  mockTestDecks(api, { completedAt: testDecksDoneAt });
  mockLatestQaRun(api, {
    status: 'in_progress',
    statusMessage: 'Scanning ballots with VxScan',
    jobUrl: 'https://circleci.com/job/123',
  });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  screen.getByText('QA Check Running');
  screen.getByText('Scanning ballots with VxScan');
  expect(screen.getByText('(View CI Job)')).toHaveAttribute(
    'href',
    'https://circleci.com/job/123'
  );
});

test('QA run failure status is displayed', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { completedAt: mainExportsDoneAt });
  mockTestDecks(api, { completedAt: testDecksDoneAt });
  mockLatestQaRun(api, {
    status: 'failure',
    statusMessage: 'QA tests failed: 3 ballot validation errors found',
    resultsUrl: 'https://example.com/results/failure.html',
    jobUrl: 'https://circleci.com/job/456',
  });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  screen.getByText('QA Check Failed');
  screen.getByText('QA tests failed: 3 ballot validation errors found');
  expect(screen.getByText('(📑 Results)')).toHaveAttribute(
    'href',
    'https://example.com/results/failure.html'
  );
  expect(screen.getByText('(View CI Job)')).toHaveAttribute(
    'href',
    'https://circleci.com/job/456'
  );
});

test('QA run success status is displayed', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { completedAt: mainExportsDoneAt });
  mockTestDecks(api, { completedAt: testDecksDoneAt });
  const qaCompletedAt = new Date('1/21/2026, 2:15 PM');
  mockLatestQaRun(api, {
    status: 'success',
    resultsUrl: 'https://example.com/results/success.html',
    jobUrl: 'https://circleci.com/job/789',
    createdAt: qaCompletedAt,
    updatedAt: qaCompletedAt,
  });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  // Check QA status is displayed with correct info
  screen.getByText('QA check passed');
  expect(screen.getByText(/1\/21\/2026.*2:15.*PM/)).toBeInTheDocument();
  expect(screen.getByText('(📑 Results)')).toHaveAttribute(
    'href',
    'https://example.com/results/success.html'
  );
  expect(screen.getByText('(View CI Job)')).toHaveAttribute(
    'href',
    'https://circleci.com/job/789'
  );
});

test('approve button shows warning when QA is in progress', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { completedAt: mainExportsDoneAt });
  mockTestDecks(api, { completedAt: testDecksDoneAt });
  mockLatestQaRun(api, {
    status: 'in_progress',
    statusMessage: 'Running tests',
  });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  userEvent.click(screen.getButton(/approve/i));

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('QA Check Incomplete');
  within(modal).getByText(
    /automated QA check is still running.*approve these ballots before QA is complete/i
  );

  // Can cancel
  userEvent.click(within(modal).getButton('Cancel'));
  await sleep(0);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  // Or approve anyway - click again to reopen modal
  userEvent.click(screen.getButton(/approve/i));
  const modalAgain = await screen.findByRole('alertdialog');

  api.approveBallots.expectCallWith({ electionId }).resolves();
  mockApprovedAt(api, approvedAt);
  api.getBaseUrl.expectCallWith().resolves('https://foo.com');

  userEvent.click(within(modalAgain).getButton('Approve Anyway'));

  await screen.findByText(/foo.com/);
  api.assertComplete();
});

test('approve button shows warning when QA failed', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { completedAt: mainExportsDoneAt });
  mockTestDecks(api, { completedAt: testDecksDoneAt });
  mockLatestQaRun(api, {
    status: 'failure',
    statusMessage: 'QA tests failed',
    resultsUrl: 'https://example.com/results.html',
  });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  userEvent.click(screen.getButton(/approve/i));

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('QA Check Incomplete');
  within(modal).getByText(
    /automated QA check has failed: QA tests failed.*approve these ballots/i
  );
  expect(within(modal).getByText('(📑 Results)')).toHaveAttribute(
    'href',
    'https://example.com/results.html'
  );

  // Can approve anyway
  api.approveBallots.expectCallWith({ electionId }).resolves();
  mockApprovedAt(api, approvedAt);
  api.getBaseUrl.expectCallWith().resolves('https://foo.com');

  userEvent.click(within(modal).getButton('Approve Anyway'));

  await screen.findByText(/foo.com/);
  api.assertComplete();
});

test('approve button works normally when QA succeeded', async () => {
  const api = createMockApiClient();
  mockFinalizedAt(api, finalizedAt);
  mockApprovedAt(api, null);
  mockMainExports(api, { completedAt: mainExportsDoneAt });
  mockTestDecks(api, { completedAt: testDecksDoneAt });
  mockLatestQaRun(api, {
    status: 'success',
  });

  renderUi(api);

  await screen.findByText('Proofing Status');
  api.assertComplete();

  // Should approve directly without showing warning modal
  api.approveBallots.expectCallWith({ electionId }).resolves();
  mockApprovedAt(api, approvedAt);
  api.getBaseUrl.expectCallWith().resolves('https://foo.com');

  userEvent.click(screen.getButton(/approve/i));

  await screen.findByText(/foo.com/);
  api.assertComplete();

  // Modal should not have been shown
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
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

function mockLatestQaRun(api: MockApiClient, qaRun?: Partial<ExportQaRun>) {
  api.getLatestExportQaRun.expectCallWith({ electionId }).resolves(
    qaRun
      && {
          id: 'qa-run-1',
          electionId,
          exportPackageUrl: 'https://example.com/package.zip',
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...qaRun,
        }
  );
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
