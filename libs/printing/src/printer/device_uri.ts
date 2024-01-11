import { lines } from '@votingworks/basics';
import { rootDebug } from '../utils/debug';
import { exec } from '../utils/exec';

const debug = rootDebug.extend('device-uri');

export async function getConnectedDeviceUris(): Promise<string[]> {
  debug('getting connected device URIs from lpinfo...');
  const { stdout } = (
    await exec('lpinfo', ['--include-schemes', 'usb', '-v'])
  ).unsafeUnwrap();

  const deviceUris = lines(stdout)
    .filterMap((line) => line.split(/\s+/, 2)[1])
    .toArray();
  debug('connected device URIs: %O', deviceUris);
  return deviceUris;
}
