import { expect, test } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import type { CastVoteRecordFileRecord } from '@votingworks/admin-backend';

import { hasTextAcrossElements } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { CvrsScreen } from './cvrs_screen';
import { createApiMock } from '../../../test/helpers/mock_api_client';
import { screen, waitFor } from '../../../test/react_testing_library';

const electionDefinition = readElectionGeneralDefinition();
const { election } = electionDefinition;

const nLocations = election.pollingPlaces.length;
const [place1, place2] = election.pollingPlaces;

test('renders summary cards', async () => {
  const api = createApiMock();

  api.expectGetCastVoteRecordFileMode('unlocked');
  api.expectGetCastVoteRecordFiles([
    mockCvrFile({
      numCvrsImported: 15,
      pollingPlaceIds: [place1.id],
      scannerIds: ['001'],
    }),
    mockCvrFile({
      numCvrsImported: 25,
      pollingPlaceIds: [place2.id],
      scannerIds: ['002'],
    }),
  ]);

  renderInAppContext(<CvrsScreen />, {
    apiMock: api,
    electionDefinition,
  });

  await waitFor(() => api.assertComplete());

  const n = nLocations;
  screen.getByText(hasTextAcrossElements(['Locations', `2 / ${n}`].join('')));
  screen.getByText(hasTextAcrossElements(['Scanners', '2'].join('')));
  screen.getByText(hasTextAcrossElements(['CVRs', '40'].join('')));
});

test('renders location name search box', async () => {
  const api = createApiMock();

  api.expectGetCastVoteRecordFileMode('unlocked');
  api.expectGetCastVoteRecordFiles([]);

  renderInAppContext(<CvrsScreen />, {
    apiMock: api,
    electionDefinition,
  });

  await waitFor(() => api.assertComplete());

  const emptyInput = screen.getByPlaceholderText('Search Locations');
  userEvent.type(emptyInput, place2.name);

  screen.getByDisplayValue(place2.name);
  // [TODO] Assert that displayed locations are filtered.
});

test('renders location filter buttons', async () => {
  const api = createApiMock();

  api.expectGetCastVoteRecordFileMode('unlocked');
  api.expectGetCastVoteRecordFiles([
    mockCvrFile({
      numCvrsImported: 15,
      pollingPlaceIds: [place1.id],
      scannerIds: ['001'],
    }),
  ]);

  renderInAppContext(<CvrsScreen />, {
    apiMock: api,
    electionDefinition,
  });

  await waitFor(() => api.assertComplete());

  const nPending = nLocations - 1;
  screen.getByRole('option', { name: `All ${nLocations}`, selected: true });
  screen.getByRole('option', { name: `Pending ${nPending}`, selected: false });

  userEvent.click(
    screen.getByRole('option', { name: 'Loaded 1', selected: false })
  );
  screen.getByRole('option', { name: 'Loaded 1', selected: true });
  screen.getByRole('option', { name: /All/, selected: false });
  screen.getByRole('option', { name: /Pending/, selected: false });

  // [TODO] Assert that displayed locations are filtered.
});

test('load button opens import panel', async () => {
  const api = createApiMock();

  api.expectGetCastVoteRecordFileMode('unlocked');
  api.expectGetCastVoteRecordFiles([]);

  renderInAppContext(<CvrsScreen />, {
    apiMock: api,
    electionDefinition,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await waitFor(() => api.assertComplete());
  expect(screen.queryByText(/Load CVRs/)).not.toBeInTheDocument();

  api.expectListCastVoteRecordFilesOnUsb([]);
  userEvent.click(screen.getButton('Load'));

  await waitFor(() => api.assertComplete());
  screen.getByText(/Load CVRs/);

  userEvent.click(screen.getButton('Cancel'));
  expect(screen.queryByText(/Load CVRs/)).not.toBeInTheDocument();
});

test('delete button opens confirmation modal', async () => {
  const api = createApiMock();

  api.expectGetCastVoteRecordFileMode('unlocked');
  api.expectGetCastVoteRecordFiles([
    mockCvrFile({
      numCvrsImported: 15,
      pollingPlaceIds: [place1.id],
      scannerIds: ['001'],
    }),
  ]);

  renderInAppContext(<CvrsScreen />, {
    apiMock: api,
    electionDefinition,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await waitFor(() => api.assertComplete());
  expect(screen.queryButton(/Remove All CVRs/)).not.toBeInTheDocument();

  api.expectGetManualResultsMetadata([]);
  userEvent.click(screen.getButton('Remove All'));

  await waitFor(() => api.assertComplete());
  screen.getButton(/Remove All CVRs/);

  userEvent.click(screen.getButton('Cancel'));
  expect(screen.queryButton(/Remove All CVRs/)).not.toBeInTheDocument();
});

function mockCvrFile(
  file: Partial<CastVoteRecordFileRecord>
): CastVoteRecordFileRecord {
  return file as CastVoteRecordFileRecord;
}
