import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library';
import {
  ApiMock,
  ApiMockProvider,
  createApiMock,
} from '../../test/mock_api_client';
import { PrintScreen } from './print_screen';

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

// This polling place covers only the North Lincoln precinct (id '23').
const SINGLE_PRECINCT_POLLING_PLACE_ID = '23-polling-place';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
  vi.useRealTimers();
});

function mockBaseQueries({
  pollingPlaceId = null,
}: { pollingPlaceId?: string | null } = {}) {
  apiMock.getDeviceStatuses.expectRepeatedCallsWith().resolves({
    usbDrive: { status: 'no_drive' },
    printer: { connected: true, config: HP_LASER_PRINTER_CONFIG },
  });
  apiMock.getElectionRecord.expectCallWith().resolves({
    electionDefinition,
    electionPackageHash: 'test-hash',
  });
  apiMock.getMachineConfig.expectCallWith().resolves({
    machineId: 'test-machine',
    codeVersion: 'test-version',
  });
  apiMock.getPollingPlaceId.expectCallWith().resolves(pollingPlaceId);
  apiMock.getSystemSettings.expectCallWith().resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.getTestMode.expectCallWith().resolves(true);
}

function renderScreen({
  isElectionManagerAuth,
}: {
  isElectionManagerAuth: boolean;
}) {
  return render(
    <ApiMockProvider apiMock={apiMock}>
      <MemoryRouter initialEntries={['/print']}>
        <PrintScreen isElectionManagerAuth={isElectionManagerAuth} />
      </MemoryRouter>
    </ApiMockProvider>
  );
}

test('poll workers only see precincts for the configured polling place', async () => {
  mockBaseQueries({ pollingPlaceId: SINGLE_PRECINCT_POLLING_PLACE_ID });
  renderScreen({ isElectionManagerAuth: false });

  await screen.findByRole('option', { name: 'North Lincoln' });
  expect(
    screen.queryByRole('option', { name: 'South Lincoln' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: 'East Lincoln' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: 'West Lincoln' })
  ).not.toBeInTheDocument();
});

test('election managers see all precincts regardless of the configured polling place', async () => {
  mockBaseQueries({ pollingPlaceId: SINGLE_PRECINCT_POLLING_PLACE_ID });
  renderScreen({ isElectionManagerAuth: true });

  await screen.findByRole('option', { name: 'North Lincoln' });
  screen.getByRole('option', { name: 'South Lincoln' });
  screen.getByRole('option', { name: 'East Lincoln' });
  screen.getByRole('option', { name: 'West Lincoln' });
});
