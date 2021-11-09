import { act, renderHook } from '@testing-library/react-hooks';
import { Logger, LogSource, LogEventId } from '@votingworks/logging';
import {
  AccessibleControllerProductId,
  AccessibleControllerVendorId,
  FujitsuFi7160ScannerProductId,
  FujitsuScannerVendorId,
  MemoryHardware,
  OmniKeyCardReaderProductId,
  OmniKeyCardReaderVendorId,
  PlustekScannerVendorId,
  PlustekVTM300ScannerProductId,
} from '@votingworks/utils';
import { useHardware } from './useHardware';

test('can connect printer as expected', async () => {
  const hardware = new MemoryHardware();
  const fakeLogger = new Logger(LogSource.VxBatchScanApp);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useHardware({ hardware, logger: fakeLogger })
  );
  expect(result.current.hasPrinterAttached).toBe(false);
  expect(logSpy).toHaveBeenCalledTimes(0);

  await act(async () => await hardware.setPrinterConnected(true));
  rerender();
  expect(result.current.hasPrinterAttached).toBe(true);
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
  expect(result.current.hasCardReaderAttached).toBe(false);
  expect(result.current.hasBatchScannerAttached).toBe(false);
  expect(result.current.hasPrecinctScannerAttached).toBe(false);
  expect(result.current.hasAccessibleControllerAttached).toBe(false);

  await act(async () => await hardware.setPrinterConnected(false));
  rerender();
  expect(result.current.hasPrinterAttached).toBe(false);
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
  expect(result.current.hasPrinterAttached).toBe(true);
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
  expect(result.current.hasPrinterAttached).toBe(false);
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
  const fakeLogger = new Logger(LogSource.VxBatchScanApp);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useHardware({ hardware, logger: fakeLogger })
  );
  expect(result.current.hasCardReaderAttached).toBe(false);
  expect(logSpy).toHaveBeenCalledTimes(0);

  await act(async () => await hardware.setCardReaderConnected(true));
  rerender();
  expect(result.current.hasCardReaderAttached).toBe(true);
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
  expect(result.current.hasAccessibleControllerAttached).toBe(false);
  expect(result.current.hasBatchScannerAttached).toBe(false);
  expect(result.current.hasPrecinctScannerAttached).toBe(false);
  expect(result.current.hasPrinterAttached).toBe(false);

  await act(async () => await hardware.setCardReaderConnected(false));
  rerender();
  expect(result.current.hasCardReaderAttached).toBe(false);
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
  const fakeLogger = new Logger(LogSource.VxBatchScanApp);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useHardware({ hardware, logger: fakeLogger })
  );
  expect(result.current.hasAccessibleControllerAttached).toBe(false);
  expect(logSpy).toHaveBeenCalledTimes(0);

  await act(async () => await hardware.setAccessibleControllerConnected(true));
  rerender();
  expect(result.current.hasAccessibleControllerAttached).toBe(true);
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
  expect(result.current.hasCardReaderAttached).toBe(false);
  expect(result.current.hasBatchScannerAttached).toBe(false);
  expect(result.current.hasPrecinctScannerAttached).toBe(false);
  expect(result.current.hasPrinterAttached).toBe(false);

  await act(async () => await hardware.setAccessibleControllerConnected(false));
  rerender();
  expect(result.current.hasAccessibleControllerAttached).toBe(false);
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

test('can connect fujitsu scanner as expected', async () => {
  const hardware = new MemoryHardware();
  const fakeLogger = new Logger(LogSource.VxBatchScanApp);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useHardware({ hardware, logger: fakeLogger })
  );
  expect(result.current.hasBatchScannerAttached).toBe(false);
  expect(logSpy).toHaveBeenCalledTimes(0);

  await act(async () => await hardware.setBatchScannerConnected(true));
  rerender();
  expect(result.current.hasBatchScannerAttached).toBe(true);
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.DeviceAttached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('New Fujitsu Scanner (Scanner)'),
      productId: FujitsuFi7160ScannerProductId,
      vendorId: FujitsuScannerVendorId,
    })
  );
  expect(result.current.hasCardReaderAttached).toBe(false);
  expect(result.current.hasAccessibleControllerAttached).toBe(false);
  expect(result.current.hasPrecinctScannerAttached).toBe(false);
  expect(result.current.hasPrinterAttached).toBe(false);

  await act(async () => await hardware.setBatchScannerConnected(false));
  rerender();
  expect(result.current.hasBatchScannerAttached).toBe(false);
  expect(logSpy).toHaveBeenCalledTimes(2);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Fujitsu Scanner (Scanner)'),
      productId: FujitsuFi7160ScannerProductId,
      vendorId: FujitsuScannerVendorId,
    })
  );
});

test('can connect plustek scanner as expected', async () => {
  const plustekDevice: KioskBrowser.Device = {
    productId: PlustekVTM300ScannerProductId,
    vendorId: PlustekScannerVendorId,
    locationId: 0,
    deviceAddress: 0,
    deviceName: 'Sheetfed Scanner',
    serialNumber: '',
    manufacturer: 'Plustek',
  };
  const hardware = new MemoryHardware();
  const fakeLogger = new Logger(LogSource.VxBatchScanApp);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useHardware({ hardware, logger: fakeLogger })
  );
  expect(result.current.hasPrecinctScannerAttached).toBe(false);
  expect(logSpy).toHaveBeenCalledTimes(0);

  act(() => hardware.addDevice(plustekDevice));
  rerender();
  expect(result.current.hasPrecinctScannerAttached).toBe(true);
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.DeviceAttached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining(
        'New Plustek Scanner (Sheetfed Scanner)'
      ),
      productId: PlustekVTM300ScannerProductId,
      vendorId: PlustekScannerVendorId,
    })
  );
  expect(result.current.hasCardReaderAttached).toBe(false);
  expect(result.current.hasAccessibleControllerAttached).toBe(false);
  expect(result.current.hasBatchScannerAttached).toBe(false);
  expect(result.current.hasPrinterAttached).toBe(false);

  await act(async () => await hardware.removeDevice(plustekDevice));
  rerender();
  expect(result.current.hasBatchScannerAttached).toBe(false);
  expect(logSpy).toHaveBeenCalledTimes(2);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Plustek Scanner (Sheetfed Scanner)'),
      productId: PlustekVTM300ScannerProductId,
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
  const fakeLogger = new Logger(LogSource.VxBatchScanApp);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useHardware({ hardware, logger: fakeLogger })
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
  expect(result.current.hasCardReaderAttached).toBe(false);
  expect(result.current.hasAccessibleControllerAttached).toBe(false);
  expect(result.current.hasBatchScannerAttached).toBe(false);
  expect(result.current.hasPrecinctScannerAttached).toBe(false);
  expect(result.current.hasPrinterAttached).toBe(false);

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
