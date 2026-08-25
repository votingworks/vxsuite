import { UsbDrive } from '@votingworks/usb-drive';
import { LogExportFormat, Logger, LogEventId } from '@votingworks/logging';
import { getLowDiskSpaceWarningMessage } from '@votingworks/utils';
import type { DiskSpaceSummary } from '@votingworks/utils';

import { GetAuthStatus } from './auth';
import { exportLogsToUsb } from './export_logs_to_usb';
import { reboot } from './reboot';
import { rebootToVendorMenu } from './reboot_to_vendor_menu';
import { powerDown } from './power_down';
import { setClock } from './set_clock';
import { getBatteryInfo } from './get_battery_info';
import { getAudioInfo } from './get_audio_info';
import { getDiskSpaceSummaries } from './disk_space_summaries';
import {
  getUsbPortStatus,
  toggleUsbPorts,
  UsbPortAction,
} from './usb_port_status';
import { getNodeEnv } from '../globals';

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
    getAudioInfo: async () => getAudioInfo({ logger, nodeEnv: getNodeEnv() }),
    getUsbPortStatus: async () =>
      getUsbPortStatus({ logger, nodeEnv: getNodeEnv() }),
    toggleUsbPorts: async (input: { action: UsbPortAction }) =>
      toggleUsbPorts({ action: input.action, logger, nodeEnv: getNodeEnv() }),
    getDiskSpaceSummary: async () => {
      const [{ total, used, available }] = await getDiskSpaceSummaries([
        workspacePath,
      ]);
      const diskSpaceSummary: DiskSpaceSummary = { total, used, available };
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
