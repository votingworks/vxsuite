import { readFile } from 'fs/promises';

const VIRTUAL_DEVICE_NAME = 'Accessible Controller Daemon Virtual Device';

export async function isAccessibleControllerDaemonRunning(): Promise<boolean> {
  return (await readFile('/proc/bus/input/devices')).includes(
    VIRTUAL_DEVICE_NAME
  );
}
