import { beforeEach, expect, Mock, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../test/react_testing_library';
import { VendorScreen } from './vendor_screen';

let mockLogOut: Mock;
let mockRebootToVendorMenu: Mock;

beforeEach(() => {
  mockLogOut = vi.fn();
  mockRebootToVendorMenu = vi.fn();
});

test('Renders properly when logOut is provided', () => {
  render(
    <VendorScreen
      logOut={mockLogOut}
      rebootToVendorMenu={mockRebootToVendorMenu}
    />
  );

  const rebootToVendorMenuButton = screen.getByText('Reboot to Vendor Menu');
  const lockMachineButton = screen.getByText('Lock Machine');
  expect(mockRebootToVendorMenu).not.toHaveBeenCalled();
  expect(mockLogOut).not.toHaveBeenCalled();

  userEvent.click(rebootToVendorMenuButton);
  expect(mockRebootToVendorMenu).toHaveBeenCalledTimes(1);
  expect(mockLogOut).not.toHaveBeenCalled();

  userEvent.click(lockMachineButton);
  expect(mockRebootToVendorMenu).toHaveBeenCalledTimes(1);
  expect(mockLogOut).toHaveBeenCalledTimes(1);
});

test('Renders properly when logOut is not provided', () => {
  render(<VendorScreen rebootToVendorMenu={mockRebootToVendorMenu} />);

  const rebootToVendorMenuButton = screen.getByText('Reboot to Vendor Menu');
  screen.getByText('Remove the card to leave this screen.');

  userEvent.click(rebootToVendorMenuButton);
  expect(mockRebootToVendorMenu).toHaveBeenCalledTimes(1);
});
