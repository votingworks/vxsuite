import * as grout from '@votingworks/grout';
import { UsbDrive } from '@votingworks/usb-drive';

import { exportLogsToUsb } from './export_logs_to_usb';
import { reboot } from './reboot';
import { rebootToBios } from './reboot_to_bios';
import { powerDown } from './power_down';
import { setClock } from './set_clock';

function buildApi({
  usbDrive,
  machineId,
}: {
  usbDrive: UsbDrive;
  machineId: string;
}) {
  return grout.createApi({
    exportLogsToUsb: async () => exportLogsToUsb({ usbDrive, machineId }),
    reboot,
    rebootToBios,
    powerDown,
    setClock,
  });
}

/** Grout API definition for system call functions */
export type SystemCallApi = ReturnType<typeof buildApi>;

/** Creates a shareable implementation of {@link SystemCallApi}. */
export function createSystemCallApi({
  usbDrive,
  machineId,
}: {
  usbDrive: UsbDrive;
  machineId: string;
}): SystemCallApi {
  return buildApi({ usbDrive, machineId });
}
