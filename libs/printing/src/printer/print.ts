import { assert } from '@votingworks/basics';
import { rootDebug } from '../utils/debug';
import { PrintProps, PrintSides } from './types';
import { DEFAULT_MANAGED_PRINTER_NAME } from './configure';
import { exec } from '../utils/exec';
import { M404N_INPUT_SLOT_OPTION } from './supported';

const debug = rootDebug.extend('status');

export async function print({
  data,
  copies,
  sides = PrintSides.OneSided,
  size = 'letter',
  isM404nSupportRequired = false,
  raw = {},
}: PrintProps): Promise<void> {
  const lprOptions: string[] = [];

  lprOptions.push('-P', DEFAULT_MANAGED_PRINTER_NAME);

  lprOptions.push('-o', `sides=${sides}`);
  lprOptions.push('-o', `media=${size}`);

  // -o already pushed, can add options from raw
  const rawOptions = isM404nSupportRequired
    ? { ...M404N_INPUT_SLOT_OPTION, ...raw }
    : raw;
  for (const [key, value] of Object.entries(rawOptions)) {
    assert(
      key.match(/^[a-zA-Z0-9][-a-zA-Z0-9]*$/),
      'key must be dashed alphanumeric'
    );
    lprOptions.push('-o', `${key}=${value}`);
  }

  if (copies !== undefined) {
    lprOptions.push('-#', copies.toString());
  }

  debug('printing via lpr with args=%o', lprOptions);
  const { stdout, stderr } = (
    await exec('lpr', lprOptions, data)
  ).unsafeUnwrap();
  debug('`lpr` succeeded with stdout=%s stderr=%s', stdout, stderr);
}
