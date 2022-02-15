import { act, renderHook } from '@testing-library/react-hooks';
import { Logger, LogSource, LogEventId } from '@votingworks/logging';
import { advanceTimers } from '@votingworks/test-utils';
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

test('can connect printer as expected', async () => {
  const hardware = new MemoryHardware();
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useDevices({ hardware, logger: fakeLogger })
  );
  expect(result.current).toEqual(emptyDevices);
  expect(logSpy).toHaveBeenCalledTimes(0);

  const expectedPrinter: Devices['printer'] = {
    connected: true,
    description: 'Brother',
    isDefault: true,
    name: 'HL-L5100DN_series',
    status: 0,
  };

  await act(async () => await hardware.setPrinterConnected(true));
  rerender();
  expect(result.current.printer).toEqual(expectedPrinter);
  expect(logSpy).toHaveBeenCalledTimes(2);
  expect(logSpy).toHaveBeenNthCalledWith(
    1,
    LogEventId.PrinterConfigurationAdded,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('New printer configured'),
      connected: true,
    })
  );

  await act(async () => await hardware.setPrinterConnected(false));
  rerender();
  expect(result.current.printer).toBeUndefined();
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.PrinterConnectionUpdate,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Printer'),
      connected: false,
    })
  );

  await act(async () => await hardware.setPrinterConnected(true));
  rerender();
  expect(result.current.printer).toEqual(expectedPrinter);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.PrinterConnectionUpdate,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Printer'),
      connected: true,
    })
  );

  await act(async () => await hardware.detachAllPrinters());
  rerender();
  expect(result.current.printer).toBeUndefined();
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.PrinterConfigurationRemoved,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Printer'),
    })
  );
});

test('can connect card reader as expected', async () => {
  const hardware = new MemoryHardware();
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useDevices({ hardware, logger: fakeLogger })
  );
  expect(result.current).toEqual(emptyDevices);
  expect(logSpy).toHaveBeenCalledTimes(0);

  const expectedCardReader: Devices['cardReader'] = {
    deviceAddress: 0,
    deviceName: OmniKeyCardReaderDeviceName,
    locationId: 0,
    manufacturer: OmniKeyCardReaderManufacturer,
    productId: OmniKeyCardReaderProductId,
    serialNumber: '',
    vendorId: OmniKeyCardReaderVendorId,
  };

  await act(async () => await hardware.setCardReaderConnected(true));
  rerender();
  expect(result.current.cardReader).toEqual(expectedCardReader);
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.DeviceAttached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('New Card Reader'),
      productId: OmniKeyCardReaderProductId,
      vendorId: OmniKeyCardReaderVendorId,
    })
  );

  await act(async () => await hardware.setCardReaderConnected(false));
  rerender();
  expect(result.current.cardReader).toBeUndefined();
  expect(logSpy).toHaveBeenCalledTimes(2);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Card Reader'),
      productId: OmniKeyCardReaderProductId,
      vendorId: OmniKeyCardReaderVendorId,
    })
  );
});

test('can connect accessible controller as expected', async () => {
  const hardware = new MemoryHardware();
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useDevices({ hardware, logger: fakeLogger })
  );
  expect(result.current).toEqual(emptyDevices);
  expect(logSpy).toHaveBeenCalledTimes(0);

  const expectedAccessibleController: Devices['accessibleController'] = {
    deviceAddress: 0,
    deviceName: 'USB Advanced Audio Device',
    locationId: 0,
    manufacturer: 'C-Media Electronics Inc.',
    productId: AccessibleControllerProductId,
    serialNumber: '',
    vendorId: AccessibleControllerVendorId,
  };

  await act(async () => await hardware.setAccessibleControllerConnected(true));
  rerender();
  expect(result.current.accessibleController).toEqual(
    expectedAccessibleController
  );
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.DeviceAttached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('New Accessible Controller'),
      productId: AccessibleControllerProductId,
      vendorId: AccessibleControllerVendorId,
    })
  );

  await act(async () => await hardware.setAccessibleControllerConnected(false));
  rerender();
  expect(result.current.accessibleController).toBeUndefined();
  expect(logSpy).toHaveBeenCalledTimes(2);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Accessible Controller'),
      productId: AccessibleControllerProductId,
      vendorId: AccessibleControllerVendorId,
    })
  );
});

