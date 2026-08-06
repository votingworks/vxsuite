import { describe, expect, test } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import type {
  CastVoteRecordFileRecord,
  CvrFileMode,
} from '@votingworks/admin-backend';

import { hasTextAcrossElements } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { renderInAppContext } from '../../../test/render_in_app_context.js';
import { CvrsScreen } from './cvrs_screen.js';
import { createApiMock } from '../../../test/helpers/mock_api_client.js';
import { screen, waitFor } from '../../../test/react_testing_library.js';

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

test('location name search box filters location list', async () => {
  const api = createApiMock();

  api.expectGetCastVoteRecordFileMode('unlocked');
  api.expectGetCastVoteRecordFiles([]);

  renderInAppContext(<CvrsScreen />, {
    apiMock: api,
    electionDefinition,
  });

  await waitFor(() => api.assertComplete());
  for (const place of election.pollingPlaces) {
    screen.getButton(new RegExp(place.name));
  }

  const emptyInput = screen.getByPlaceholderText('Search Locations');
  userEvent.type(emptyInput, place2.name.toLowerCase());

  screen.getByDisplayValue(place2.name.toLowerCase());
  screen.getButton(new RegExp(place2.name));

  for (const place of election.pollingPlaces) {
    if (place.name === place2.name) continue;
    expect(screen.queryButton(new RegExp(place.name))).not.toBeInTheDocument();
  }
});

test('location filter buttons filter location list', async () => {
  const api = createApiMock();
  const loadedPlace = place1;

  api.expectGetCastVoteRecordFileMode('unlocked');
  api.expectGetCastVoteRecordFiles([
    mockCvrFile({
      numCvrsImported: 15,
      pollingPlaceIds: [loadedPlace.id],
      scannerIds: ['001'],
    }),
  ]);

  renderInAppContext(<CvrsScreen />, {
    apiMock: api,
    electionDefinition,
  });

  await waitFor(() => api.assertComplete());
  for (const place of election.pollingPlaces) {
    screen.getButton(new RegExp(place.name));
  }

  const nPending = nLocations - 1;
  screen.getByRole('option', { name: `All ${nLocations}`, selected: true });
  screen.getByRole('option', { name: `Pending ${nPending}`, selected: false });

  userEvent.click(
    screen.getByRole('option', { name: 'Loaded 1', selected: false })
  );
  screen.getByRole('option', { name: 'Loaded 1', selected: true });
  screen.getByRole('option', { name: /All/, selected: false });
  screen.getByRole('option', { name: /Pending/, selected: false });

  screen.getButton(new RegExp(loadedPlace.name));

  for (const place of election.pollingPlaces) {
    if (place.name === loadedPlace.name) continue;
    expect(screen.queryButton(new RegExp(place.name))).not.toBeInTheDocument();
  }
});

test('search input and filter buttons are both used for filtering', async () => {
  const api = createApiMock();
  const loadedPlace = place1;

  api.expectGetCastVoteRecordFileMode('unlocked');
  api.expectGetCastVoteRecordFiles([
    mockCvrFile({
      numCvrsImported: 15,
      pollingPlaceIds: [loadedPlace.id],
      scannerIds: ['001'],
    }),
  ]);

  renderInAppContext(<CvrsScreen />, {
    apiMock: api,
    electionDefinition,
  });

  await waitFor(() => api.assertComplete());
  for (const place of election.pollingPlaces) {
    screen.getButton(new RegExp(place.name));
  }

  const emptyInput = screen.getByPlaceholderText('Search Locations');
  userEvent.type(emptyInput, loadedPlace.name);
  screen.getButton(new RegExp(loadedPlace.name));

  userEvent.click(screen.getByRole('option', { name: /Pending/ }));
  expect(
    screen.queryButton(new RegExp(loadedPlace.name))
  ).not.toBeInTheDocument();
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

  userEvent.click(screen.getButton('Done'));
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

describe('cvr modes', () => {
  async function renderWithMode(mode: CvrFileMode) {
    const api = createApiMock();
    api.expectGetCastVoteRecordFileMode(mode);
    api.expectGetCastVoteRecordFiles([]);

    renderInAppContext(<CvrsScreen />, {
      apiMock: api,
      electionDefinition,
    });

    await waitFor(() => api.assertComplete());
  }

  test('unlocked', async () => {
    await renderWithMode('unlocked');
    expect(screen.queryByText(/test ballot mode/i)).not.toBeInTheDocument();
  });

  test('official', async () => {
    await renderWithMode('official');
    expect(screen.queryByText(/test ballot mode/i)).not.toBeInTheDocument();
  });

  // eslint-disable-next-line vitest/valid-title
  test('test', async () => {
    await renderWithMode('test');
    screen.getByText(/test ballot mode/i);
  });
});

function mockCvrFile(
  file: Partial<CastVoteRecordFileRecord>
): CastVoteRecordFileRecord {
  return file as CastVoteRecordFileRecord;
}
