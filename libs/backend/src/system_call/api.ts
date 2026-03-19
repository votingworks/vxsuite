import { UsbDrive } from '@votingworks/usb-drive';

import { LogExportFormat, Logger, LogEventId } from '@votingworks/logging';
import { getLowDiskSpaceWarningMessage } from '@votingworks/utils';
import { exportLogsToUsb } from './export_logs_to_usb.js';
import { rebootToVendorMenu } from './reboot_to_vendor_menu.js';
import { powerDown } from './power_down.js';
import { setClock } from './set_clock.js';
import { getBatteryInfo } from './get_battery_info.js';
import { getAudioInfo } from './get_audio_info.js';
import { getDiskSpaceSummary } from './get_disk_space_summary.js';
import { NODE_ENV } from '../scan_globals.js';
import {
  getUsbPortStatus,
  toggleUsbPorts,
  UsbPortAction,
} from './usb_port_status.js';

function buildApi({
  usbDrive,
  logger,
  machineId,
  codeVersion,
  workspacePath,
}: {
  usbDrive: UsbDrive;
  logger: Logger;
  machineId: string;
  codeVersion: string;
  workspacePath: string;
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
    getDiskSpaceSummary: async () => {
      const diskSpaceSummary = await getDiskSpaceSummary([workspacePath]);
      const warningMessage = getLowDiskSpaceWarningMessage(diskSpaceSummary);
      if (warningMessage) {
        void logger.logAsCurrentRole(LogEventId.LowDiskSpace, {
          message: warningMessage,
        });
      }
      return diskSpaceSummary;
    },
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
  workspacePath,
}: {
  usbDrive: UsbDrive;
  logger: Logger;
  machineId: string;
  codeVersion: string;
  workspacePath: string;
}): SystemCallApiMethods {
  return buildApi({ usbDrive, logger, machineId, codeVersion, workspacePath });
}
