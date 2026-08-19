import { assert } from '@votingworks/basics';
import { safeParseInt } from '@votingworks/types';
import { rootDebug } from '../utils/debug';
import { PrintProps, PrintSides } from './types';
import { DEFAULT_MANAGED_PRINTER_NAME } from './configure';
import { exec } from '../utils/exec';

const debug = rootDebug.extend('status');

/**
 * The id CUPS assigned to a submitted print job, unique per queue. Can be used
 * to query the job's status on the CUPS server.
 */
export type PrintJobId = number;

// `lp` reports the assigned job id on stdout, e.g. "request id is
// VxPrinter-42 (1 file(s))". The sentence is localized but the
// destination-id token is a format placeholder that survives translation, so
// match on the token rather than the words around it.
const LP_REQUEST_ID_PATTERN = new RegExp(
  `\\b${DEFAULT_MANAGED_PRINTER_NAME}-(\\d+)\\b`
);

export async function print({
  data,
  copies,
  sides = PrintSides.OneSided,
  size = 'letter',
  raw = {},
}: PrintProps): Promise<PrintJobId> {
  const lpOptions: string[] = [];

  lpOptions.push('-d', DEFAULT_MANAGED_PRINTER_NAME);

  lpOptions.push('-o', `sides=${sides}`);
  lpOptions.push('-o', `media=${size}`);

  // -o already pushed, can add options from raw
  for (const [key, value] of Object.entries(raw)) {
    assert(
      key.match(/^[a-zA-Z0-9][-a-zA-Z0-9]*$/),
      'key must be dashed alphanumeric'
    );
    lpOptions.push('-o', `${key}=${value}`);
  }

  if (copies !== undefined) {
    lpOptions.push('-n', copies.toString());
  }

  debug('printing via lp with args=%o', lpOptions);
  const { stdout, stderr } = (await exec('lp', lpOptions, data)).unsafeUnwrap();
  debug('`lp` succeeded with stdout=%s stderr=%s', stdout, stderr);

  const jobIdMatch = stdout.match(LP_REQUEST_ID_PATTERN);
  assert(jobIdMatch, `unable to parse job id from lp output: ${stdout}`);
  return safeParseInt(jobIdMatch[1]).unsafeUnwrap();
}
