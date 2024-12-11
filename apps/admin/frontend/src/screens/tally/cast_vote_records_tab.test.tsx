import { afterEach, beforeEach, expect, test } from 'vitest';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import type { CastVoteRecordFileRecord } from '@votingworks/admin-backend';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { ok } from '@votingworks/basics';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { screen, within, waitFor } from '../../../test/react_testing_library';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { CastVoteRecordsTab } from './cast_vote_records_tab';
import {
  mockCastVoteRecordFileMetadata,
  mockCastVoteRecordFileRecord,
  mockCastVoteRecordImportInfo,
  mockManualResultsMetadata,
  TEST_FILE1,
  TEST_FILE2,
} from '../../../test/api_mock_data';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition = electionGeneralDefinition;
const { election } = electionDefinition;

const mockCvrFiles: CastVoteRecordFileRecord[] = [
  {
    ...mockCastVoteRecordFileRecord,
    filename: TEST_FILE1,
    numCvrsImported: 1000,
    precinctIds: [election.precincts[0].id, election.precincts[1].id],
    exportTimestamp: '2021-01-01T12:00:00Z',
    scannerIds: ['SCAN1', 'SCAN2'],
  },
  {
    ...mockCastVoteRecordFileRecord,
    filename: TEST_FILE2,
    numCvrsImported: 2000,
    precinctIds: [election.precincts[2].id],
    exportTimestamp: '2021-01-01T01:00:00Z',
    scannerIds: ['SCAN3'],
  },
];

test('loading CVRs', async () => {
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<CastVoteRecordsTab />, {
    apiMock,
    electionDefinition,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await screen.findByText('No CVRs loaded.');

  apiMock.expectListCastVoteRecordFilesOnUsb(mockCastVoteRecordFileMetadata);
  userEvent.click(screen.getButton('Load CVRs'));
  let importModal = await screen.findByRole('alertdialog');
  userEvent.click(within(importModal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  apiMock.expectListCastVoteRecordFilesOnUsb(mockCastVoteRecordFileMetadata);
  userEvent.click(screen.getButton('Load CVRs'));
  importModal = await screen.findByRole('alertdialog');

  apiMock.apiClient.addCastVoteRecordFile
    .expectCallWith({ path: mockCastVoteRecordFileMetadata[0].path })
    .resolves(ok(mockCastVoteRecordImportInfo));
  apiMock.expectGetCastVoteRecordFiles(mockCvrFiles);
  apiMock.expectGetCastVoteRecordFileMode('official');
  userEvent.click(
    within(importModal).getAllByRole('button', { name: 'Load' })[0]
  );
  await within(importModal).findByText(
    'The CVRs in the selected export were successfully loaded.'
  );
  userEvent.click(within(importModal).getByRole('button', { name: 'Close' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  screen.getByText('Total CVR Count: 3,000');
});

test('shows a table of loaded CVRs', async () => {
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetCastVoteRecordFiles(mockCvrFiles);
  renderInAppContext(<CastVoteRecordsTab />, { apiMock, electionDefinition });

  const table = await screen.findByRole('table');
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent)
  ).toEqual(['#', 'Created At', 'CVR Count', 'Source', 'Precinct']);
  expect(
    within(table)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
  ).toEqual([
    '1.',
    '01/01/2021 03:00:00 AM',
    '1,000 ',
    'SCAN1, SCAN2',
    'Center Springfield, North Springfield',
    '2.',
    '12/31/2020 04:00:00 PM',
    '2,000 ',
    'SCAN3',
    'South Springfield',
  ]);
  screen.getByText('Total CVR Count: 3,000');
});

test('test mode callout', async () => {
  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetCastVoteRecordFiles(mockCvrFiles);
  renderInAppContext(<CastVoteRecordsTab />, { apiMock, electionDefinition });

  await screen.findByText('Test Ballot Mode');
});

test('removing CVRs', async () => {
  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetCastVoteRecordFiles(mockCvrFiles);
  renderInAppContext(<CastVoteRecordsTab />, { apiMock, electionDefinition });

  apiMock.expectGetManualResultsMetadata([]);
  userEvent.click(await screen.findButton('Remove All CVRs'));

  let confirmModal = await screen.findByRole('alertdialog');
  userEvent.click(within(confirmModal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  userEvent.click(await screen.findButton('Remove All CVRs'));
  confirmModal = await screen.findByRole('alertdialog');

  apiMock.expectClearCastVoteRecordFiles();
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  userEvent.click(
    within(confirmModal).getByRole('button', { name: 'Remove All CVRs' })
  );
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  await screen.findByText('No CVRs loaded.');
});

test('removing CVRs in test mode when there are manual tallies prompts to remove tallies', async () => {
  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetCastVoteRecordFiles(mockCvrFiles);
  renderInAppContext(<CastVoteRecordsTab />, { apiMock, electionDefinition });

  apiMock.expectGetManualResultsMetadata(mockManualResultsMetadata);
  userEvent.click(await screen.findButton('Remove All CVRs'));

  let confirmModal = await screen.findByRole('alertdialog');
  userEvent.click(within(confirmModal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  userEvent.click(await screen.findButton('Remove All CVRs'));
  confirmModal = await screen.findByRole('alertdialog');

  apiMock.expectClearCastVoteRecordFiles();
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  userEvent.click(within(confirmModal).getButton('Remove All CVRs'));
  await screen.findByText('No CVRs loaded.');

  apiMock.expectDeleteAllManualResults();
  apiMock.expectGetManualResultsMetadata([]);
  await within(confirmModal).findByRole('heading', {
    name: 'Remove All Manual Tallies',
  });
  userEvent.click(screen.getButton('Remove All Manual Tallies'));

  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
