import { UsbDrive } from '@votingworks/usb-drive';

import { LogExportFormat, Logger } from '@votingworks/logging';
import { exportLogsToUsb } from './export_logs_to_usb';
import { rebootToVendorMenu } from './reboot_to_vendor_menu';
import { powerDown } from './power_down';
import { setClock } from './set_clock';
import { getBatteryInfo } from './get_battery_info';
import { getAudioInfo } from './get_audio_info';
import { NODE_ENV } from '../scan_globals';
import {
  getUsbPortStatus,
  toggleUsbPorts,
  UsbPortAction,
} from './usb_port_status';

function buildApi({
  usbDrive,
  logger,
  machineId,
  codeVersion,
}: {
  usbDrive: UsbDrive;
  logger: Logger;
  machineId: string;
  codeVersion: string;
}) {
  return {
    exportLogsToUsb: async (input: { format: LogExportFormat }) =>
      exportLogsToUsb({
        usbDrive,
        logger,
        format: input.format,
        machineId,
        codeVersion,
      }),
    rebootToVendorMenu: async () => rebootToVendorMenu(logger),
    powerDown: async () => powerDown(logger),
    setClock,
    getBatteryInfo: async () => getBatteryInfo({ logger }),
    getAudioInfo: async () => getAudioInfo({ logger, nodeEnv: NODE_ENV }),
    getUsbPortStatus: async () =>
      getUsbPortStatus({ logger, nodeEnv: NODE_ENV }),
    toggleUsbPorts: async (input: { action: UsbPortAction }) =>
      toggleUsbPorts({ action: input.action, logger, nodeEnv: NODE_ENV }),
  };
}

/** Grout API methods for system call functions */
export type SystemCallApiMethods = ReturnType<typeof buildApi>;

/** Creates a shareable implementation of {@link SystemCallApiMethods}. */
export function createSystemCallApi({
  usbDrive,
  logger,
  machineId,
  codeVersion,
}: {
  usbDrive: UsbDrive;
  logger: Logger;
  machineId: string;
  codeVersion: string;
}): SystemCallApiMethods {
  return buildApi({ usbDrive, logger, machineId, codeVersion });
}
