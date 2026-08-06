import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { DEFAULT_SYSTEM_SETTINGS, SystemSettings } from '@votingworks/types';
import { render, screen } from '../test/react_testing_library.js';
import {
  ApiMock,
  ApiMockProvider,
  createApiMock,
} from '../test/mock_api_client.js';
import { ElectionManagerApp } from './election_manager_app.js';

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
  vi.useRealTimers();
});

function mockBaseQueries(systemSettings: SystemSettings) {
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
  apiMock.getPollingPlaceId.expectCallWith().resolves(null);
  apiMock.getSystemSettings.expectCallWith().resolves(systemSettings);
  apiMock.getTestMode.expectCallWith().resolves(true);
}

function renderApp() {
  return render(
    <ApiMockProvider apiMock={apiMock}>
      <MemoryRouter initialEntries={['/election']}>
        <ElectionManagerApp />
      </MemoryRouter>
    </ApiMockProvider>
  );
}

const TEST_DECKS_NAV_LINK = 'Test Decks';

test('shows the Test Decks nav link when test deck printing is enabled', async () => {
  mockBaseQueries({ ...DEFAULT_SYSTEM_SETTINGS, enableTestDeckPrinting: true });
  renderApp();

  await screen.findByRole('heading', { name: 'Election' });
  expect(screen.getByText(TEST_DECKS_NAV_LINK)).toBeInTheDocument();
});

test('hides the Test Decks nav link when test deck printing is disabled', async () => {
  mockBaseQueries(DEFAULT_SYSTEM_SETTINGS);
  renderApp();

  await screen.findByRole('heading', { name: 'Election' });
  expect(screen.queryByText(TEST_DECKS_NAV_LINK)).not.toBeInTheDocument();
});
