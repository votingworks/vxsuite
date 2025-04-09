import { describe, test, beforeEach, afterEach, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { DippedSmartCardAuth } from '@votingworks/types';
import {
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
// import { createMemoryHistory } from 'history';
// import { mockUsbDriveStatus } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import { screen } from '../test/react_testing_library';
import { ApiMock, createApiMock } from '../test/mock_api_client';
import { SystemAdministratorScreen } from './system_administrator_screen';
import { renderInAppContext } from '../test/render_in_app_context';

let apiMock: ApiMock;
const electionFamousNames = electionFamousNames2021Fixtures.readElection();
const auth: DippedSmartCardAuth.SystemAdministratorLoggedIn = {
  status: 'logged_in',
  user: mockSystemAdministratorUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
  programmableCard: { status: 'no_card' },
};

let unmount: () => void;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.setElection(electionFamousNames);
  apiMock.expectGetMachineConfig();
  apiMock.expectGetDeviceStatuses();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  unmount();
});

describe('Election tab', () => {
  test('basic render', async () => {
    const renderResult = renderInAppContext(<SystemAdministratorScreen />, {
      apiMock,
      auth,
    });
    unmount = renderResult.unmount;

    await screen.findByRole('heading', { name: 'Election' });
  });
});

describe('Settings tab', () => {
  async function renderSettingsTab() {
    const renderResult = renderInAppContext(<SystemAdministratorScreen />, {
      apiMock,
      auth,
    });
    unmount = renderResult.unmount;

    const settingsTabButton = await screen.findByRole('button', {
      name: 'Settings',
    });
    userEvent.click(settingsTabButton);

    await screen.findByRole('heading', { name: 'Settings' });
  }

  beforeEach(() => {
    apiMock.expectGetUsbDriveStatus();
  });

  afterEach(() => {
    unmount();
  });

  test('basic render', async () => {
    await renderSettingsTab();
  });

  test('save logs button', async () => {
    await renderSettingsTab();

    // Full functionality tested in libs/ui/src/export_logs_modal.test.tsx
    userEvent.click(screen.getByRole('button', { name: 'Save Logs' }));
    await screen.findByRole('heading', { name: 'No USB Drive Detected' });
  });

  test('set date and time button', async () => {
    await renderSettingsTab();

    // Full functionality tested in libs/ui/src/set_clock.test.tsx
    userEvent.click(screen.getByRole('button', { name: 'Set Date and Time' }));
    await screen.findByRole('heading', { name: 'Set Date and Time' });
  });
});
