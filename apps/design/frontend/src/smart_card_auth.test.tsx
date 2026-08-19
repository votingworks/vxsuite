import { afterEach, beforeEach, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { DippedSmartCardAuth, TEST_JURISDICTION } from '@votingworks/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { TestErrorBoundary } from '@votingworks/ui';
import {
  createMockSmartCardAuthApiClient,
  mockAuth0Deployment,
  mockAuthStatus,
  mockSystemAdministratorAuthStatus,
  MockSmartCardAuthApiClient,
} from '../test/auth_api_helpers.js';
import { render, screen } from '../test/react_testing_library.js';
import { createQueryClient } from './api.js';
import { SmartCardAuthApiClientContext } from './auth_api.js';
import { SmartCardAuthGate } from './smart_card_auth.js';

let apiMock: MockSmartCardAuthApiClient;

beforeEach(() => {
  apiMock = createMockSmartCardAuthApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderGate() {
  render(
    <TestErrorBoundary>
      <SmartCardAuthApiClientContext.Provider value={apiMock}>
        <QueryClientProvider client={createQueryClient()}>
          <SmartCardAuthGate>
            <div>Unlocked content</div>
          </SmartCardAuthGate>
        </QueryClientProvider>
      </SmartCardAuthApiClientContext.Provider>
    </TestErrorBoundary>
  );
}

test('deployments that use Auth0 skip smart card auth', async () => {
  mockAuth0Deployment(apiMock);
  renderGate();

  await screen.findByText('Unlocked content');
});

test('a logged-in system administrator sees the app', async () => {
  mockSystemAdministratorAuthStatus(apiMock);
  renderGate();

  await screen.findByText('Unlocked content');
});

test('a locked machine prompts for a system administrator card', async () => {
  mockAuthStatus(apiMock, { status: 'logged_out', reason: 'machine_locked' });
  renderGate();

  await screen.findByRole('heading', { name: 'VxDesign Locked' });
  screen.getByText('Insert a system administrator card to unlock.');
});

test('a session expiry locks the machine', async () => {
  mockAuthStatus(apiMock, {
    status: 'logged_out',
    reason: 'machine_locked_by_session_expiry',
  });
  renderGate();

  await screen.findByRole('heading', { name: 'VxDesign Locked' });
});

test('a missing card reader shows setup instructions', async () => {
  mockAuthStatus(apiMock, { status: 'logged_out', reason: 'no_card_reader' });
  renderGate();

  await screen.findByText('Card Reader Not Detected');
});

test('a card whose role is not allowed is rejected', async () => {
  mockAuthStatus(apiMock, {
    status: 'logged_out',
    reason: 'user_role_not_allowed',
    cardUserRole: 'election_manager',
  });
  renderGate();

  await screen.findByText('Invalid Card');
  screen.getByText('Use a system administrator card.');
});

test('checking a PIN unlocks the machine', async () => {
  const checkingPinAuthStatus: DippedSmartCardAuth.AuthStatus = {
    status: 'checking_pin',
    user: {
      role: 'system_administrator',
      jurisdiction: TEST_JURISDICTION,
      programmingMachineType: 'admin',
    },
  };
  apiMock.getAuthStatus.expectCallWith().resolves(checkingPinAuthStatus);
  renderGate();

  await screen.findByText('Enter Card PIN');

  apiMock.checkPin.expectCallWith({ pin: '123456' }).resolves();
  apiMock.getAuthStatus.expectRepeatedCallsWith().resolves({
    status: 'remove_card',
    user: checkingPinAuthStatus.user,
    sessionExpiresAt: new Date(),
  });
  for (const digit of '123456') {
    userEvent.click(screen.getByRole('button', { name: digit }));
  }

  await screen.findByText('Remove card to unlock VxDesign');
});

test('a card error while checking a PIN surfaces an error', async () => {
  await suppressingConsoleOutput(async () => {
    apiMock.getAuthStatus.expectRepeatedCallsWith().resolves({
      status: 'checking_pin',
      user: {
        role: 'system_administrator',
        jurisdiction: TEST_JURISDICTION,
        programmingMachineType: 'admin',
      },
    });
    renderGate();

    await screen.findByText('Enter Card PIN');

    apiMock.checkPin
      .expectCallWith({ pin: '123456' })
      .throws(new Error('card error'));
    for (const digit of '123456') {
      userEvent.click(screen.getByRole('button', { name: digit }));
    }

    await screen.findByText('Test Error Boundary');
  });
});
