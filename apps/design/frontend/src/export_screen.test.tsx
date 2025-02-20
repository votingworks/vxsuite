import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import fileDownload from 'js-file-download';
import userEvent from '@testing-library/user-event';
import {
  provideApi,
  createMockApiClient,
  MockApiClient,
  nonVxUser,
} from '../test/api_helpers';
import { render, screen, waitFor } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { ExportScreen } from './export_screen';
import { routes } from './routes';
import { downloadFile } from './utils';
import { generalElectionRecord } from '../test/fixtures';

const electionRecord = generalElectionRecord(nonVxUser.orgId);
const electionId = electionRecord.election.id;

vi.mock('js-file-download');
const fileDownloadMock = vi.mocked(fileDownload);

vi.mock(import('./utils'), async (importActual) => ({
  ...(await importActual()),
  downloadFile: vi.fn(),
}));

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  apiMock.getUser.expectCallWith().resolves(nonVxUser);
  apiMock.getElection
    .expectCallWith({ user: nonVxUser, electionId })
    .resolves(electionRecord);
  apiMock.getElectionPackage.expectCallWith({ electionId }).resolves({});
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
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
      }),
      electionId
    )
  );
}

test.skip('export all ballots', async () => {
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  // @ts-expect-error - exportAllBallots was removed
  apiMock.exportAllBallots
    .expectCallWith({ electionId, electionSerializationFormat: 'vxf' })
    .resolves({
      zipContents: Buffer.from('mock-zip-contents'),
      ballotHash: '1234567890abcdef',
    });

  userEvent.click(screen.getButton('Export All Ballots'));

  await waitFor(() => {
    expect(fileDownloadMock).toHaveBeenCalledWith(
      Buffer.from('mock-zip-contents'),
      'ballots-1234567.zip'
    );
  });
});

test('export test decks', async () => {
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  apiMock.exportTestDecks
    .expectCallWith({ electionId, electionSerializationFormat: 'vxf' })
    .resolves({
      zipContents: Buffer.from('mock-zip-contents'),
      ballotHash: '1234567890abcdef',
    });

  userEvent.click(screen.getButton('Export Test Decks'));

  await waitFor(() => {
    expect(fileDownloadMock).toHaveBeenCalledWith(
      Buffer.from('mock-zip-contents'),
      'test-decks-1234567.zip'
    );
  });
});

test('export election package and ballots', async () => {
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  const taskCreatedAt = new Date();
  apiMock.exportElectionPackage
    .expectCallWith({
      user: nonVxUser,
      electionId,
      electionSerializationFormat: 'vxf',
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
      id: '1',
      payload: JSON.stringify({ electionId }),
      startedAt: new Date(taskCreatedAt.getTime() + 1000),
      taskName: 'generate_election_package',
    },
    // TODO update filename expectation
    url: 'http://localhost:1234/election-package-1234567890.zip',
  });

  await screen.findByText('Export Election Package and Ballots', undefined, {
    timeout: 2000,
  });
  expect(
    screen.queryByText('Exporting Election Package and Ballots...')
  ).not.toBeInTheDocument();

  await waitFor(() => {
    expect(vi.mocked(downloadFile)).toHaveBeenCalledWith(
      // TODO update filename expectation
      'http://localhost:1234/election-package-1234567890.zip'
    );
  });
});

test('export election package error handling', async () => {
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  const taskCreatedAt = new Date();
  apiMock.exportElectionPackage
    .expectCallWith({
      user: nonVxUser,
      electionId,
      electionSerializationFormat: 'vxf',
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

test.skip('using CDF', async () => {
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

  // @ts-expect-error - exportAllBallots was removed
  apiMock.exportAllBallots
    .expectCallWith({ electionId, electionSerializationFormat: 'cdf' })
    .resolves({
      zipContents: Buffer.from('mock-zip-contents'),
      ballotHash: '1234567890abcdef',
    });
  userEvent.click(screen.getButton('Export All Ballots'));
  await waitFor(() => {
    expect(fileDownloadMock).toHaveBeenCalledWith(
      Buffer.from('mock-zip-contents'),
      'ballots-1234567.zip'
    );
  });

  apiMock.exportTestDecks
    .expectCallWith({ electionId, electionSerializationFormat: 'cdf' })
    .resolves({
      zipContents: Buffer.from('mock-zip-contents'),
      ballotHash: '1234567890abcdef',
    });
  userEvent.click(screen.getButton('Export Test Decks'));
  await waitFor(() => {
    expect(fileDownloadMock).toHaveBeenCalledWith(
      Buffer.from('mock-zip-contents'),
      'test-decks-1234567.zip'
    );
  });

  apiMock.exportElectionPackage
    .expectCallWith({
      user: nonVxUser,
      electionId,
      electionSerializationFormat: 'cdf',
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

test('set ballot template', async () => {
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
  apiMock.getElection.expectCallWith({ user: nonVxUser, electionId }).resolves({
    ...electionRecord,
    ballotTemplateId: 'NhBallot',
  });
  userEvent.click(select);
  userEvent.click(screen.getByText('New Hampshire Ballot - V4'));

  await waitFor(() => {
    apiMock.assertComplete();
  });
  screen.getByText('New Hampshire Ballot - V4');
});

test('view ballot proofing status and unfinalize ballots', async () => {
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
  const submittedAt = '1/30/2025, 12:00 PM';
  apiMock.getElection.reset();
  apiMock.getElection.expectCallWith({ user: nonVxUser, electionId }).resolves({
    ...electionRecord,
    ballotOrderInfo: {
      absenteeBallotCount: '100',
      orderSubmittedAt: new Date(submittedAt).toISOString(),
    },
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
  apiMock.getElection.expectCallWith({ user: nonVxUser, electionId }).resolves({
    ...electionRecord,
    ballotOrderInfo: {
      absenteeBallotCount: '100',
    },
  });
  userEvent.click(screen.getButton('Unsubmit Order'));
  await screen.findByText('Order not submitted');
});
