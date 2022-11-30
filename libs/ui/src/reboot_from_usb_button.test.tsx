import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { usbstick } from '@votingworks/utils';
import { fakeKiosk } from '@votingworks/test-utils';
import { Logger, LogSource } from '@votingworks/logging';
import { RebootFromUsbButton } from './reboot_from_usb_button';

beforeEach(() => {
  window.kiosk = fakeKiosk();
});

test('renders without a USB drive as expected.', async () => {
  const { container } = render(
    <RebootFromUsbButton
      usbDriveStatus={usbstick.UsbDriveStatus.absent}
      logger={new Logger(LogSource.VxAdminFrontend)}
    />
  );
  // Initially should just contain the button
  expect(container).toMatchInlineSnapshot(`
    .c0 {
      display: inline-block;
      border: none;
      border-radius: 0.25em;
      box-shadow: 0 0 0 0 rgba(71,167,75,1);
      box-sizing: border-box;
      background: rgb(211,211,211);
      cursor: pointer;
      padding: 0.75em 1em;
      text-align: center;
      line-height: 1.25;
      color: black;
      touch-action: manipulation;
    }

    .c0:hover,
    .c0:active {
      outline: none;
    }

    <div>
      <button
        class="c0"
        type="button"
      >
        Reboot from USB
      </button>
    </div>
  `);
  fireEvent.click(screen.getByText('Reboot from USB'));
  await screen.findByText('No USB Drive Detected');
});

test('renders with a non-bootable USB as expected', async () => {
  window.kiosk!.prepareToBootFromUsb = jest.fn().mockResolvedValue(false);
  render(
    <RebootFromUsbButton
      usbDriveStatus={usbstick.UsbDriveStatus.mounted}
      logger={new Logger(LogSource.VxAdminFrontend)}
    />
  );
  fireEvent.click(screen.getByText('Reboot from USB'));
  await screen.findByText(
    /The USB Drive was not found in the list of bootable devices./
  );
  expect(window.kiosk!.prepareToBootFromUsb).toHaveBeenCalledTimes(1);
  expect(window.kiosk!.reboot).toHaveBeenCalledTimes(0);
  fireEvent.click(screen.getByText('Close'));
  expect(
    screen.queryAllByText(
      /The USB Drive was not found in the list of bootable devices./
    )
  ).toHaveLength(0);
  fireEvent.click(screen.getByText('Reboot from USB'));
  await screen.findByText(
    /The USB Drive was not found in the list of bootable devices./
  );
  fireEvent.click(screen.getByText('Reboot'));
  await screen.findByText('Rebooting…');
  expect(window.kiosk!.reboot).toHaveBeenCalledTimes(1);
});

test('reboots automatically when clicked with a bootable USB', async () => {
  window.kiosk!.prepareToBootFromUsb = jest.fn().mockResolvedValue(true);
  render(
    <RebootFromUsbButton
      usbDriveStatus={usbstick.UsbDriveStatus.mounted}
      logger={new Logger(LogSource.VxAdminFrontend)}
    />
  );
  fireEvent.click(screen.getByText('Reboot from USB'));
  await screen.findByText('Rebooting…');
  expect(window.kiosk!.prepareToBootFromUsb).toHaveBeenCalledTimes(1);
  expect(window.kiosk!.reboot).toHaveBeenCalledTimes(1);
});

test('modal state updates when USB drive is inserted.', async () => {
  window.kiosk!.prepareToBootFromUsb = jest.fn().mockResolvedValue(false);
  const { rerender } = render(
    <RebootFromUsbButton
      usbDriveStatus={usbstick.UsbDriveStatus.absent}
      logger={new Logger(LogSource.VxAdminFrontend)}
    />
  );
  fireEvent.click(screen.getByText('Reboot from USB'));
  await screen.findByText('No USB Drive Detected');
  rerender(
    <RebootFromUsbButton
      usbDriveStatus={usbstick.UsbDriveStatus.mounted}
      logger={new Logger(LogSource.VxAdminFrontend)}
    />
  );
  await screen.findByText(/The USB Drive was not found/);
  expect(window.kiosk!.prepareToBootFromUsb).toHaveBeenCalledTimes(1);
  expect(window.kiosk!.reboot).toHaveBeenCalledTimes(0);
});
