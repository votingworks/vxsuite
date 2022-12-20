import { render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import userEvent from '@testing-library/user-event';
import { LogEventId, Logger, fakeLogger } from '@votingworks/logging';
import {
  advanceTimersAndPromises,
  fakeKiosk,
  fakeUsbDrive,
} from '@votingworks/test-utils';
import { usbstick } from '@votingworks/utils';
import React from 'react';
import { UsbControllerButton } from '../usbcontroller_button';
import { POLLING_INTERVAL_FOR_USB, useUsbDrive } from './use_usb_drive';

const { UsbDriveStatus } = usbstick;

const MOUNTED_DRIVE = fakeUsbDrive();
const UNMOUNTED_DRIVE = fakeUsbDrive({ mountPoint: undefined });

async function waitForStatusUpdate(): Promise<void> {
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_USB / 1000);
}

async function waitForUnmount(): Promise<void> {
  await advanceTimersAndPromises(usbstick.MIN_TIME_TO_UNMOUNT_USB / 1000);
}

let logger: Logger;

beforeEach(() => {
  delete window.kiosk;
  jest.useFakeTimers('legacy');
  logger = fakeLogger();
});

test('returns undefined status at first', async () => {
  const { result } = renderHook(() => useUsbDrive({ logger }));
  expect(result.current.status).toBeUndefined();

  await waitForStatusUpdate();
});

test('returns notavailable if no kiosk', async () => {
  const { result } = renderHook(() => useUsbDrive({ logger }));
  await waitForStatusUpdate();
  expect(result.current.status).toEqual(usbstick.UsbDriveStatus.notavailable);
  expect(logger.log).toHaveBeenCalled();
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({
      previousStatus: undefined,
      newStatus: 'notavailable',
    })
  );
});

test('returns the status after the first tick', async () => {
  const kiosk = fakeKiosk();
  kiosk.getUsbDriveInfo.mockResolvedValue([MOUNTED_DRIVE]);
  window.kiosk = kiosk;

  const { result } = renderHook(() => useUsbDrive({ logger }));
  await waitForStatusUpdate();
  expect(result.current.status).toEqual(usbstick.UsbDriveStatus.mounted);
  expect(logger.log).toHaveBeenCalled();
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({
      previousStatus: undefined,
      newStatus: 'mounted',
    })
  );
});

test('full lifecycle with USBControllerButton', async () => {
  function ThisTestComponent() {
    const usbDrive = useUsbDrive({ logger });
    return (
      <UsbControllerButton
        usbDriveStatus={usbDrive.status ?? UsbDriveStatus.absent}
        usbDriveEject={() => usbDrive.eject('admin')}
      />
    );
  }

  const kiosk = fakeKiosk();
  kiosk.getUsbDriveInfo.mockResolvedValue([]);
  window.kiosk = kiosk;

  // wait for initial status
  render(<ThisTestComponent />);
  await waitForStatusUpdate();
  screen.getByText('No USB');
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({
      previousStatus: undefined,
      newStatus: 'absent',
    })
  );

  // let some time go by
  await waitForStatusUpdate();
  await waitForStatusUpdate();

  // plug in a USB drive
  kiosk.getUsbDriveInfo.mockResolvedValue([UNMOUNTED_DRIVE]);
  await waitForStatusUpdate();
  expect(kiosk.mountUsbDrive).toHaveBeenCalled();
  screen.getByText('Connecting…');
  expect(logger.log).toHaveBeenCalledTimes(5);
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({
      previousStatus: 'absent',
      newStatus: 'present',
    })
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    4,
    LogEventId.UsbDriveMountInit,
    'system'
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    5,
    LogEventId.UsbDriveMounted,
    'system',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // wait for it to mount
  kiosk.getUsbDriveInfo.mockResolvedValue([MOUNTED_DRIVE]);
  await waitForStatusUpdate();
  screen.getByText('Eject USB');
  expect(logger.log).toHaveBeenCalledTimes(6);
  expect(logger.log).toHaveBeenNthCalledWith(
    6,
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({
      previousStatus: 'present',
      newStatus: 'mounted',
    })
  );

  // begin eject
  userEvent.click(screen.getByText('Eject USB'));
  screen.getByText('Ejecting…');
  expect(logger.log).toHaveBeenCalledTimes(7);
  expect(logger.log).toHaveBeenNthCalledWith(
    7,
    LogEventId.UsbDriveEjectInit,
    'admin'
  );
  await advanceTimersAndPromises();

  // ejecting unmounts but does not remove USB drives
  kiosk.getUsbDriveInfo.mockResolvedValue([UNMOUNTED_DRIVE]);
  screen.getByText('Ejecting…');

  await waitForStatusUpdate();
  expect(kiosk.unmountUsbDrive).toHaveBeenCalled();
  await waitForStatusUpdate();
  await advanceTimersAndPromises();
  await waitForUnmount();

  await waitForStatusUpdate();
  screen.getByText('Ejected');
  expect(logger.log).toHaveBeenCalledTimes(9);
  expect(logger.log).toHaveBeenNthCalledWith(
    8,
    LogEventId.UsbDriveEjected,
    'admin',
    expect.objectContaining({ disposition: 'success' })
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    9,
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({
      previousStatus: 'ejecting',
      newStatus: 'present',
    })
  );

  // remove the USB drive
  kiosk.getUsbDriveInfo.mockResolvedValue([]);
  await waitForStatusUpdate();
  screen.getByText('No USB');
  expect(logger.log).toHaveBeenCalledTimes(10);
  expect(logger.log).toHaveBeenNthCalledWith(
    10,
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({
      previousStatus: 'present',
      newStatus: 'absent',
    })
  );
});

