import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionSerializationFormat,
} from '@votingworks/types';
import { Buffer, File as NodeFile } from 'node:buffer';
import type {
  BackgroundTask,
  StateFeaturesConfig,
} from '@votingworks/design-backend';
import {
  provideApi,
  createMockApiClient,
  MockApiClient,
  mockUserFeatures,
  jurisdiction,
  user,
  mockStateFeatures,
} from '../test/api_helpers';
import { render, screen, waitFor } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { ExportScreen } from './export_screen';
import { routes } from './routes';
import { downloadFile } from './utils';
import {
  electionInfoFromRecord,
  generalElectionRecord,
} from '../test/fixtures';
import { BACKGROUND_TASK_POLLING_INTERVAL_MS } from './api';

const electionRecord = generalElectionRecord(jurisdiction.id);
const electionId = electionRecord.election.id;

vi.mock(import('./utils'), async (importActual) => ({
  ...(await importActual()),
  downloadFile: vi.fn(),
}));

let apiMock: MockApiClient;

vi.useFakeTimers({ shouldAdvanceTime: true });

beforeEach(() => {
  apiMock = createMockApiClient();
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromRecord(electionRecord));
  apiMock.getElectionPackage.expectCallWith({ electionId }).resolves({});
  apiMock.getTestDecks.expectCallWith({ electionId }).resolves({});
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getBallotTemplate
    .expectCallWith({ electionId })
    .resolves('VxDefaultBallot');
  apiMock.getUser.expectCallWith().resolves(user);
  mockUserFeatures(apiMock);
  mockStateFeatures(apiMock, electionId);
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

  const testDecksTask: BackgroundTask = {
    createdAt: taskCreatedAt,
    id: '1',
    payload: JSON.stringify({ electionId }),
    taskName: 'generate_test_decks',
  };

  apiMock.getTestDecks.expectCallWith({ electionId }).resolves({
    task: testDecksTask,
  });

  userEvent.click(screen.getButton('Export Test Decks'));
  await screen.findByText('Exporting Test Decks');
  screen.getByText('Starting');
  expect(screen.getByRole('progressbar').firstChild).toHaveStyle({
    width: '0%',
  });
  expect(screen.queryButton('Export Test Decks')).not.toBeInTheDocument();

  apiMock.getTestDecks.expectCallWith({ electionId }).resolves({
    task: {
      ...testDecksTask,
      progress: { label: 'Rendering test decks', progress: 50, total: 100 },
    },
  });
  vi.advanceTimersByTime(BACKGROUND_TASK_POLLING_INTERVAL_MS);
  await screen.findByText('Rendering test decks');
  expect(screen.getByRole('progressbar').firstChild).toHaveStyle({
    width: '50%',
  });

  const fileUrl = `https://mock-file-storage/${electionRecord.jurisdictionId}/test-decks-1234567890.zip`;
  apiMock.getTestDecks.expectCallWith({ electionId }).resolves({
    task: {
      ...testDecksTask,
      completedAt: new Date(taskCreatedAt.getTime() + 2000),
      progress: { label: 'Rendering test decks', progress: 100, total: 100 },
    },
    url: fileUrl,
  });
  vi.advanceTimersByTime(BACKGROUND_TASK_POLLING_INTERVAL_MS);
  await screen.findByText('Export Test Decks');
  expect(screen.queryByText('Exporting Test Decks')).not.toBeInTheDocument();

  await waitFor(() => {
    expect(vi.mocked(downloadFile)).toHaveBeenCalledWith(fileUrl);
  });
}

test('export test decks', async () => {
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });
  await exportTestDecksAndExpectDownload('vxf');
});

test('feature flag to hide export test decks', async () => {
  mockUserFeatures(apiMock, { EXPORT_TEST_DECKS: false });
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  expect(screen.queryByText('Export Test Decks')).not.toBeInTheDocument();
});

