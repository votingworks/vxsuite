import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { deferred } from '@votingworks/basics';
import {
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DEV_MACHINE_ID, type DippedSmartCardAuth } from '@votingworks/types';
import { SystemCallContextProvider } from '@votingworks/ui';
import {
  render,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library.js';
import {
  createRestoreApiMock,
  type RestoreApiMock,
} from '../../test/helpers/mock_restore_api_client.js';
import { SharedApiClientContext, systemCallApi } from '../shared_api.js';
import { type ApiClient, createQueryClient } from './api.js';
import { RestoreApp } from './restore_app.js';

let apiMock: RestoreApiMock;
let queryClient: QueryClient;

const SYSTEM_ADMINISTRATOR_AUTH: DippedSmartCardAuth.AuthStatus = {
  status: 'logged_in',
  user: mockSystemAdministratorUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
  programmableCard: { status: 'no_card' },
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createRestoreApiMock();
  queryClient = createQueryClient();
  apiMock.expectGetMachineConfig();
});

afterEach(() => {
  queryClient.clear();
  apiMock.assertComplete();
});

function renderRestoreApp() {
  const apiClient = apiMock.apiClient as unknown as ApiClient;
  return render(
    <SharedApiClientContext.Provider value={apiClient}>
      <SystemCallContextProvider api={systemCallApi}>
        <RestoreApp apiClient={apiClient} queryClient={queryClient} />
      </SystemCallContextProvider>
    </SharedApiClientContext.Provider>
  );
}

test('asks for a system administrator card while locked', async () => {
  apiMock.setAuthStatus({ status: 'logged_out', reason: 'machine_locked' });
  renderRestoreApp();

  await screen.findByText('VxAdmin Locked');
  screen.getByText('Insert system administrator card to unlock.');
  screen.getByText('Restore Mode');
  screen.getByText(DEV_MACHINE_ID);
  screen.getButton('Exit Restore Mode');
});

test('asks for a system administrator card after the session expires', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked_by_session_expiry',
  });
  renderRestoreApp();

  await screen.findByText('VxAdmin Locked');
});

test('turns away a card that is not a system administrator card', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'user_role_not_allowed',
  });
  renderRestoreApp();

  await screen.findByText(/Use a system administrator card\./);
  screen.getByText('Restore Mode');
});

test('walks through the card reader, PIN, and remove-card states', async () => {
  apiMock.apiClient.getAuthStatus
    .expectCallWith()
    .resolves({ status: 'logged_out', reason: 'no_card_reader' });
  apiMock.apiClient.getAuthStatus
    .expectCallWith()
    .resolves({ status: 'checking_pin', user: mockSystemAdministratorUser() });
  apiMock.setAuthStatus({
    status: 'remove_card',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  renderRestoreApp();

  await screen.findByText('Card Reader Not Detected');
  await screen.findByText('Enter Card PIN');
  await screen.findByText(/Remove card to unlock/i);
});

test('shows the restore screen to a system administrator', async () => {
  apiMock.setAuthStatus(SYSTEM_ADMINISTRATOR_AUTH);
  renderRestoreApp();

  await screen.findByRole('heading', { name: 'Restore from Backup' });
  screen.getByText('Restore Mode');
  screen.getByText(DEV_MACHINE_ID);
  screen.getButton('Exit Restore Mode');
});

test('locks the machine on request', async () => {
  apiMock.setAuthStatus(SYSTEM_ADMINISTRATOR_AUTH);
  apiMock.apiClient.logOut.expectCallWith().resolves();
  renderRestoreApp();

  (await screen.findButton('Lock Machine')).click();
  await waitFor(() => apiMock.apiClient.logOut.assertComplete());
});

test('exits restore mode after confirmation', async () => {
  apiMock.setAuthStatus({ status: 'logged_out', reason: 'machine_locked' });
  const reboot = deferred<void>();
  apiMock.apiClient.reboot.expectCallWith().returns(reboot.promise);
  renderRestoreApp();

  (await screen.findButton('Exit Restore Mode')).click();
  let modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Exit Restore Mode' });
  within(modal).getByText('VxAdmin will restart normally.');
  within(modal).getByRole('button', { name: 'Cancel' }).click();
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

  screen.getButton('Exit Restore Mode').click();
  modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('button', { name: 'Restart' }).click();
  await waitFor(() =>
    expect(
      within(modal).getByRole('button', { name: 'Restart' })
    ).toBeDisabled()
  );
  expect(within(modal).getByRole('button', { name: 'Cancel' })).toBeDisabled();

  reboot.resolve();
  await waitFor(() => expect(queryClient.isMutating()).toEqual(0));
  expect(within(modal).getByRole('button', { name: 'Restart' })).toBeDisabled();
  expect(within(modal).getByRole('button', { name: 'Cancel' })).toBeDisabled();
});
