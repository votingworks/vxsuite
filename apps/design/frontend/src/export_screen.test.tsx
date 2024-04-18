import { Buffer } from 'buffer';
import fileDownload from 'js-file-download';
import userEvent from '@testing-library/user-event';
import { mockOf } from '@votingworks/test-utils';
import {
  provideApi,
  createMockApiClient,
  MockApiClient,
} from '../test/api_helpers';
import { electionId } from '../test/fixtures';
import { render, screen, waitFor } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { ExportScreen } from './export_screen';
import { routes } from './routes';
import { downloadFile } from './utils';

jest.mock('js-file-download');
const fileDownloadMock = jest.mocked(fileDownload);

jest.mock('./utils', (): typeof import('./utils') => ({
  ...jest.requireActual('./utils'),
  downloadFile: jest.fn(),
}));

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  apiMock.getElectionPackage.expectCallWith({ electionId }).resolves({});
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

test('export all ballots', async () => {
  renderScreen();
  await screen.findByRole('heading', { name: 'Export' });

  apiMock.exportAllBallots.expectCallWith({ electionId }).resolves({
    zipContents: Buffer.from('mock-zip-contents'),
    electionHash: '1234567890abcdef',
  });

  userEvent.click(screen.getButton('Export All Ballots'));

  await waitFor(() => {
    expect(fileDownloadMock).toHaveBeenCalledWith(
      Buffer.from('mock-zip-contents'),
      'ballots-1234567890.zip'
    );
  });
});

test('export test decks', async () => {
  renderScreen();
  await screen.findByRole('heading', { name: 'Export' });

  apiMock.exportTestDecks.expectCallWith({ electionId }).resolves({
    zipContents: Buffer.from('mock-zip-contents'),
    electionHash: '1234567890abcdef',
  });

  userEvent.click(screen.getButton('Export Test Decks'));

  await waitFor(() => {
    expect(fileDownloadMock).toHaveBeenCalledWith(
      Buffer.from('mock-zip-contents'),
      'test-decks-1234567890.zip'
    );
  });
});

test('export election package', async () => {
  renderScreen();
  await screen.findByRole('heading', { name: 'Export' });

  const taskCreatedAt = new Date();
  apiMock.exportElectionPackage.expectCallWith({ electionId }).resolves();
  apiMock.getElectionPackage.expectRepeatedCallsWith({ electionId }).resolves({
    task: {
      createdAt: taskCreatedAt,
      id: '1',
      payload: JSON.stringify({ electionId }),
      taskName: 'generate_election_package',
    },
  });
  userEvent.click(screen.getButton('Export Election Package'));

  await screen.findByText('Exporting Election Package...');
  expect(screen.queryByText('Export Election Package')).not.toBeInTheDocument();

  apiMock.getElectionPackage.expectCallWith({ electionId }).resolves({
    task: {
      completedAt: new Date(taskCreatedAt.getTime() + 2000),
      createdAt: taskCreatedAt,
      id: '1',
      payload: JSON.stringify({ electionId }),
      startedAt: new Date(taskCreatedAt.getTime() + 1000),
      taskName: 'generate_election_package',
    },
    url: 'http://localhost:1234/election-package-1234567890.zip',
  });

  await screen.findByText('Export Election Package', undefined, {
    timeout: 2000,
  });
  expect(
    screen.queryByText('Exporting Election Package...')
  ).not.toBeInTheDocument();

  await waitFor(() => {
    expect(mockOf(downloadFile)).toHaveBeenCalledWith(
      'http://localhost:1234/election-package-1234567890.zip'
    );
  });
});

test('export election package error handling', async () => {
  renderScreen();
  await screen.findByRole('heading', { name: 'Export' });

  const taskCreatedAt = new Date();
  apiMock.exportElectionPackage.expectCallWith({ electionId }).resolves();
  apiMock.getElectionPackage.expectRepeatedCallsWith({ electionId }).resolves({
    task: {
      createdAt: taskCreatedAt,
      id: '1',
      payload: JSON.stringify({ electionId }),
      taskName: 'generate_election_package',
    },
  });
  userEvent.click(screen.getButton('Export Election Package'));

  await screen.findByText('Exporting Election Package...');
  expect(screen.queryByText('Export Election Package')).not.toBeInTheDocument();

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

  await screen.findByText('Export Election Package', undefined, {
    timeout: 2000,
  });
  expect(
    screen.queryByText('Exporting Election Package...')
  ).not.toBeInTheDocument();

  await screen.findByText('An unexpected error occurred. Please try again.');
  expect(mockOf(downloadFile)).not.toHaveBeenCalled();
});
