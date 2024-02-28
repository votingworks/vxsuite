import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { fakeMarkerInfo, mockOf } from '@votingworks/test-utils';
import {
  AccessibleControllerProductId,
  AccessibleControllerVendorId,
  CustomA4ScannerProductId,
  CustomScannerVendorId,
  FujitsuFi7160ScannerProductId,
  FujitsuScannerVendorId,
  isFeatureFlagEnabled,
  MemoryHardware,
} from '@votingworks/utils';
import { act, renderHook, waitFor } from '../../test/react_testing_library';
import { BATTERY_POLLING_INTERVAL, Devices, useDevices } from './use_devices';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

beforeEach(() => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => false);
});

const emptyDevices: Devices = {
  printer: undefined,
  computer: {
    batteryLevel: undefined,
    batteryIsLow: false,
    batteryIsCharging: true,
  },
  accessibleController: undefined,
  batchScanner: undefined,
  precinctScanner: undefined,
};

test('can connect printer as expected', () => {
  const hardware = new MemoryHardware();
  const logger = mockBaseLogger();
  const { result, rerender, unmount } = renderHook(() =>
    useDevices({ hardware, logger })
  );
  expect(result.current).toEqual(emptyDevices);
  expect(logger.log).toHaveBeenCalledTimes(0);

  const expectedPrinter: Devices['printer'] = {
    connected: true,
    description: 'Brother',
    isDefault: true,
    name: 'HL-L5100DN_series',
    state: 'idle',
    stateReasons: ['none'],
    markerInfos: [fakeMarkerInfo()],
  };

  act(() => hardware.setPrinterConnected(true));
  rerender();
  expect(result.current.printer).toEqual(expectedPrinter);
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.PrinterConfigurationAdded,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('New printer configured'),
      connected: true,
    })
  );

  act(() => hardware.setPrinterConnected(false));
  rerender();
  expect(result.current.printer).toBeUndefined();
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PrinterConnectionUpdate,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Printer'),
      connected: false,
    })
  );

  act(() => hardware.setPrinterConnected(true));
  rerender();
  expect(result.current.printer).toEqual(expectedPrinter);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PrinterConnectionUpdate,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Printer'),
      connected: true,
    })
  );

  act(() => hardware.detachAllPrinters());
  rerender();
  expect(result.current.printer).toBeUndefined();
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PrinterConfigurationRemoved,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Printer'),
    })
  );

  // Prevent `act` warning.
  unmount();
});

test('can connect accessible controller as expected', () => {
  const hardware = new MemoryHardware();
  const logger = mockBaseLogger();
  const { result, rerender, unmount } = renderHook(() =>
    useDevices({ hardware, logger })
  );
  expect(result.current).toEqual(emptyDevices);
  expect(logger.log).toHaveBeenCalledTimes(0);

  const expectedAccessibleController: Devices['accessibleController'] = {
    deviceAddress: 0,
    deviceName: 'USB Advanced Audio Device',
    locationId: 0,
    manufacturer: 'C-Media Electronics Inc.',
    productId: AccessibleControllerProductId,
    serialNumber: '',
    vendorId: AccessibleControllerVendorId,
  };

  act(() => hardware.setAccessibleControllerConnected(true));
  rerender();
  expect(result.current.accessibleController).toEqual(
    expectedAccessibleController
  );
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DeviceAttached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('New Accessible Controller'),
      productId: AccessibleControllerProductId,
      vendorId: AccessibleControllerVendorId,
    })
  );

  act(() => hardware.setAccessibleControllerConnected(false));
  rerender();
  expect(result.current.accessibleController).toBeUndefined();
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Accessible Controller'),
      productId: AccessibleControllerProductId,
      vendorId: AccessibleControllerVendorId,
    })
  );

  // Prevent `act` warning.
  unmount();
});