test('export election package and ballots', async () => {
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  const taskCreatedAt = new Date();
  apiMock.exportElectionPackage
    .expectCallWith({
      electionId,
      electionSerializationFormat: 'vxf',
      shouldExportAudio: false,
      shouldExportSampleBallots: false,
      shouldExportTestBallots: false,
      numAuditIdBallots: undefined,
    })
    .resolves();
  const electionPackageTask: BackgroundTask = {
    createdAt: taskCreatedAt,
    id: '1',
    payload: JSON.stringify({ electionId }),
    taskName: 'generate_election_package',
  };
  apiMock.getElectionPackage.expectCallWith({ electionId }).resolves({
    task: electionPackageTask,
  });
  userEvent.click(screen.getButton('Export Election Package and Ballots'));

  await screen.findByText('Exporting Election Package and Ballots');
  expect(
    screen.queryButton('Export Election Package and Ballots')
  ).not.toBeInTheDocument();
  screen.getByText('Starting');
  expect(screen.getByRole('progressbar').firstChild).toHaveStyle({
    width: '0%',
  });

  apiMock.getElectionPackage.expectCallWith({ electionId }).resolves({
    task: {
      ...electionPackageTask,
      progress: { label: 'Rendering ballot PDFs', progress: 50, total: 100 },
    },
  });
  vi.advanceTimersByTime(BACKGROUND_TASK_POLLING_INTERVAL_MS);
  await screen.findByText('Rendering ballot PDFs');
  expect(screen.getByRole('progressbar').firstChild).toHaveStyle({
    width: '50%',
  });

  const fileUrl = `https://mock-file-storage/${electionRecord.jurisdictionId}/election-package-1234567890.zip`;
  apiMock.getElectionPackage.expectCallWith({ electionId }).resolves({
    task: {
      ...electionPackageTask,
      completedAt: new Date(taskCreatedAt.getTime() + 2000),
      progress: { label: 'Rendering ballot PDFs', progress: 100, total: 100 },
    },
    electionPackageUrl: fileUrl,
  });
  vi.advanceTimersByTime(BACKGROUND_TASK_POLLING_INTERVAL_MS);

  await screen.findButton('Export Election Package and Ballots');
  expect(
    screen.queryByText('Exporting Election Package and Ballots')
  ).not.toBeInTheDocument();

  await waitFor(() => {
    expect(vi.mocked(downloadFile)).toHaveBeenCalledWith(fileUrl);
  });
});

test('with audio export checked', async () => {
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Include audio',
      checked: false,
    })
  );
  screen.getByRole('checkbox', {
    name: 'Include audio',
    checked: true,
  });

  const taskCreatedAt = new Date();
  apiMock.exportElectionPackage
    .expectCallWith({
      electionId,
      electionSerializationFormat: 'vxf',
      shouldExportAudio: true,
      shouldExportSampleBallots: false,
      shouldExportTestBallots: false,
      numAuditIdBallots: undefined,
    })
    .resolves();
  apiMock.getElectionPackage.expectRepeatedCallsWith({ electionId }).resolves({
    task: {
      createdAt: taskCreatedAt,
      id: '1',
      payload: JSON.stringify({ electionId, shouldExportAudio: true }),
      taskName: 'generate_election_package',
    },
  });
  userEvent.click(screen.getButton('Export Election Package and Ballots'));

  await screen.findByText('Exporting Election Package and Ballots');
  // 'export election package and ballots' fully covers export flow
});

test('export election package error handling', async () => {
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  const taskCreatedAt = new Date();
  apiMock.exportElectionPackage
    .expectCallWith({
      electionId,
      electionSerializationFormat: 'vxf',
      shouldExportAudio: false,
      shouldExportSampleBallots: false,
      shouldExportTestBallots: false,
      numAuditIdBallots: undefined,
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

  await screen.findByText('Exporting Election Package and Ballots');
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
    screen.queryByText('Exporting Election Package and Ballots')
  ).not.toBeInTheDocument();

  await screen.findByText(
    'An unexpected error occurred while exporting. Please try again.'
  );
  expect(vi.mocked(downloadFile)).not.toHaveBeenCalled();
});

test('with sample ballots export checked', async () => {
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Include sample ballots',
      checked: false,
    })
  );
  screen.getByRole('checkbox', {
    name: 'Include sample ballots',
    checked: true,
  });

  const taskCreatedAt = new Date();
  apiMock.exportElectionPackage
    .expectCallWith({
      electionId,
      electionSerializationFormat: 'vxf',
      shouldExportAudio: false,
      shouldExportSampleBallots: true,
      shouldExportTestBallots: false,
      numAuditIdBallots: undefined,
    })
    .resolves();
  apiMock.getElectionPackage.expectRepeatedCallsWith({ electionId }).resolves({
    task: {
      createdAt: taskCreatedAt,
      id: '1',
      payload: JSON.stringify({ electionId, shouldExportSampleBallots: true }),
      taskName: 'generate_election_package',
    },
  });
  userEvent.click(screen.getButton('Export Election Package and Ballots'));

  await screen.findByText('Exporting Election Package and Ballots');
  // 'export election package and ballots' fully covers export flow
});

