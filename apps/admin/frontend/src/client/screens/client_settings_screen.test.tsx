import { afterEach, beforeEach, expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth, constructElectionKey } from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { screen } from '../../../test/react_testing_library.js';
import {
  ClientApiMock,
  createClientApiMock,
} from '../../../test/helpers/mock_client_api_client.js';
import { renderInClientContext } from '../../../test/render_in_client_context.js';
import { ClientSettingsScreen } from './client_settings_screen.js';

let apiMock: ClientApiMock;

beforeEach(() => {
  apiMock = createClientApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const sysAdminAuth: DippedSmartCardAuth.SystemAdministratorLoggedIn = {
  status: 'logged_in',
  user: mockSystemAdministratorUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
  programmableCard: { status: 'no_card' },
};

test('renders settings screen for system administrator', async () => {
  apiMock.expectGetUsbPortStatus();
  renderInClientContext(<ClientSettingsScreen />, {
    auth: sysAdminAuth,
    apiMock,
  });
  await screen.findByRole('heading', { name: 'Settings' });
  screen.getByRole('heading', { name: 'Logs' });
  screen.getByRole('heading', { name: 'Date and Time' });
  screen.getByRole('heading', { name: 'USB Formatting' });
  screen.getByRole('heading', { name: 'Security' });
  screen.getByRole('heading', { name: 'Machine Mode' });
  screen.getByRole('button', { name: 'Switch to Host Mode' });
});

test('renders settings screen for election manager (fewer sections)', async () => {
  const electionDefinition = readElectionGeneralDefinition();
  const emAuth: DippedSmartCardAuth.ElectionManagerLoggedIn = {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(electionDefinition.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };
  renderInClientContext(<ClientSettingsScreen />, {
    auth: emAuth,
    apiMock,
  });
  await screen.findByRole('heading', { name: 'Settings' });
  screen.getByRole('heading', { name: 'Logs' });
  // EM does not see USB Formatting or Machine Mode sections
  expect(
    screen.queryByRole('heading', { name: 'USB Formatting' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Machine Mode' })
  ).not.toBeInTheDocument();
});

test('does not show Switch to Host Mode when election is configured', async () => {
  apiMock.expectGetUsbPortStatus();
  const electionDefinition = readElectionGeneralDefinition();
  renderInClientContext(<ClientSettingsScreen />, {
    auth: sysAdminAuth,
    electionDefinition,
    apiMock,
  });
  await screen.findByRole('heading', { name: 'Settings' });
  expect(
    screen.queryByRole('button', { name: 'Switch to Host Mode' })
  ).not.toBeInTheDocument();
});

test('shows restart screen after switching to host mode', async () => {
  apiMock.expectGetUsbPortStatus();
  renderInClientContext(<ClientSettingsScreen />, {
    auth: sysAdminAuth,
    apiMock,
  });
  const switchButton = await screen.findByRole('button', {
    name: 'Switch to Host Mode',
  });
  apiMock.apiClient.setMachineMode.expectCallWith({ mode: 'host' }).resolves();
  userEvent.click(switchButton);
  await screen.findByText(/VxAdmin switched to host mode\./);
  screen.getByText(/Restart VxAdmin to continue\./);
  screen.getByRole('button', { name: 'Restart' });
});