test('usb drive that is removed while being ejected is updated to absent', async () => {
  function ThisTestComponent() {
    const usbDrive = useUsbDrive({ logger });
    return (
      <UsbControllerButton
        usbDriveStatus={usbDrive.status ?? UsbDriveStatus.absent}
        usbDriveEject={() => usbDrive.eject('admin')}
      />
    );
  }

  const kiosk = fakeKiosk();
  kiosk.getUsbDriveInfo.mockResolvedValue([MOUNTED_DRIVE]);
  window.kiosk = kiosk;

  // wait for initial status
  render(<ThisTestComponent />);
  await waitForStatusUpdate();
  screen.getByText('Eject USB');
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({
      previousStatus: undefined,
      newStatus: 'mounted',
    })
  );

  // begin eject
  userEvent.click(screen.getByText('Eject USB'));
  screen.getByText('Ejecting…');
  expect(logger.log).toHaveBeenCalledTimes(3);
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.UsbDriveEjectInit,
    'admin'
  );
  await advanceTimersAndPromises();

  // mock that the usb drive is removed while ejecting
  kiosk.getUsbDriveInfo.mockResolvedValue([]);

  await waitForStatusUpdate();
  expect(kiosk.unmountUsbDrive).toHaveBeenCalled();
  await waitForStatusUpdate();
  await advanceTimersAndPromises();
  // Updates to No USB state as expected
  await waitForUnmount();
  await waitForStatusUpdate();
  screen.getByText('No USB');

  expect(logger.log).toHaveBeenCalledTimes(5);
  expect(logger.log).toHaveBeenNthCalledWith(
    4,
    LogEventId.UsbDriveEjected,
    'admin',
    expect.objectContaining({ disposition: 'success' })
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    5,
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({
      previousStatus: 'ejecting',
      newStatus: 'absent',
    })
  );
});

test('usb drive gets mounted from undefined state', async () => {
  const { result } = renderHook(() => useUsbDrive({ logger }));
  expect(result.current.status).toBeUndefined();
  const kiosk = fakeKiosk();
  kiosk.getUsbDriveInfo.mockResolvedValue([]);
  window.kiosk = kiosk;
  kiosk.getUsbDriveInfo.mockResolvedValue([UNMOUNTED_DRIVE]);
  await waitForStatusUpdate();
  expect(kiosk.mountUsbDrive).toHaveBeenCalled();
  expect(result.current.status).toEqual(usbstick.UsbDriveStatus.present);

  // wait for it to mount
  kiosk.getUsbDriveInfo.mockResolvedValue([MOUNTED_DRIVE]);
  await waitForStatusUpdate();
  expect(result.current.status).toEqual(usbstick.UsbDriveStatus.mounted);
  expect(logger.log).toHaveBeenCalledTimes(5);
  expect(logger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({ previousStatus: undefined, newStatus: 'present' })
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.UsbDriveMountInit,
    'system'
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    4,
    LogEventId.UsbDriveMounted,
    'system',
    expect.objectContaining({ disposition: 'success' })
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    5,
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({ previousStatus: 'present', newStatus: 'mounted' })
  );
});

test('error in mounting gets logged as expected', async () => {
  const { result } = renderHook(() => useUsbDrive({ logger }));
  expect(result.current.status).toBeUndefined();
  const kiosk = fakeKiosk();
  kiosk.getUsbDriveInfo.mockResolvedValue([]);
  window.kiosk = kiosk;
  kiosk.mountUsbDrive.mockRejectedValueOnce(new Error('autumn leaves falling'));
  kiosk.getUsbDriveInfo.mockResolvedValue([UNMOUNTED_DRIVE]);
  await waitForStatusUpdate();
  expect(kiosk.mountUsbDrive).toHaveBeenCalled();
  expect(result.current.status).toEqual(usbstick.UsbDriveStatus.present);

  await waitForStatusUpdate();
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.UsbDriveMounted,
    'system',
    expect.objectContaining({
      disposition: 'failure',
      error: 'autumn leaves falling',
    })
  );
});

test('error in unmounting gets logged as expected', async () => {
  function ThisTestComponent() {
    const usbDrive = useUsbDrive({ logger });
    return (
      <UsbControllerButton
        usbDriveStatus={usbDrive.status ?? UsbDriveStatus.absent}
        usbDriveEject={() => usbDrive.eject('pollworker')}
      />
    );
  }
  render(<ThisTestComponent />);
  const kiosk = fakeKiosk();
  kiosk.getUsbDriveInfo.mockResolvedValue([]);
  window.kiosk = kiosk;
  kiosk.getUsbDriveInfo.mockResolvedValue([UNMOUNTED_DRIVE]);
  await waitForStatusUpdate();
  expect(kiosk.mountUsbDrive).toHaveBeenCalled();
  screen.getByText('Connecting…');

  // wait for it to mount
  kiosk.getUsbDriveInfo.mockResolvedValue([MOUNTED_DRIVE]);
  await waitForStatusUpdate();
  screen.getByText('Eject USB');
  kiosk.unmountUsbDrive.mockRejectedValue(new Error('like pieces into place'));
  userEvent.click(screen.getByText('Eject USB'));

  await advanceTimersAndPromises();
  await waitForStatusUpdate();

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.UsbDriveEjected,
    'pollworker',
    expect.objectContaining({
      disposition: 'failure',
      error: 'like pieces into place',
    })
  );
});
