import * as grout from '@votingworks/grout';
import { UsbDrive } from '@votingworks/usb-drive';

import { Logger } from '@votingworks/logging';
import { exportLogsToUsb } from './export_logs_to_usb';
import { reboot } from './reboot';
import { rebootToBios } from './reboot_to_bios';
import { powerDown } from './power_down';
import { setClock } from './set_clock';
import { getBatteryInfo } from './get_battery_info';
import { getAudioInfo } from './get_audio_info';

function buildApi({
  usbDrive,
  logger,
  machineId,
}: {
  usbDrive: UsbDrive;
  logger: Logger;
  machineId: string;
}) {
  return grout.createApi({
    exportLogsToUsb: async () =>
      exportLogsToUsb({ usbDrive, logger, machineId }),
    reboot,
    rebootToBios: async () => rebootToBios(logger),
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
}: {
  usbDrive: UsbDrive;
  logger: Logger;
  machineId: string;
}): SystemCallApi {
  return buildApi({ usbDrive, logger, machineId });
}
