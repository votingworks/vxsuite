import { beforeEach, expect, Mock, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor, within } from '../test/react_testing_library';
import { VendorScreen } from './vendor_screen';

let mockLogOut: Mock;
let mockRebootToVendorMenu: Mock;
let mockUnconfigureMachine: Mock;

beforeEach(() => {
  mockLogOut = vi.fn();
  mockRebootToVendorMenu = vi.fn();
  mockUnconfigureMachine = vi.fn();
});

test('clicking Reboot to Vendor Menu calls rebootToVendorMenu', () => {
  render(
    <VendorScreen
      logOut={mockLogOut}
      rebootToVendorMenu={mockRebootToVendorMenu}
      unconfigureMachine={mockUnconfigureMachine}
      isMachineConfigured
    />
  );

  const rebootToVendorMenuButton = screen.getByRole('button', {
    name: 'Reboot to Vendor Menu',
  });

  userEvent.click(rebootToVendorMenuButton);

  expect(mockRebootToVendorMenu).toHaveBeenCalledTimes(1);
  expect(mockUnconfigureMachine).not.toHaveBeenCalled();
  expect(mockLogOut).not.toHaveBeenCalled();
});

test('clicking Unconfigure Machine and confirming calls unconfigureMachine', async () => {
  render(
    <VendorScreen
      logOut={mockLogOut}
      rebootToVendorMenu={mockRebootToVendorMenu}
      unconfigureMachine={mockUnconfigureMachine}
      isMachineConfigured
    />
  );

  const unconfigureMachineButton = screen.getByRole('button', {
    name: 'Unconfigure Machine',
  });

  userEvent.click(unconfigureMachineButton);
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Unconfigure Machine' });
  userEvent.click(
    within(modal).getByRole('button', { name: 'Delete All Election Data' })
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );

  expect(mockRebootToVendorMenu).not.toHaveBeenCalled();
  expect(mockUnconfigureMachine).toHaveBeenCalledTimes(1);
  expect(mockLogOut).not.toHaveBeenCalled();
});

test('clicking Lock Machine calls logOut', () => {
  render(
    <VendorScreen
      logOut={mockLogOut}
      rebootToVendorMenu={mockRebootToVendorMenu}
      unconfigureMachine={mockUnconfigureMachine}
      isMachineConfigured
    />
  );

  const lockMachineButton = screen.getByRole('button', {
    name: 'Lock Machine',
  });

  userEvent.click(lockMachineButton);

  expect(mockRebootToVendorMenu).not.toHaveBeenCalled();
  expect(mockUnconfigureMachine).not.toHaveBeenCalled();
  expect(mockLogOut).toHaveBeenCalledTimes(1);
});

test('if logOut is not passed, Lock Machine button is not rendered', () => {
  render(
    <VendorScreen
      rebootToVendorMenu={mockRebootToVendorMenu}
      unconfigureMachine={mockUnconfigureMachine}
      isMachineConfigured
    />
  );

  screen.getByRole('button', { name: 'Reboot to Vendor Menu' });
  screen.getByRole('button', { name: 'Unconfigure Machine' });
  expect(
    screen.queryByRole('button', { name: 'Lock Machine' })
  ).not.toBeInTheDocument();
});

test('if isMachineConfigured is false, Unconfigure Machine button is disabled', () => {
  render(
    <VendorScreen
      logOut={mockLogOut}
      rebootToVendorMenu={mockRebootToVendorMenu}
      unconfigureMachine={mockUnconfigureMachine}
      isMachineConfigured={false}
    />
  );

  const unconfigureMachineButton = screen.getByRole('button', {
    name: 'Unconfigure Machine',
  });
  expect(unconfigureMachineButton).toBeDisabled();
});
