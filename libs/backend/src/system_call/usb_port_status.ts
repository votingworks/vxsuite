/* eslint-disable vx/gts-jsdoc */
import { isIntegrationTest } from '@votingworks/utils';
import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec';
import { NODE_ENV } from '../scan_globals';

const SCRIPT_PATH = '/vx/code/app-scripts/set-usb-port-status.sh';

export interface UsbPortStatus {
  enabled: boolean;
}

export type UsbPortAction = 'disable' | 'enable';

const MOCK_DEV_USB_PORT_STATUS: UsbPortStatus = { enabled: true };

/**
 * Returns whether USB ports are enabled.
 *
 * See the underlying script in vxsuite-build-system for more details:
 * https://github.com/votingworks/vxsuite-build-system/blob/main/playbooks/trusted_build/files/set-usb-port-status.sh
 */
export async function getUsbPortStatus({
  logger,
  nodeEnv,
}: {
  logger: Logger;
  nodeEnv: typeof NODE_ENV;
}): Promise<UsbPortStatus> {
  let usbPortStatus: UsbPortStatus;
  if (nodeEnv !== 'production' || isIntegrationTest()) {
    usbPortStatus = MOCK_DEV_USB_PORT_STATUS;
  } else {
    // When called without args, the script returns status information
    const { stdout } = await execFile('sudo', [SCRIPT_PATH]);
    usbPortStatus = { enabled: stdout.includes('usb allowed') };
  }

  logger.log(LogEventId.UsbPortStatus, 'system', {
    message: `USB ports are ${usbPortStatus.enabled ? 'enabled' : 'disabled'}`,
  });
  return usbPortStatus;
}

/**
 * Enables or disables USB ports.
 *
 * See the underlying script in vxsuite-build-system for more details:
 * https://github.com/votingworks/vxsuite-build-system/blob/main/playbooks/trusted_build/files/set-usb-port-status.sh
 */
export async function toggleUsbPorts({
  action,
  logger,
  nodeEnv,
}: {
  action: UsbPortAction;
  logger: Logger;
  nodeEnv: typeof NODE_ENV;
}): Promise<void> {
  if (nodeEnv !== 'production' || isIntegrationTest()) {
    MOCK_DEV_USB_PORT_STATUS.enabled = action === 'enable';
  } else {
    const actionArgToScriptArg: Record<UsbPortAction, 'allow' | 'block'> = {
      disable: 'block',
      enable: 'allow',
    };
    await execFile('sudo', [SCRIPT_PATH, actionArgToScriptArg[action]]);
  }

  await logger.logAsCurrentRole(LogEventId.UsbPortsToggled, {
    message: `The user has ${action}d USB ports.`,
  });
}
