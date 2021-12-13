import { render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import userEvent from '@testing-library/user-event';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
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

async function waitForIoFlush(): Promise<void> {
  await advanceTimersAndPromises(usbstick.FLUSH_IO_DELAY_MS / 1000);
}

const fakeLogger = new Logger(LogSource.VxAdminFrontend);
let logSpy: jest.SpyInstance;

beforeEach(() => {
  delete window.kiosk;
  jest.useFakeTimers('legacy');
  logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
});

test('returns undefined status at first', async () => {
  const { result } = renderHook(() => useUsbDrive({ logger: fakeLogger }));
  expect(result.current.status).toBeUndefined();

  await waitForStatusUpdate();
});

test('returns notavailable if no kiosk', async () => {
  const { result } = renderHook(() => useUsbDrive({ logger: fakeLogger }));
  await waitForStatusUpdate();
  expect(result.current.status).toEqual(usbstick.UsbDriveStatus.notavailable);
  expect(logSpy).toHaveBeenCalled();
  expect(logSpy).toHaveBeenLastCalledWith(
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
  kiosk.getUsbDrives.mockResolvedValue([MOUNTED_DRIVE]);
  window.kiosk = kiosk;

  const { result } = renderHook(() => useUsbDrive({ logger: fakeLogger }));
  await waitForStatusUpdate();
  expect(result.current.status).toEqual(usbstick.UsbDriveStatus.mounted);
  expect(logSpy).toHaveBeenCalled();
  expect(logSpy).toHaveBeenLastCalledWith(
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
    const usbDrive = useUsbDrive({ logger: fakeLogger });
    return (
      <UsbControllerButton
        usbDriveStatus={usbDrive.status ?? UsbDriveStatus.absent}
        usbDriveEject={() => usbDrive.eject('admin')}
      />
    );
  }

  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([]);
  window.kiosk = kiosk;

  // wait for initial status
  render(<ThisTestComponent />);
  await waitForStatusUpdate();
  screen.getByText('No USB');
  expect(logSpy).toHaveBeenCalledTimes(2);
  expect(logSpy).toHaveBeenLastCalledWith(
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
  kiosk.getUsbDrives.mockResolvedValue([UNMOUNTED_DRIVE]);
  await waitForStatusUpdate();
  expect(kiosk.mountUsbDrive).toHaveBeenCalled();
  screen.getByText('Connecting…');
  expect(logSpy).toHaveBeenCalledTimes(5);
  expect(logSpy).toHaveBeenNthCalledWith(
    3,
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({
      previousStatus: 'absent',
      newStatus: 'present',
    })
  );
  expect(logSpy).toHaveBeenNthCalledWith(
    4,
    LogEventId.UsbDriveMountInit,
    'system'
  );
  expect(logSpy).toHaveBeenNthCalledWith(
    5,
    LogEventId.UsbDriveMounted,
    'system',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // wait for it to mount
  kiosk.getUsbDrives.mockResolvedValue([MOUNTED_DRIVE]);
  await waitForStatusUpdate();
  screen.getByText('Eject USB');
  expect(logSpy).toHaveBeenCalledTimes(6);
  expect(logSpy).toHaveBeenNthCalledWith(
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
  expect(logSpy).toHaveBeenCalledTimes(7);
  expect(logSpy).toHaveBeenNthCalledWith(
    7,
    LogEventId.UsbDriveEjectInit,
    'admin'
  );
  await advanceTimersAndPromises();

  // ejecting unmounts but does not remove USB drives
  kiosk.getUsbDrives.mockResolvedValue([UNMOUNTED_DRIVE]);
  screen.getByText('Ejecting…');

  await waitForStatusUpdate();
  expect(kiosk.unmountUsbDrive).toHaveBeenCalled();
  await waitForStatusUpdate();
  await advanceTimersAndPromises();
  await waitForIoFlush();

  await waitForStatusUpdate();
  screen.getByText('Ejected');
  expect(logSpy).toHaveBeenCalledTimes(9);
  expect(logSpy).toHaveBeenNthCalledWith(
    8,
    LogEventId.UsbDriveEjected,
    'admin',
    expect.objectContaining({ disposition: 'success' })
  );
  expect(logSpy).toHaveBeenNthCalledWith(
    9,
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({
      previousStatus: 'ejecting',
      newStatus: 'present',
    })
  );

  // remove the USB drive
  kiosk.getUsbDrives.mockResolvedValue([]);
  await waitForStatusUpdate();
  screen.getByText('No USB');
  expect(logSpy).toHaveBeenCalledTimes(10);
  expect(logSpy).toHaveBeenNthCalledWith(
    10,
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({
      previousStatus: 'present',
      newStatus: 'absent',
    })
  );
});

test('usb drive gets mounted from undefined state', async () => {
  const { result } = renderHook(() => useUsbDrive({ logger: fakeLogger }));
  expect(result.current.status).toBeUndefined();
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([]);
  window.kiosk = kiosk;
  kiosk.getUsbDrives.mockResolvedValue([UNMOUNTED_DRIVE]);
  await waitForStatusUpdate();
  expect(kiosk.mountUsbDrive).toHaveBeenCalled();
  expect(result.current.status).toEqual(usbstick.UsbDriveStatus.present);

  // wait for it to mount
  kiosk.getUsbDrives.mockResolvedValue([MOUNTED_DRIVE]);
  await waitForStatusUpdate();
  expect(result.current.status).toEqual(usbstick.UsbDriveStatus.mounted);
  expect(logSpy).toHaveBeenCalledTimes(5);
  expect(logSpy).toHaveBeenNthCalledWith(
    2,
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({ previousStatus: undefined, newStatus: 'present' })
  );
  expect(logSpy).toHaveBeenNthCalledWith(
    3,
    LogEventId.UsbDriveMountInit,
    'system'
  );
  expect(logSpy).toHaveBeenNthCalledWith(
    4,
    LogEventId.UsbDriveMounted,
    'system',
    expect.objectContaining({ disposition: 'success' })
  );
  expect(logSpy).toHaveBeenNthCalledWith(
    5,
    LogEventId.UsbDriveStatusUpdate,
    'system',
    expect.objectContaining({ previousStatus: 'present', newStatus: 'mounted' })
  );
});

test('error in mounting gets logged as expected', async () => {
  const { result } = renderHook(() => useUsbDrive({ logger: fakeLogger }));
  expect(result.current.status).toBeUndefined();
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([]);
  window.kiosk = kiosk;
  kiosk.mountUsbDrive.mockRejectedValueOnce({
    message: 'autumn leaves falling',
  });
  kiosk.getUsbDrives.mockResolvedValue([UNMOUNTED_DRIVE]);
  await waitForStatusUpdate();
  expect(kiosk.mountUsbDrive).toHaveBeenCalled();
  expect(result.current.status).toEqual(usbstick.UsbDriveStatus.present);

  await waitForStatusUpdate();
  expect(logSpy).toHaveBeenCalledWith(
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
    const usbDrive = useUsbDrive({ logger: fakeLogger });
    return (
      <UsbControllerButton
        usbDriveStatus={usbDrive.status ?? UsbDriveStatus.absent}
        usbDriveEject={() => usbDrive.eject('pollworker')}
      />
    );
  }
  render(<ThisTestComponent />);
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([]);
  window.kiosk = kiosk;
  kiosk.getUsbDrives.mockResolvedValue([UNMOUNTED_DRIVE]);
  await waitForStatusUpdate();
  expect(kiosk.mountUsbDrive).toHaveBeenCalled();
  screen.getByText('Connecting…');

  // wait for it to mount
  kiosk.getUsbDrives.mockResolvedValue([MOUNTED_DRIVE]);
  await waitForStatusUpdate();
  screen.getByText('Eject USB');
  kiosk.unmountUsbDrive.mockRejectedValue({
    message: 'like pieces into place',
  });
  userEvent.click(screen.getByText('Eject USB'));

  await advanceTimersAndPromises();
  await waitForStatusUpdate();

  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.UsbDriveEjected,
    'pollworker',
    expect.objectContaining({
      disposition: 'failure',
      error: 'like pieces into place',
    })
  );
});
