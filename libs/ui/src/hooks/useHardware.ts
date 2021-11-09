import { useEffect, useState } from 'react';
import {
  isCardReader,
  Hardware,
  isAccessibleController,
  isPlustekVTM300Scanner,
  isFujitsuScanner,
} from '@votingworks/utils';
import { map } from 'rxjs/operators';
import { LogEventId, Logger } from '@votingworks/logging';
import { usePrevious } from '..';

export interface UseHardwareProps {
  hardware: Hardware;
  logger: Logger;
}

export interface UseHardwareResult {
  hasCardReaderAttached: boolean;
  hasAccessibleControllerAttached: boolean;
  hasPrecinctScannerAttached: boolean;
  hasBatchScannerAttached: boolean;
  hasPrinterAttached: boolean;
}

function getDeviceName(device: KioskBrowser.Device) {
  if (isCardReader(device)) {
    return `Card Reader (${device.deviceName})`;
  }
  if (isAccessibleController(device)) {
    return `Accessible Controller (${device.deviceName})`;
  }
  if (isFujitsuScanner(device)) {
    return `Fujitsu Scanner (${device.deviceName})`;
  }
  if (isPlustekVTM300Scanner(device)) {
    return `Plustek Scanner (${device.deviceName})`;
  }
  return `Device (${device.deviceName})`;
}

export function useHardware({
  hardware,
  logger,
}: UseHardwareProps): UseHardwareResult {
  const [hasCardReaderAttached, setHasCardReaderAttached] = useState(false);
  const [
    hasAccessibleControllerAttached,
    setHasAccessibleControllerAttached,
  ] = useState(false);
  const [hasPlustekScannerAttached, setHasPlustekScannerAttached] = useState(
    false
  );
  const [hasFujitsuScannerAttached, setHasFujitsuScannerAttached] = useState(
    false
  );
  const [hasPrinterAttached, setHasPrinterAttached] = useState(false);
  const [allDevices, setAllDevices] = useState<KioskBrowser.Device[]>([]);
  const [allPrinters, setAllPrinters] = useState<KioskBrowser.PrinterInfo[]>(
    []
  );
  const previousDevices = usePrevious(allDevices);
  const previousPrinters = usePrevious(allPrinters);

  useEffect(() => {
    const hardwareStatusSubscription = hardware.devices
      .pipe(map((devices) => Array.from(devices)))
      .subscribe(async (devices) => {
        setHasCardReaderAttached(devices.some(isCardReader));
        setHasAccessibleControllerAttached(
          devices.some(isAccessibleController)
        );
        setHasPlustekScannerAttached(devices.some(isPlustekVTM300Scanner));
        setHasFujitsuScannerAttached(devices.some(isFujitsuScanner));
        setAllDevices(devices);
      });

    const printerStatusSubscription = hardware.printers
      .pipe(map((printers) => Array.from(printers)))
      .subscribe(async (printers) => {
        const newHasPrinterAttached = printers.some(
          ({ connected }) => connected
        );
        setHasPrinterAttached(newHasPrinterAttached);
        setAllPrinters(printers);
      });
    return () => {
      hardwareStatusSubscription.unsubscribe();
      printerStatusSubscription.unsubscribe();
    };
  }, [hardware]);

  // Handle logging of printers
  useEffect(() => {
    for (const newPrinter of allPrinters) {
      const previousCopyOfPrinter =
        previousPrinters &&
        previousPrinters.find((printer) => printer.name === newPrinter.name);
      if (!previousCopyOfPrinter) {
        void logger.log(LogEventId.PrinterConfigurationAdded, 'system', {
          message: `New printer configured: ${newPrinter.name} with connection status: ${newPrinter.connected}`,
          printer: newPrinter.name,
          connected: newPrinter.connected,
        });
      } else if (previousCopyOfPrinter.connected !== newPrinter.connected) {
        void logger.log(LogEventId.PrinterConnectionUpdate, 'system', {
          message: `Printer ${newPrinter.name} has been ${
            newPrinter.connected ? 'connected' : 'disconnected'
          }.`,
          printer: newPrinter.name,
          connected: newPrinter.connected,
        });
      }
    }
    for (const oldPrinter of previousPrinters || []) {
      const newCopyOfPrinter = allPrinters.find(
        (printer) => printer.name === oldPrinter.name
      );
      if (!newCopyOfPrinter) {
        void logger.log(LogEventId.PrinterConfigurationRemoved, 'system', {
          message: `Printer configuration removed: ${oldPrinter.name}}`,
          printer: oldPrinter.name,
        });
      }
    }
  }, [previousPrinters, allPrinters, logger]);

  // Handle logging of devices
  useEffect(() => {
    for (const newDevice of allDevices) {
      const previousCopyOfDevice =
        previousDevices &&
        previousDevices.find(
          (device) =>
            device.productId === newDevice.productId &&
            device.vendorId === newDevice.vendorId
        );
      if (!previousCopyOfDevice) {
        void logger.log(LogEventId.DeviceAttached, 'system', {
          message: `New ${getDeviceName(newDevice)} attached. Vendor: ${
            newDevice.vendorId
          } , Product: ${newDevice.productId}`,
          productId: newDevice.productId,
          vendorId: newDevice.vendorId,
          deviceName: newDevice.deviceName,
        });
      }
    }
    for (const oldDevice of previousDevices || []) {
      const newCopyOfDevice = allDevices.find(
        (device) =>
          device.productId === oldDevice.productId &&
          device.vendorId === oldDevice.vendorId
      );
      if (!newCopyOfDevice) {
        void logger.log(LogEventId.DeviceUnattached, 'system', {
          message: `${getDeviceName(oldDevice)} unattached. Vendor: ${
            oldDevice.vendorId
          } , Product: ${oldDevice.productId}`,
          productId: oldDevice.productId,
          vendorId: oldDevice.vendorId,
          deviceName: oldDevice.deviceName,
        });
      }
    }
  }, [previousDevices, allDevices, logger]);

  return {
    hasCardReaderAttached,
    hasAccessibleControllerAttached,
    hasBatchScannerAttached: hasFujitsuScannerAttached,
    hasPrecinctScannerAttached: hasPlustekScannerAttached,
    hasPrinterAttached,
  };
}
