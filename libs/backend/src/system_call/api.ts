import { UsbDrive } from '@votingworks/usb-drive';
import { LogExportFormat, Logger, LogEventId } from '@votingworks/logging';
import { getLowDiskSpaceWarningMessage } from '@votingworks/utils';

import { GetAuthStatus } from './auth';
import { exportLogsToUsb } from './export_logs_to_usb';
import { reboot } from './reboot';
import { rebootToVendorMenu } from './reboot_to_vendor_menu';
import { powerDown } from './power_down';
import { setClock } from './set_clock';
import { getBatteryInfo } from './get_battery_info';
import { getAudioInfo } from './get_audio_info';
import { getDiskSpaceSummary } from './get_disk_space_summary';
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
  workspacePath,
  getAuthStatus,
}: {
  usbDrive: UsbDrive;
  logger: Logger;
  machineId: string;
  codeVersion: string;
  workspacePath: string;
  getAuthStatus: GetAuthStatus;
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
    reboot: async () => reboot(logger),
    rebootToVendorMenu: async () =>
      rebootToVendorMenu({ getAuthStatus, logger }),
    powerDown: async () => powerDown(logger),
    setClock,
    getBatteryInfo: async () => getBatteryInfo({ logger }),
    getAudioInfo: async () => getAudioInfo({ logger, nodeEnv: NODE_ENV }),
    getUsbPortStatus: async () =>
      // @coverage-defer
      getUsbPortStatus({ logger, nodeEnv: NODE_ENV }),
    toggleUsbPorts: async (input: { action: UsbPortAction }) =>
      // @coverage-defer
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
  getAuthStatus,
}: {
  usbDrive: UsbDrive;
  logger: Logger;
  machineId: string;
  codeVersion: string;
  workspacePath: string;
  getAuthStatus: GetAuthStatus;
}): SystemCallApiMethods {
  return buildApi({
    usbDrive,
    logger,
    machineId,
    codeVersion,
    workspacePath,
    getAuthStatus,
  });
}
