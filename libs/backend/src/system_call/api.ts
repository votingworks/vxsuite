import * as grout from '@votingworks/grout';
import { UsbDrive } from '@votingworks/usb-drive';

import { LogExportFormat, Logger } from '@votingworks/logging';
import { exportLogsToUsb } from './export_logs_to_usb';
import { rebootToVendorMenu } from './reboot_to_vendor_menu';
import { powerDown } from './power_down';
import { setClock } from './set_clock';
import { getBatteryInfo } from './get_battery_info';
import { getAudioInfo } from './get_audio_info';

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
  return grout.createApi({
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
    getBatteryInfo,
    getAudioInfo: async () => getAudioInfo(logger),
  });
}

/** Grout API definition for system call functions */
export type SystemCallApi = ReturnType<typeof buildApi>;

/** Creates a shareable implementation of {@link SystemCallApi}. */
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
}): SystemCallApi {
  return buildApi({ usbDrive, logger, machineId, codeVersion });
}
