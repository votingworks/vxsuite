import { rootDebug } from '../utils/debug';
import { exec } from '../utils/exec';

const debug = rootDebug.extend('device-uri');

export async function getConnectedDeviceUris(): Promise<string[]> {
  debug('getting connected device URIs from lpinfo...');
  const { stdout } = await exec('lpinfo', ['--include-schemes', 'usb', '-v']);

  const deviceUris = stdout
    .split('\n')
    .map((line) => line.split(/\s+/, 2)[1])
    .filter(Boolean);
  debug('connected device URIs: %O', deviceUris);
  return deviceUris;
}