test('can connect batch scanner as expected', async () => {
  const hardware = new MemoryHardware();
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useDevices({ hardware, logger: fakeLogger })
  );
  expect(result.current).toEqual(emptyDevices);
  expect(logSpy).toHaveBeenCalledTimes(0);

  const expectedBatchScanner: Devices['batchScanner'] = {
    deviceAddress: 0,
    deviceName: 'Scanner',
    locationId: 0,
    manufacturer: 'Fujitsu',
    productId: FujitsuFi7160ScannerProductId,
    serialNumber: '',
    vendorId: FujitsuScannerVendorId,
  };

  await act(async () => await hardware.setBatchScannerConnected(true));
  rerender();
  expect(result.current.batchScanner).toEqual(expectedBatchScanner);
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.DeviceAttached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('New Batch Scanner (Scanner)'),
      productId: FujitsuFi7160ScannerProductId,
      vendorId: FujitsuScannerVendorId,
    })
  );

  await act(async () => await hardware.setBatchScannerConnected(false));
  rerender();
  expect(result.current.batchScanner).toBeUndefined();
  expect(logSpy).toHaveBeenCalledTimes(2);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Batch Scanner (Scanner)'),
      productId: FujitsuFi7160ScannerProductId,
      vendorId: FujitsuScannerVendorId,
    })
  );
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
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useDevices({ hardware, logger: fakeLogger })
  );
  expect(result.current).toEqual(emptyDevices);
  expect(logSpy).toHaveBeenCalledTimes(0);

  act(() => hardware.addDevice(plustekDevice));
  rerender();
  expect(result.current.precinctScanner).toEqual(plustekDevice);
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
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

  await act(async () => await hardware.removeDevice(plustekDevice));
  rerender();
  expect(result.current.batchScanner).toBeUndefined();
  expect(logSpy).toHaveBeenCalledTimes(2);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Precinct Scanner (Sheetfed Scanner)'),
      productId: PlustekVtm300ScannerProductId,
      vendorId: PlustekScannerVendorId,
    })
  );
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
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useDevices({ hardware, logger: fakeLogger })
  );
  expect(logSpy).toHaveBeenCalledTimes(0);

  act(() => hardware.addDevice(randomDevice));
  rerender();
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.DeviceAttached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('New Device (Giraffe)'),
      productId: 1234,
      vendorId: 5678,
    })
  );
  expect(result.current).toEqual(emptyDevices);

  await act(async () => await hardware.removeDevice(randomDevice));
  rerender();
  expect(logSpy).toHaveBeenCalledTimes(2);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Device (Giraffe)'),
      productId: 1234,
      vendorId: 5678,
    })
  );
});

test('periodically polls for computer battery status', async () => {
  jest.useFakeTimers();
  const hardware = new MemoryHardware();
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const { result, waitForNextUpdate } = renderHook(() =>
    useDevices({ hardware, logger: fakeLogger })
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
  await act(async () => await hardware.setBatteryLevel(0.2));
  advanceTimers(BATTERY_POLLING_INTERVAL / 1000);
  await waitForNextUpdate();
  expect(result.current.computer).toEqual({
    batteryIsCharging: true,
    batteryIsLow: true,
    batteryLevel: 0.2,
  });

  // Disconnect the charger
  await act(async () => await hardware.setBatteryDischarging(true));
  advanceTimers(BATTERY_POLLING_INTERVAL / 1000);
  await waitForNextUpdate();
  expect(result.current.computer).toEqual({
    batteryIsCharging: false,
    batteryIsLow: true,
    batteryLevel: 0.2,
  });
});
