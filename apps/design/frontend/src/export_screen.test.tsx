import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ElectionSerializationFormat } from '@votingworks/types';
import {
  provideApi,
  createMockApiClient,
  MockApiClient,
  mockUserFeatures,
  user,
} from '../test/api_helpers';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { ExportScreen } from './export_screen';
import { routes } from './routes';
import { downloadFile } from './utils';
import { generalElectionRecord } from '../test/fixtures';

const electionRecord = generalElectionRecord(user.orgId);
const electionId = electionRecord.election.id;

vi.mock('js-file-download');

vi.mock(import('./utils'), async (importActual) => ({
  ...(await importActual()),
  downloadFile: vi.fn(),
}));

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  apiMock.getElectionPackage.expectCallWith({ electionId }).resolves({});
  apiMock.getTestDecks.expectCallWith({ electionId }).resolves({});
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getBallotOrderInfo.expectCallWith({ electionId }).resolves({});
  apiMock.getBallotTemplate
    .expectCallWith({ electionId })
    .resolves('VxDefaultBallot');
  mockUserFeatures(apiMock, user);
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen() {
  render(
    provideApi(
      apiMock,
      withRoute(<ExportScreen />, {
        paramPath: routes.election(':electionId').export.path,
        path: routes.election(electionId).export.path,
      })
    )
  );
}

async function exportTestDecksAndExpectDownload(
  electionSerializationFormat: ElectionSerializationFormat
) {
  const taskCreatedAt = new Date();
  apiMock.exportTestDecks
    .expectCallWith({ electionId, electionSerializationFormat })
    .resolves();

  userEvent.click(screen.getButton('Export Test Decks'));

  apiMock.getTestDecks.expectRepeatedCallsWith({ electionId }).resolves({
    task: {
      createdAt: taskCreatedAt,
      id: '1',
      payload: JSON.stringify({ electionId }),
      taskName: 'generate_election_package',
    },
  });

  await screen.findByText('Exporting Test Decks...');
  expect(screen.queryByText('Export Test Decks')).not.toBeInTheDocument();

  const fileUrl = `https://mock-file-storage/${electionRecord.orgId}/test-decks-1234567890.zip`;
  apiMock.getTestDecks.expectCallWith({ electionId }).resolves({
    task: {
      completedAt: new Date(taskCreatedAt.getTime() + 2000),
      createdAt: taskCreatedAt,
      id: '1',
      payload: JSON.stringify({ electionId }),
      startedAt: new Date(taskCreatedAt.getTime() + 1000),
      taskName: 'generate_test_decks',
    },
    url: fileUrl,
  });

  await screen.findByText('Export Test Decks', undefined, {
    timeout: 2000,
  });
  expect(screen.queryByText('Exporting Test Decks...')).not.toBeInTheDocument();

  await waitFor(() => {
    expect(vi.mocked(downloadFile)).toHaveBeenCalledWith(fileUrl);
  });
}

test('export test decks', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });
  await exportTestDecksAndExpectDownload('vxf');
});

test('feature flag to hide export test decks', async () => {
  mockUserFeatures(apiMock, user, { EXPORT_TEST_DECKS: false });
  apiMock.getUser.expectCallWith().resolves(user);
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  expect(screen.queryByText('Export Test Decks')).not.toBeInTheDocument();
});

test('export election package and ballots', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  const taskCreatedAt = new Date();
  apiMock.exportElectionPackage
    .expectCallWith({
      electionId,
      electionSerializationFormat: 'vxf',
      shouldExportAudio: false,
    })
    .resolves();
  apiMock.getElectionPackage.expectRepeatedCallsWith({ electionId }).resolves({
    task: {
      createdAt: taskCreatedAt,
      id: '1',
      payload: JSON.stringify({ electionId }),
      taskName: 'generate_election_package',
    },
  });
  userEvent.click(screen.getButton('Export Election Package and Ballots'));

  await screen.findByText('Exporting Election Package and Ballots...');
  expect(
    screen.queryByText('Export Election Package and Ballots')
  ).not.toBeInTheDocument();

  const fileUrl = `https://mock-file-storage/${electionRecord.orgId}/election-package-1234567890.zip`;
  apiMock.getElectionPackage.expectCallWith({ electionId }).resolves({
    task: {
      completedAt: new Date(taskCreatedAt.getTime() + 2000),
      createdAt: taskCreatedAt,
      id: '1',
      payload: JSON.stringify({ electionId }),
      startedAt: new Date(taskCreatedAt.getTime() + 1000),
      taskName: 'generate_election_package',
    },
    url: fileUrl,
  });

  await screen.findByText('Export Election Package and Ballots', undefined, {
    timeout: 2000,
  });
  expect(
    screen.queryByText('Exporting Election Package and Ballots...')
  ).not.toBeInTheDocument();

  await waitFor(() => {
    expect(vi.mocked(downloadFile)).toHaveBeenCalledWith(fileUrl);
  });
});

test.each([
  { shouldExportAudio: true, buttonText: 'On' },
  { shouldExportAudio: false, buttonText: 'Off' },
])(
  'when export audio toggle is $shouldExportAudio',
  async ({ shouldExportAudio, buttonText }) => {
    apiMock.getUser.expectCallWith().resolves(user);
    renderScreen();
    await screen.findAllByRole('heading', { name: 'Export' });

    const toggleParent = screen.getByRole('listbox', { name: 'Export Audio' });
    expect(toggleParent).toBeDefined();
    const button = within(toggleParent).getByRole('option', {
      name: buttonText,
    });
    userEvent.click(button);

    const taskCreatedAt = new Date();
    apiMock.exportElectionPackage
      .expectCallWith({
        electionId,
        electionSerializationFormat: 'vxf',
        shouldExportAudio,
      })
      .resolves();
    apiMock.getElectionPackage
      .expectRepeatedCallsWith({ electionId })
      .resolves({
        task: {
          createdAt: taskCreatedAt,
          id: '1',
          payload: JSON.stringify({ electionId, shouldExportAudio }),
          taskName: 'generate_election_package',
        },
      });
    userEvent.click(screen.getButton('Export Election Package and Ballots'));

    await screen.findByText('Exporting Election Package and Ballots...');
    // 'export election package and ballots' fully covers export flow
  }
);

