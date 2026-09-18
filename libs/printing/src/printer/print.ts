import { Result, assert, err, ok } from '@votingworks/basics';
import { PrintJobId, safeParseInt } from '@votingworks/types';
import { rootDebug } from '../utils/debug.js';
import { PrintProps, PrintSides } from './types.js';
import { DEFAULT_MANAGED_PRINTER_NAME } from './configure.js';
import { ExecError, exec } from '../utils/exec.js';

const debug = rootDebug.extend('status');

// `lp` reports the assigned job id on stdout, e.g. "request id is
// VxPrinter-42 (1 file(s))". The sentence is localized but the
// destination-id token is a format placeholder that survives translation, so
// match on the token rather than the words around it.
const LP_REQUEST_ID_PATTERN = new RegExp(
  `\\b${DEFAULT_MANAGED_PRINTER_NAME}-(\\d+)\\b`
);

/**
 * Largest print job we will submit to CUPS. Guards against a caller building
 * an unbounded document, which would be spooled to disk and held in memory on
 * its way to the printer.
 */
export const MAX_PRINT_JOB_SIZE_BYTES = 512 * 1024 * 1024;

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

  if (data instanceof Uint8Array) {
    assert(
      data.byteLength <= MAX_PRINT_JOB_SIZE_BYTES,
      `print job of ${data.byteLength} bytes exceeds the maximum of ${MAX_PRINT_JOB_SIZE_BYTES} bytes`
    );
  }

  debug('printing via lp with args=%o', lpOptions);
  const { stdout, stderr } = (await exec('lp', lpOptions, data)).unsafeUnwrap();
  debug('`lp` succeeded with stdout=%s stderr=%s', stdout, stderr);

  const jobIdMatch = stdout.match(LP_REQUEST_ID_PATTERN);
  assert(jobIdMatch, `unable to parse job id from lp output: ${stdout}`);
  return safeParseInt(jobIdMatch[1]).unsafeUnwrap();
}

export async function cancelAllJobs(): Promise<Result<void, ExecError>> {
  const cancelArgs = ['-a', DEFAULT_MANAGED_PRINTER_NAME];
  debug('cancelling all jobs: args=%o', cancelArgs);
  const cancelResult = await exec('cancel', cancelArgs);
  if (cancelResult.isErr()) {
    return err(cancelResult.err());
  }
  return ok();
}