test('with test ballots export checked', async () => {
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Include test ballots',
      checked: false,
    })
  );
  screen.getByRole('checkbox', {
    name: 'Include test ballots',
    checked: true,
  });

  apiMock.exportElectionPackage
    .expectCallWith({
      electionId,
      electionSerializationFormat: 'vxf',
      shouldExportAudio: false,
      shouldExportSampleBallots: false,
      shouldExportTestBallots: true,
      numAuditIdBallots: undefined,
    })
    .resolves();
  apiMock.getElectionPackage.expectRepeatedCallsWith({ electionId }).resolves({
    task: {
      createdAt: new Date(),
      id: '1',
      payload: '',
      taskName: 'generate_election_package',
    },
  });
  userEvent.click(screen.getButton('Export Election Package and Ballots'));
});

test('using CDF', async () => {
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
      shouldExportSampleBallots: false,
      shouldExportTestBallots: false,
      numAuditIdBallots: undefined,
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

test('export ballots with audit ballot IDs', async () => {
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  const taskCreatedAt = new Date();
  apiMock.exportElectionPackage
    .expectCallWith({
      electionId,
      electionSerializationFormat: 'vxf',
      shouldExportAudio: false,
      shouldExportSampleBallots: false,
      shouldExportTestBallots: false,
      numAuditIdBallots: 10,
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
  const numAuditIdBallotsInput = screen.getByLabelText(
    'Number of Audit IDs to Generate'
  );
  expect(numAuditIdBallotsInput).toBeDisabled();
  userEvent.click(
    screen.getByRole('checkbox', { name: 'Generate audit IDs for ballots' })
  );
  expect(numAuditIdBallotsInput).toBeEnabled();
  expect(numAuditIdBallotsInput).toHaveValue(1);
  userEvent.type(numAuditIdBallotsInput, '0'); // Add 0 after 1 to make it 10
  userEvent.click(screen.getButton('Export Election Package and Ballots'));

  await screen.findByText('Exporting Election Package and Ballots');
});

test('decrypt ballot audit IDs in CVRs', async () => {
  // Change global File to ensure File.arrayBuffer exists
  global.File = NodeFile as unknown as typeof global.File;
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  const secretKeyInput = screen.getByLabelText('Secret Key');
  expect(secretKeyInput).toBeEnabled();
  expect(secretKeyInput).toHaveValue('');
  const cvrZipInput = screen.getByLabelText('Select CVR Export Zip File');
  expect(cvrZipInput).toBeDisabled();

  const secretKey = 'test-secret-key';
  userEvent.type(secretKeyInput, secretKey);
  expect(cvrZipInput).toBeEnabled();
  const cvrZipFileContents = Buffer.from('test cvr zip file contents');
  apiMock.decryptCvrBallotAuditIds
    .expectCallWith({ secretKey, cvrZipFileContents })
    .resolves(Buffer.from('decrypted cvr zip file contents'));
  userEvent.upload(
    cvrZipInput,
    new File([cvrZipFileContents], 'cvr-export.zip', {
      type: 'application/zip',
    })
  );

  vi.mocked(URL.createObjectURL).mockReturnValue(
    'decrypted cvr export object url'
  );
  await waitFor(() => {
    expect(vi.mocked(URL.createObjectURL)).toHaveBeenCalledWith(
      new Blob(['decrypted cvr zip file contents'], { type: 'application/zip' })
    );
    expect(vi.mocked(downloadFile)).toHaveBeenCalledWith(
      'decrypted cvr export object url',
      'decrypted-cvrs.zip'
    );
  });
  expect(secretKeyInput).toHaveValue('');
  global.File = File;
});

test('feature flag to hide ballot template selector', async () => {
  mockUserFeatures(apiMock, { CHOOSE_BALLOT_TEMPLATE: false });
  renderScreen();
  await screen.findAllByRole('heading', { name: 'Export' });

  expect(screen.queryByLabelText('Ballot Template')).not.toBeInTheDocument();
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
  apiMock.getBallotTemplate.expectCallWith({ electionId }).resolves('NhBallot');
  userEvent.click(select);
  userEvent.click(screen.getByText('New Hampshire Ballot'));

  await waitFor(() => {
    apiMock.assertComplete();
  });
  screen.getByText('New Hampshire Ballot');
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

describe('state defaults', () => {
  interface Spec {
    feat: StateFeaturesConfig;
    name: string;
  }

  const specs: Spec[] = [
    { name: 'Include audio', feat: { AUDIO_ENABLED: true } },
    { name: 'Include sample ballots', feat: { EXPORT_SAMPLE_BALLOTS: true } },
    { name: 'Include test ballots', feat: { EXPORT_TEST_BALLOTS: true } },
  ];

  for (const { feat: features, name } of specs) {
    test(`enables "${name}" based on feature flag`, async () => {
      mockStateFeatures(apiMock, electionId, features);
      renderScreen();
      await screen.findByRole('checkbox', { name, checked: true });
    });
  }
});
