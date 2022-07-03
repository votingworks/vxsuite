import { act, renderHook } from '@testing-library/react-hooks';
import { LogEventId, fakeLogger } from '@votingworks/logging';
import { fakeMarkerInfo } from '@votingworks/test-utils';
import {
  AccessibleControllerProductId,
  AccessibleControllerVendorId,
  FujitsuFi7160ScannerProductId,
  FujitsuScannerVendorId,
  MemoryHardware,
  OmniKeyCardReaderDeviceName,
  OmniKeyCardReaderManufacturer,
  OmniKeyCardReaderProductId,
  OmniKeyCardReaderVendorId,
  PlustekScannerVendorId,
  PlustekVtm300ScannerProductId,
} from '@votingworks/utils';
import { BATTERY_POLLING_INTERVAL, Devices, useDevices } from './use_devices';
import * as features from '../config/features';

const emptyDevices: Devices = {
  printer: undefined,
  computer: {
    batteryLevel: undefined,
    batteryIsLow: false,
    batteryIsCharging: true,
  },
  cardReader: undefined,
  accessibleController: undefined,
  batchScanner: undefined,
  precinctScanner: undefined,
};

const expectedCardReader: Devices['cardReader'] = {
  deviceAddress: 0,
  deviceName: OmniKeyCardReaderDeviceName,
  locationId: 0,
  manufacturer: OmniKeyCardReaderManufacturer,
  productId: OmniKeyCardReaderProductId,
  serialNumber: '',
  vendorId: OmniKeyCardReaderVendorId,
};

test('can connect printer as expected', async () => {
  const hardware = new MemoryHardware();
  const logger = fakeLogger();
  const { result, rerender, waitForNextUpdate } = renderHook(() =>
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
  await waitForNextUpdate();
});

test('can connect card reader as expected', async () => {
  const hardware = new MemoryHardware();
  const logger = fakeLogger();
  const { result, rerender, waitForNextUpdate } = renderHook(() =>
    useDevices({ hardware, logger })
  );
  expect(result.current).toEqual(emptyDevices);
  expect(logger.log).toHaveBeenCalledTimes(0);

  act(() => hardware.setCardReaderConnected(true));
  rerender();
  expect(result.current.cardReader).toEqual(expectedCardReader);
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DeviceAttached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('New Card Reader'),
      productId: OmniKeyCardReaderProductId,
      vendorId: OmniKeyCardReaderVendorId,
    })
  );

  act(() => hardware.setCardReaderConnected(false));
  rerender();
  expect(result.current.cardReader).toBeUndefined();
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Card Reader'),
      productId: OmniKeyCardReaderProductId,
      vendorId: OmniKeyCardReaderVendorId,
    })
  );

  // Prevent `act` warning.
  await waitForNextUpdate();
});

test('can connect accessible controller as expected', async () => {
  const hardware = new MemoryHardware();
  const logger = fakeLogger();
  const { result, rerender, waitForNextUpdate } = renderHook(() =>
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
  await waitForNextUpdate();
});

test('can connect batch scanner as expected', async () => {
  const hardware = new MemoryHardware();
  const logger = fakeLogger();
  const { result, rerender, waitForNextUpdate } = renderHook(() =>
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
  await waitForNextUpdate();
});

test('can connect precinct scanner as expected', async () => {
  const plustekDevice: KioskBrowser.Device = {
    productId: PlustekVtm300ScannerProductId,
    vendorId: PlustekScannerVendorId,
    locationId: 0,
    deviceAddress: 0,
    deviceName: 'Sheetfed Scanner',
    serialNumber: '',
    manufacturer: 'Plustek',
  };
  const hardware = new MemoryHardware();
  const logger = fakeLogger();
  const { result, rerender, waitForNextUpdate } = renderHook(() =>
    useDevices({ hardware, logger })
  );
  expect(result.current).toEqual(emptyDevices);
  expect(logger.log).toHaveBeenCalledTimes(0);

  act(() => hardware.addDevice(plustekDevice));
  rerender();
  expect(result.current.precinctScanner).toEqual(plustekDevice);
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DeviceAttached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining(
        'New Precinct Scanner (Sheetfed Scanner)'
      ),
      productId: PlustekVtm300ScannerProductId,
      vendorId: PlustekScannerVendorId,
    })
  );

  act(() => hardware.removeDevice(plustekDevice));
  rerender();
  expect(result.current.batchScanner).toBeUndefined();
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Precinct Scanner (Sheetfed Scanner)'),
      productId: PlustekVtm300ScannerProductId,
      vendorId: PlustekScannerVendorId,
    })
  );

  // Prevent `act` warning.
  await waitForNextUpdate();
});

test('can handle logs for a random device as expected', async () => {
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
  const logger = fakeLogger();
  const { result, rerender, waitForNextUpdate } = renderHook(() =>
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
  await waitForNextUpdate();
});

test('periodically polls for computer battery status', async () => {
  jest.useFakeTimers();
  const hardware = new MemoryHardware();
  const logger = fakeLogger();
  const { result, waitForNextUpdate } = renderHook(() =>
    useDevices({ hardware, logger })
  );
  expect(result.current).toEqual(emptyDevices);

  await waitForNextUpdate();

  // Should immediately load the battery status
  expect(result.current.computer).toEqual({
    batteryIsCharging: true,
    batteryIsLow: false,
    batteryLevel: 0.8,
  });

  // Change the battery status to low
  act(() => hardware.setBatteryLevel(0.2));
  jest.advanceTimersByTime(BATTERY_POLLING_INTERVAL);
  await waitForNextUpdate();
  expect(result.current.computer).toEqual({
    batteryIsCharging: true,
    batteryIsLow: true,
    batteryLevel: 0.2,
  });

  // Disconnect the charger
  act(() => hardware.setBatteryDischarging(true));
  jest.advanceTimersByTime(BATTERY_POLLING_INTERVAL);
  await waitForNextUpdate();
  expect(result.current.computer).toEqual({
    batteryIsCharging: false,
    batteryIsLow: true,
    batteryLevel: 0.2,
  });
});

test('when card reader check is disabled, fake one returned even if no hardware detected.', async () => {
  const hardware = new MemoryHardware();
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  jest.spyOn(features, 'isCardReaderCheckDisabled').mockReturnValue(true);

  const { result, waitForNextUpdate } = renderHook(() =>
    useDevices({ hardware, logger: fakeLogger })
  );

  expect(result.current.cardReader).toEqual(expectedCardReader);

  // Prevent `act` warning.
  await waitForNextUpdate();
});
