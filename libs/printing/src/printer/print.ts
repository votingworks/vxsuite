import { assert } from '@votingworks/basics';
import { rootDebug } from '../utils/debug';
import { PrintProps, PrintSides } from './types';
import { DEFAULT_MANAGED_PRINTER_NAME } from './configure';
import { exec } from '../utils/exec';

const debug = rootDebug.extend('status');

export async function print({
  data,
  copies,
  sides = PrintSides.TwoSidedLongEdge,
  raw = {},
}: PrintProps): Promise<void> {
  const lprOptions: string[] = [];

  lprOptions.push('-P', DEFAULT_MANAGED_PRINTER_NAME);

  lprOptions.push('-o', `sides=${sides}`);

  // -o already pushed, can add options from raw
  for (const [key, value] of Object.entries(raw)) {
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
