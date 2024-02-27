import { LogEventId, BaseLogger } from '@votingworks/logging';
import {
  Hardware,
  isAccessibleController,
  isBatchScanner,
  isPrecinctScanner,
} from '@votingworks/utils';
import { useEffect, useState } from 'react';
import useInterval from 'use-interval';
import { useCancelablePromise } from './use_cancelable_promise';
import { usePrevious } from './use_previous';

export const LOW_BATTERY_THRESHOLD = 0.25;
export const BATTERY_POLLING_INTERVAL = 3000;

export interface Props {
  hardware: Hardware;
  logger: BaseLogger;
}

export interface ComputerStatus {
  batteryLevel?: number;
  batteryIsLow: boolean;
  batteryIsCharging: boolean;
}

export interface Devices {
  computer: ComputerStatus;
  accessibleController?: KioskBrowser.Device;
  precinctScanner?: KioskBrowser.Device;
  batchScanner?: KioskBrowser.Device;
  printer?: KioskBrowser.PrinterInfo;
}

function getDeviceName(device: KioskBrowser.Device) {
  if (isAccessibleController(device)) {
    return `Accessible Controller (${device.deviceName})`;
  }
  if (isBatchScanner(device)) {
    return `Batch Scanner (${device.deviceName})`;
  }
  if (isPrecinctScanner(device)) {
    return `Precinct Scanner (${device.deviceName})`;
  }
  return `Device (${device.deviceName})`;
}

export function useDevices({ hardware, logger }: Props): Devices {
  const makeCancelable = useCancelablePromise();
  const [allDevices, setAllDevices] = useState<KioskBrowser.Device[]>([]);
  const [allPrinters, setAllPrinters] = useState<KioskBrowser.PrinterInfo[]>(
    []
  );
  const [battery, setBattery] = useState<
    KioskBrowser.BatteryInfo | undefined
  >();
  const previousDevices = usePrevious(allDevices);
  const previousPrinters = usePrevious(allPrinters);

  useEffect(() => {
    const unsubscribeDevices = hardware.devices.subscribe((devices) => {
      setAllDevices(Array.from(devices));
    });

    const unsubscribePrinters = hardware.printers.subscribe((devices) => {
      setAllPrinters(Array.from(devices));
    });

    return () => {
      unsubscribeDevices();
      unsubscribePrinters();
    };
  }, [hardware]);

  useInterval(
    async () => {
      setBattery(await makeCancelable(hardware.readBatteryStatus()));
    },
    BATTERY_POLLING_INTERVAL,
    true
  );

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

  const computer: ComputerStatus = {
    batteryLevel: battery?.level,
    batteryIsCharging: battery ? !battery.discharging : true,
    batteryIsLow: battery ? battery.level < LOW_BATTERY_THRESHOLD : false,
  };

  return {
    computer,
    accessibleController: allDevices.find(isAccessibleController),
    batchScanner: allDevices.find(isBatchScanner),
    precinctScanner: allDevices.find(isPrecinctScanner),
    printer: allPrinters.find((printer) => printer.connected),
  };
}
