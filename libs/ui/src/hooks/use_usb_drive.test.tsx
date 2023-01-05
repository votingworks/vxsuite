import { render, screen, waitFor } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react-hooks';
import userEvent from '@testing-library/user-event';
import { LogEventId, Logger, fakeLogger } from '@votingworks/logging';
import {
  advanceTimersAndPromises,
  fakeKiosk,
  fakeUsbDrive,
} from '@votingworks/test-utils';
import React from 'react';
import { UsbControllerButton } from '../usbcontroller_button';
import {
  MIN_TIME_TO_UNMOUNT_USB,
  POLLING_INTERVAL_FOR_USB,
  useUsbDrive,
} from './use_usb_drive';

const MOUNTED_DRIVE = fakeUsbDrive();
const UNMOUNTED_DRIVE = fakeUsbDrive({ mountPoint: undefined });

async function waitForStatusUpdate(): Promise<void> {
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_USB / 1000);
}

async function waitForUnmount(): Promise<void> {
  await advanceTimersAndPromises(MIN_TIME_TO_UNMOUNT_USB / 1000);
}

let logger: Logger;

beforeEach(() => {
  delete window.kiosk;
  jest.useFakeTimers('legacy');
  logger = fakeLogger();
});

test('returns absent if no kiosk', async () => {
  const { result } = renderHook(() => useUsbDrive({ logger }));
  await waitForStatusUpdate();
  expect(result.current.status).toEqual('absent');
});

test('full lifecycle with USBControllerButton', async () => {
  function ThisTestComponent() {
    const usbDrive = useUsbDrive({ logger });
    return (
      <UsbControllerButton
        usbDriveStatus={usbDrive.status}
        usbDriveEject={() => usbDrive.eject('admin')}
      />
    );
  }

  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
  window.kiosk = mockKiosk;

  // wait for initial status
  render(<ThisTestComponent />);
  await waitForStatusUpdate();
  screen.getByText('No USB');

  // plug in a USB drive
  mockKiosk.getUsbDriveInfo.mockResolvedValue([UNMOUNTED_DRIVE]);
  await screen.findByText('Connecting…');
  await screen.findByText('Eject USB');
  mockKiosk.getUsbDriveInfo.mockResolvedValue([MOUNTED_DRIVE]);

  expect(mockKiosk.mountUsbDrive).toHaveBeenCalled();
  expect(logger.log).toHaveBeenCalledTimes(3);
  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.UsbDriveDetected,
    'system',
    expect.objectContaining({
      message: 'Unmounted USB drive detected.',
    })
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.UsbDriveMountInit,
    'system'
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.UsbDriveMounted,
    'system',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // begin eject
  userEvent.click(screen.getByText('Eject USB'));
  await screen.findByText('Ejecting…');
  await waitForUnmount();
  await screen.findByText('Ejected');
  mockKiosk.getUsbDriveInfo.mockResolvedValue([UNMOUNTED_DRIVE]);
  expect(mockKiosk.unmountUsbDrive).toHaveBeenCalled();
  expect(logger.log).toHaveBeenCalledTimes(5);
  expect(logger.log).toHaveBeenNthCalledWith(
    4,
    LogEventId.UsbDriveEjectInit,
    'admin'
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    5,
    LogEventId.UsbDriveEjected,
    'admin',
    expect.objectContaining({ disposition: 'success' })
  );

  // remove the USB drive
  mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
  await waitForStatusUpdate();
  screen.getByText('No USB');
  expect(logger.log).toHaveBeenCalledTimes(6);
  expect(logger.log).toHaveBeenNthCalledWith(
    6,
    LogEventId.UsbDriveRemoved,
    'system',
    expect.objectContaining({
      previousStatus: 'ejected',
      message: 'USB drive removed by user.',
    })
  );
});

describe('removing USB in any unexpected states still resets to absent', () => {
  test('mounting', async () => {
    const mockKiosk = fakeKiosk();
    mockKiosk.getUsbDriveInfo.mockResolvedValue([UNMOUNTED_DRIVE]);
    window.kiosk = mockKiosk;

    const { result } = renderHook(() => useUsbDrive({ logger }));
    await waitFor(() => {
      expect(result.current.status).toEqual('mounting');
    });

    mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
    await waitFor(() => {
      expect(result.current.status).toEqual('absent');
    });
  });

  test('mounted', async () => {
    const mockKiosk = fakeKiosk();
    mockKiosk.getUsbDriveInfo.mockResolvedValue([MOUNTED_DRIVE]);
    window.kiosk = mockKiosk;

    const { result } = renderHook(() => useUsbDrive({ logger }));
    await waitFor(() => {
      expect(result.current.status).toEqual('mounted');
    });

    mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
    await waitFor(() => {
      expect(result.current.status).toEqual('absent');
    });
  });

  test('ejecting', async () => {
    const mockKiosk = fakeKiosk();
    mockKiosk.getUsbDriveInfo.mockResolvedValue([MOUNTED_DRIVE]);
    window.kiosk = mockKiosk;

    const { result } = renderHook(() => useUsbDrive({ logger }));
    await waitFor(() => {
      expect(result.current.status).toEqual('mounted');
    });

    await act(async () => {
      const ejectPromise = result.current.eject('pollworker');
      await waitFor(() => {
        expect(result.current.status).toEqual('ejecting');
      });
      mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
      await waitForUnmount();
      await ejectPromise;
    });

    await waitFor(() => {
      expect(result.current.status).toEqual('absent');
    });
  });
});

test('error in mounting gets logged as expected', async () => {
  const mockKiosk = fakeKiosk();
  mockKiosk.mountUsbDrive.mockRejectedValueOnce(
    new Error('autumn leaves falling')
  );
  mockKiosk.getUsbDriveInfo.mockResolvedValue([UNMOUNTED_DRIVE]);
  window.kiosk = mockKiosk;

  const { result } = renderHook(() => useUsbDrive({ logger }));
  await waitFor(() => {
    expect(mockKiosk.mountUsbDrive).toHaveBeenCalled();
  });
  expect(result.current.status).toEqual('mounting');

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

test('error in ejecting gets logged as expected', async () => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([MOUNTED_DRIVE]);
  mockKiosk.unmountUsbDrive.mockRejectedValue(
    new Error('like pieces into place')
  );
  window.kiosk = mockKiosk;

  const { result } = renderHook(() => useUsbDrive({ logger }));
  await waitFor(() => {
    expect(result.current.status).toEqual('mounted');
  });

  // When there is an already mounted USB drive, mount should not be called
  expect(mockKiosk.mountUsbDrive).not.toHaveBeenCalled();

  await act(async () => {
    const ejectPromise = result.current.eject('pollworker');
    await waitFor(() => {
      expect(result.current.status).toEqual('ejecting');
    });
    await ejectPromise;
  });

  expect(result.current.status).toEqual('mounted');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.UsbDriveEjected,
    'pollworker',
    expect.objectContaining({
      disposition: 'failure',
      error: 'like pieces into place',
    })
  );
});
