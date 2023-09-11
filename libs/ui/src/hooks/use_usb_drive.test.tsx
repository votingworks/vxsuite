import userEvent from '@testing-library/user-event';
import { LogEventId, Logger, fakeLogger } from '@votingworks/logging';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { deferred } from '@votingworks/basics';
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '../../test/react_testing_library';
import { UsbControllerButton } from '../usbcontroller_button';
import {
  MIN_TIME_TO_UNMOUNT_USB,
  POLLING_INTERVAL_FOR_USB,
  useUsbDrive,
} from './use_usb_drive';

const MOUNTED_DRIVE = fakeUsbDrive();
const UNMOUNTED_DRIVE = fakeUsbDrive({ mountPoint: undefined });

function waitForStatusUpdate(): void {
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_USB);
}

function waitForUnmount(): void {
  jest.advanceTimersByTime(MIN_TIME_TO_UNMOUNT_USB);
}

let logger: Logger;

jest.useFakeTimers();

beforeEach(() => {
  delete window.kiosk;
  logger = fakeLogger();
});

test('returns absent if no kiosk', () => {
  const { result } = renderHook(() => useUsbDrive({ logger }));
  waitForStatusUpdate();
  expect(result.current.status).toEqual('absent');
});

test('full lifecycle with USBControllerButton', async () => {
  function ThisTestComponent() {
    const usbDrive = useUsbDrive({ logger });
    return (
      <UsbControllerButton
        usbDriveStatus={usbDrive.status}
        usbDriveEject={() => usbDrive.eject('election_manager')}
      />
    );
  }

  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
  const { promise: mountPromise, resolve: mountResolve } = deferred<void>();
  mockKiosk.mountUsbDrive.mockReturnValueOnce(mountPromise);
  window.kiosk = mockKiosk;

  // wait for initial status
  render(<ThisTestComponent />);
  waitForStatusUpdate();
  screen.getByText('No USB');

  // plug in a USB drive
  mockKiosk.getUsbDriveInfo.mockResolvedValue([UNMOUNTED_DRIVE]);
  await screen.findByText('Connecting…');
  mountResolve();
  await screen.findByText('Eject USB');
  mockKiosk.getUsbDriveInfo.mockResolvedValue([MOUNTED_DRIVE]);

  expect(mockKiosk.mountUsbDrive).toHaveBeenCalled();
  expect(logger.log).toHaveBeenCalledTimes(3);
  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.UsbDriveDetected,
    'system',
    expect.objectContaining({
      message: 'Unmounted USB drive detected with compatible file system.',
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
  const { promise: ejectPromise, resolve: ejectResolve } = deferred<void>();
  mockKiosk.unmountUsbDrive.mockReturnValueOnce(ejectPromise);
  userEvent.click(screen.getByText('Eject USB'));
  await screen.findByText('Ejecting…');
  ejectResolve();
  act(() => {
    waitForUnmount();
  });
  await screen.findByText('Ejected');
  mockKiosk.getUsbDriveInfo.mockResolvedValue([UNMOUNTED_DRIVE]);
  expect(mockKiosk.unmountUsbDrive).toHaveBeenCalled();
  expect(logger.log).toHaveBeenCalledTimes(5);
  expect(logger.log).toHaveBeenNthCalledWith(
    4,
    LogEventId.UsbDriveEjectInit,
    'election_manager'
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    5,
    LogEventId.UsbDriveEjected,
    'election_manager',
    expect.objectContaining({ disposition: 'success' })
  );

  // remove the USB drive
  mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
  waitForStatusUpdate();
  await screen.findByText('No USB');
  expect(logger.log).toHaveBeenCalledTimes(6);
  expect(logger.log).toHaveBeenNthCalledWith(
    6,
    LogEventId.UsbDriveRemoved,
    'system',
    expect.objectContaining({
      previousStatus: 'ejected',
    })
  );
});

describe('removing USB in any unexpected states still resets to absent', () => {
  test('mounting', async () => {
    const mockKiosk = fakeKiosk();
    mockKiosk.getUsbDriveInfo.mockResolvedValue([UNMOUNTED_DRIVE]);
    window.kiosk = mockKiosk;
    const { promise: mountPromise, resolve: mountResolve } = deferred<void>();
    mockKiosk.mountUsbDrive.mockReturnValueOnce(mountPromise);

    const { result } = renderHook(() => useUsbDrive({ logger }));
    await waitFor(() => {
      expect(result.current.status).toEqual('mounting');
    });

    mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
    mountResolve();
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
    const { promise: unmountPromise, resolve: unmountResolve } =
      deferred<void>();
    mockKiosk.unmountUsbDrive.mockReturnValueOnce(unmountPromise);
    const { result } = renderHook(() => useUsbDrive({ logger }));
    await waitFor(() => {
      expect(result.current.status).toEqual('mounted');
    });

    const ejectPromise = result.current.eject('poll_worker');
    await waitFor(() => {
      expect(result.current.status).toEqual('ejecting');
    });
    mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
    unmountResolve();
    waitForUnmount();
    await act(async () => {
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

  waitForStatusUpdate();
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
  const { promise: unmountPromise, reject: unmountReject } = deferred<void>();
  mockKiosk.unmountUsbDrive.mockReturnValueOnce(unmountPromise);
  window.kiosk = mockKiosk;

  const { result } = renderHook(() => useUsbDrive({ logger }));
  await waitFor(() => {
    expect(result.current.status).toEqual('mounted');
  });

  // When there is an already mounted USB drive, mount should not be called
  expect(mockKiosk.mountUsbDrive).not.toHaveBeenCalled();

  const ejectPromise = result.current.eject('poll_worker');
  await waitFor(() => {
    expect(result.current.status).toEqual('ejecting');
  });
  unmountReject('like pieces into place');
  await act(async () => {
    await ejectPromise;
  });

  await waitFor(() => {
    expect(result.current.status).toEqual('mounted');
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.UsbDriveEjected,
    'poll_worker',
    expect.objectContaining({
      disposition: 'failure',
    })
  );
});