test('export election package error handling', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  const taskCreatedAt = new Date();
  apiMock.exportElectionPackage
    .expectCallWith({
      electionId,
      electionSerializationFormat: 'vxf',
      shouldExportAudio: false,
    })
    .resolves();
  apiMock.getElectionPackage.expectRepeatedCallsWith({ electionId }).resolves({
    task: {
      createdAt: taskCreatedAt,
      id: '1',
      payload: JSON.stringify({ electionId }),
      taskName: 'generate_election_package',
    },
  });
  userEvent.click(screen.getButton('Export Election Package and Ballots'));

  await screen.findByText('Exporting Election Package and Ballots...');
  expect(
    screen.queryByText('Export Election Package and Ballots')
  ).not.toBeInTheDocument();

  apiMock.getElectionPackage.expectCallWith({ electionId }).resolves({
    task: {
      completedAt: new Date(taskCreatedAt.getTime() + 2000),
      createdAt: taskCreatedAt,
      error: 'Whoa!',
      id: '1',
      payload: JSON.stringify({ electionId }),
      startedAt: new Date(taskCreatedAt.getTime() + 1000),
      taskName: 'generate_election_package',
    },
  });

  await screen.findByText('Export Election Package and Ballots', undefined, {
    timeout: 2000,
  });
  expect(
    screen.queryByText('Exporting Election Package and Ballots...')
  ).not.toBeInTheDocument();

  await screen.findByText('An unexpected error occurred. Please try again.');
  expect(vi.mocked(downloadFile)).not.toHaveBeenCalled();
});

test('using CDF', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Format election using CDF',
      checked: false,
    })
  );
  screen.getByRole('checkbox', {
    name: 'Format election using CDF',
    checked: true,
  });

  await exportTestDecksAndExpectDownload('cdf');

  // Export election package
  apiMock.exportElectionPackage
    .expectCallWith({
      electionId,
      electionSerializationFormat: 'cdf',
      shouldExportAudio: false,
    })
    .resolves();
  apiMock.getElectionPackage.expectRepeatedCallsWith({ electionId }).resolves({
    task: {
      createdAt: new Date(),
      id: '1',
      payload: JSON.stringify({
        electionId,
        electionSerializationFormat: 'cdf',
      }),
      taskName: 'generate_election_package',
    },
  });
  userEvent.click(screen.getButton('Export Election Package and Ballots'));

  userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Format election using CDF',
      checked: true,
    })
  );
  screen.getByRole('checkbox', {
    name: 'Format election using CDF',
    checked: false,
  });
});

test('feature flag to hide ballot template selector', async () => {
  mockUserFeatures(apiMock, user, { CHOOSE_BALLOT_TEMPLATE: false });
  apiMock.getUser.expectCallWith().resolves(user);
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  expect(screen.queryByLabelText('Ballot Template')).not.toBeInTheDocument();
});

test('set ballot template', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  const select = screen.getByLabelText('Ballot Template');
  screen.getByText('VotingWorks Default Ballot');

  apiMock.setBallotTemplate
    .expectCallWith({
      electionId,
      ballotTemplateId: 'NhBallot',
    })
    .resolves();
  apiMock.getBallotTemplate.expectCallWith({ electionId }).resolves('NhBallot');
  userEvent.click(select);
  userEvent.click(screen.getByText('New Hampshire Ballot - V4'));

  await waitFor(() => {
    apiMock.assertComplete();
  });
  screen.getByText('New Hampshire Ballot - V4');
});

test('view ballot proofing status and unfinalize ballots', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getBallotsFinalizedAt.reset();
  const finalizedAt = '1/30/2025, 12:00 PM';
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(new Date(finalizedAt));

  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  screen.getByText(`Ballots finalized at: ${finalizedAt}`);

  const select = screen.getByLabelText('Ballot Template');
  expect(select).toBeDisabled();

  apiMock.unfinalizeBallots.expectCallWith({ electionId }).resolves();
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  userEvent.click(screen.getButton('Unfinalize Ballots'));
  await screen.findByText('Ballots not finalized');

  expect(select).not.toBeDisabled();
});

test('view ballot order status and unsubmit order', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  const submittedAt = '1/30/2025, 12:00 PM';
  apiMock.getBallotOrderInfo.reset();
  apiMock.getBallotOrderInfo.expectCallWith({ electionId }).resolves({
    absenteeBallotCount: '100',
    orderSubmittedAt: new Date(submittedAt).toISOString(),
  });

  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  await screen.findByText(`Order submitted at: ${submittedAt}`);

  apiMock.updateBallotOrderInfo
    .expectCallWith({
      electionId,
      ballotOrderInfo: {
        absenteeBallotCount: '100',
        orderSubmittedAt: undefined,
      },
    })
    .resolves();
  apiMock.getBallotOrderInfo.expectCallWith({ electionId }).resolves({
    absenteeBallotCount: '100',
  });
  userEvent.click(screen.getButton('Unsubmit Order'));
  await screen.findByText('Order not submitted');
});
