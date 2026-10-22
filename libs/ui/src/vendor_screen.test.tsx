import { beforeEach, expect, type Mock, test, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { userEvent } from '@testing-library/user-event';

import {
  render,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library.js';
import { VendorScreen } from './vendor_screen.js';

let mockApiClient: {
  generateSignedHashValidationQrCodeValue: Mock;
  rebootToVendorMenu: Mock;
};
let mockLogOut: Mock;
let mockUnconfigureMachine: Mock;

beforeEach(() => {
  mockApiClient = {
    generateSignedHashValidationQrCodeValue: vi.fn(() =>
      Promise.resolve({
        qrCodeValue: 'qr-code-value',
        qrCodeInputs: {
          combinedElectionHash: 'combined-election-hash',
          date: new Date('1/1/2024, 12:00:00 PM'),
          machineId: 'machine-id',
          softwareVersion: 'software-version',
          systemHash: ''.padEnd(44, '='),
        },
      })
    ),
    rebootToVendorMenu: vi.fn(),
  };
  mockLogOut = vi.fn();
  mockUnconfigureMachine = vi.fn();
});

test('Signed Hash Validation', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VendorScreen
        apiClient={mockApiClient}
        canUnconfigure
        logOut={mockLogOut}
        unconfigureMachine={mockUnconfigureMachine}
      />
    </QueryClientProvider>
  );

  const signedHashValidationButton = screen.getByRole('button', {
    name: 'Signed Hash Validation',
  });

  await userEvent.click(signedHashValidationButton);

  expect(
    mockApiClient.generateSignedHashValidationQrCodeValue
  ).toHaveBeenCalledTimes(1);
  expect(mockApiClient.rebootToVendorMenu).not.toHaveBeenCalled();
  expect(mockLogOut).not.toHaveBeenCalled();
  expect(mockUnconfigureMachine).not.toHaveBeenCalled();
});

test('rebooting to vendor menu', async () => {
  render(
    <VendorScreen
      apiClient={mockApiClient}
      canUnconfigure
      logOut={mockLogOut}
      unconfigureMachine={mockUnconfigureMachine}
    />
  );

  const rebootToVendorMenuButton = screen.getByRole('button', {
    name: 'Reboot to Vendor Menu',
  });

  await userEvent.click(rebootToVendorMenuButton);

  expect(
    mockApiClient.generateSignedHashValidationQrCodeValue
  ).not.toHaveBeenCalled();
  expect(mockApiClient.rebootToVendorMenu).toHaveBeenCalledTimes(1);
  expect(mockLogOut).not.toHaveBeenCalled();
  expect(mockUnconfigureMachine).not.toHaveBeenCalled();
});

test('unconfiguring machine', async () => {
  render(
    <VendorScreen
      apiClient={mockApiClient}
      canUnconfigure
      logOut={mockLogOut}
      unconfigureMachine={mockUnconfigureMachine}
    />
  );

  const unconfigureMachineButton = screen.getByRole('button', {
    name: 'Unconfigure Machine',
  });

  await userEvent.click(unconfigureMachineButton);
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Unconfigure Machine' });
  await userEvent.click(
    within(modal).getByRole('button', { name: 'Delete All Election Data' })
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );

  expect(
    mockApiClient.generateSignedHashValidationQrCodeValue
  ).not.toHaveBeenCalled();
  expect(mockApiClient.rebootToVendorMenu).not.toHaveBeenCalled();
  expect(mockLogOut).not.toHaveBeenCalled();
  expect(mockUnconfigureMachine).toHaveBeenCalledTimes(1);
});

test('locking machine', async () => {
  render(
    <VendorScreen
      apiClient={mockApiClient}
      canUnconfigure
      logOut={mockLogOut}
      unconfigureMachine={mockUnconfigureMachine}
    />
  );

  const lockMachineButton = screen.getByRole('button', {
    name: 'Lock Machine',
  });

  await userEvent.click(lockMachineButton);

  expect(
    mockApiClient.generateSignedHashValidationQrCodeValue
  ).not.toHaveBeenCalled();
  expect(mockApiClient.rebootToVendorMenu).not.toHaveBeenCalled();
  expect(mockLogOut).toHaveBeenCalledTimes(1);
  expect(mockUnconfigureMachine).not.toHaveBeenCalled();
});

test('if logOut is not passed, Lock Machine button is not rendered', () => {
  render(
    <VendorScreen
      apiClient={mockApiClient}
      canUnconfigure
      unconfigureMachine={mockUnconfigureMachine}
    />
  );

  screen.getByRole('button', { name: 'Reboot to Vendor Menu' });
  screen.getByRole('button', { name: 'Unconfigure Machine' });
  expect(
    screen.queryByRole('button', { name: 'Lock Machine' })
  ).not.toBeInTheDocument();
});

test('if canUnconfigure is false, Unconfigure Machine button is disabled', () => {
  render(
    <VendorScreen
      apiClient={mockApiClient}
      canUnconfigure={false}
      logOut={mockLogOut}
      unconfigureMachine={mockUnconfigureMachine}
    />
  );

  const unconfigureMachineButton = screen.getByRole('button', {
    name: 'Unconfigure Machine',
  });
  expect(unconfigureMachineButton).toBeDisabled();
});
