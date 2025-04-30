import { lines, sleep } from '@votingworks/basics';
import { rootDebug } from '../utils/debug';
import { exec } from '../utils/exec';

export const LPINFO_ARGS = ['--include-schemes', 'usb', '-v'];
export const DEFAULT_LPINFO_RETRY_COUNT = 3;
export const DEFAULT_LPINFO_RETRY_DELAY_MS = 1000;

export interface LPINFO_RETRY_OPTIONS {
  retryCount: number;
  retryDelay: number;
}

const DEFAULT_LPINFO_RETRY_OPTIONS: LPINFO_RETRY_OPTIONS = {
  retryCount: DEFAULT_LPINFO_RETRY_COUNT,
  retryDelay: DEFAULT_LPINFO_RETRY_DELAY_MS,
};

const debug = rootDebug.extend('device-uri');

/**
 * Executes the `lpinfo` command to get a list of connected device URIs and
 * parses the output, which looks something like this:
 * ```
 * direct usb://Brother/PJ-822?serial=000K2G613155
 * direct usb://HP/LaserJet%20Pro%20M404-M405?serial=PHBBJ08819
 * ```
 * Retries `lpinfo` if it fails, up to the specified retry count and delay.
 * We retry because `lpinfo` can fail in the benign case of the CUPS server
 * being momentarily down during log rotation.
 */
export async function getConnectedDeviceUris({
  retryCount,
  retryDelay,
}: LPINFO_RETRY_OPTIONS = DEFAULT_LPINFO_RETRY_OPTIONS): Promise<string[]> {
  debug('getting connected device URIs from lpinfo...');

  let lpinfoResult = await exec('lpinfo', LPINFO_ARGS);
  let retries = 0;
  while (lpinfoResult.isErr() && retries < retryCount) {
    debug(
      `lpinfo failed with stderr: ${lpinfoResult.err().stderr.trim()}. ` +
        `Retrying in ${retryDelay} ms...`
    );
    await sleep(retryDelay);
    lpinfoResult = await exec('lpinfo', LPINFO_ARGS);
    retries += 1;
  }

  if (lpinfoResult.isErr()) {
    debug(
      `lpinfo failed with stderr: ${lpinfoResult
        .err()
        .stderr.trim()}. Giving up.`
    );
    throw lpinfoResult.err();
  }

  const { stdout } = lpinfoResult.ok();
  const deviceUris = lines(stdout)
    .filterMap((line) => line.split(/\s+/, 2)[1])
    .toArray();
  debug('connected device URIs: %O', deviceUris);
  return deviceUris;
}