test('can connect batch scanner as expected', () => {
  const hardware = new MemoryHardware();
  const logger = mockBaseLogger();
  const { result, rerender, unmount } = renderHook(() =>
    useDevices({ hardware, logger })
  );
  expect(result.current).toEqual(emptyDevices);
  expect(logger.log).toHaveBeenCalledTimes(0);

  const expectedBatchScanner: Devices['batchScanner'] = {
    deviceAddress: 0,
    deviceName: 'Scanner',
    locationId: 0,
    manufacturer: 'Fujitsu',
    productId: FujitsuFi7160ScannerProductId,
    serialNumber: '',
    vendorId: FujitsuScannerVendorId,
  };

  act(() => hardware.setBatchScannerConnected(true));
  rerender();
  expect(result.current.batchScanner).toEqual(expectedBatchScanner);
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DeviceAttached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('New Batch Scanner (Scanner)'),
      productId: FujitsuFi7160ScannerProductId,
      vendorId: FujitsuScannerVendorId,
    })
  );

  act(() => hardware.setBatchScannerConnected(false));
  rerender();
  expect(result.current.batchScanner).toBeUndefined();
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Batch Scanner (Scanner)'),
      productId: FujitsuFi7160ScannerProductId,
      vendorId: FujitsuScannerVendorId,
    })
  );

  // Prevent `act` warning.
  unmount();
});

test('can connect precinct scanner as expected', () => {
  const customDevice: KioskBrowser.Device = {
    productId: CustomA4ScannerProductId,
    vendorId: CustomScannerVendorId,
    locationId: 0,
    deviceAddress: 0,
    deviceName: 'Sheetfed Scanner',
    serialNumber: '',
    manufacturer: 'Custom',
  };
  const hardware = new MemoryHardware();
  const logger = mockBaseLogger();
  const { result, rerender, unmount } = renderHook(() =>
    useDevices({ hardware, logger })
  );
  expect(result.current).toEqual(emptyDevices);
  expect(logger.log).toHaveBeenCalledTimes(0);

  act(() => hardware.addDevice(customDevice));
  rerender();
  expect(result.current.precinctScanner).toEqual(customDevice);
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DeviceAttached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining(
        'New Precinct Scanner (Sheetfed Scanner)'
      ),
      productId: CustomA4ScannerProductId,
      vendorId: CustomScannerVendorId,
    })
  );

  act(() => hardware.removeDevice(customDevice));
  rerender();
  expect(result.current.batchScanner).toBeUndefined();
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Precinct Scanner (Sheetfed Scanner)'),
      productId: CustomA4ScannerProductId,
      vendorId: CustomScannerVendorId,
    })
  );

  // Prevent `act` warning.
  unmount();
});

test('can handle logs for a random device as expected', () => {
  const randomDevice: KioskBrowser.Device = {
    productId: 1234,
    vendorId: 5678,
    locationId: 0,
    deviceAddress: 0,
    deviceName: 'Giraffe',
    serialNumber: '',
    manufacturer: '',
  };
  const hardware = new MemoryHardware();
  const logger = mockBaseLogger();
  const { result, rerender, unmount } = renderHook(() =>
    useDevices({ hardware, logger })
  );
  expect(logger.log).toHaveBeenCalledTimes(0);

  act(() => hardware.addDevice(randomDevice));
  rerender();
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DeviceAttached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('New Device (Giraffe)'),
      productId: 1234,
      vendorId: 5678,
    })
  );
  expect(result.current).toEqual(emptyDevices);

  act(() => hardware.removeDevice(randomDevice));
  rerender();
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Device (Giraffe)'),
      productId: 1234,
      vendorId: 5678,
    })
  );

  // Prevent `act` warning.
  unmount();
});

test('periodically polls for computer battery status', async () => {
  jest.useFakeTimers();
  const hardware = new MemoryHardware();
  const logger = mockBaseLogger();
  const { result, unmount } = renderHook(() =>
    useDevices({ hardware, logger })
  );
  expect(result.current).toEqual(emptyDevices);

  // Should immediately load the battery status
  await waitFor(() => {
    expect(result.current.computer).toEqual({
      batteryIsCharging: true,
      batteryIsLow: false,
      batteryLevel: 0.8,
    });
  });

  // Change the battery status to low
  act(() => hardware.setBatteryLevel(0.2));
  jest.advanceTimersByTime(BATTERY_POLLING_INTERVAL);
  await waitFor(() => {
    expect(result.current.computer).toEqual({
      batteryIsCharging: true,
      batteryIsLow: true,
      batteryLevel: 0.2,
    });
  });

  // Disconnect the charger
  act(() => hardware.setBatteryDischarging(true));
  jest.advanceTimersByTime(BATTERY_POLLING_INTERVAL);
  await waitFor(() => {
    expect(result.current.computer).toEqual({
      batteryIsCharging: false,
      batteryIsLow: true,
      batteryLevel: 0.2,
    });
  });

  unmount();
});
