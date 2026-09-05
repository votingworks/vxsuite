import { join } from 'node:path';
import { Result, err, ok, throwIllegalValue } from '@votingworks/basics';
import {
  IppJobState,
  PrintJobId,
  PrintJobOutcome,
  PrintJobStatus,
} from '@votingworks/types';
import { exec } from '../utils/exec';
import { rootDebug } from '../utils/debug';
import { DEFAULT_MANAGED_PRINTER_NAME } from './configure';
import { IPPTOOL_SUCCESS_STATUS_LINE, parseIpptoolOutput } from './status';

const debug = rootDebug.extend('job-status');

/**
 * The CUPS scheduler's IPP endpoint, where our print jobs live. Not to be
 * confused with {@link CUPS_DEFAULT_IPP_URI}, which addresses the printer
 * itself via the `ipp-usb` daemon and numbers its jobs independently of CUPS —
 * a job id from `lp` means nothing there.
 */
export const CUPS_SCHEDULER_IPP_URI = `ipp://localhost:631/printers/${DEFAULT_MANAGED_PRINTER_NAME}`;

// libs/printing/src/printer/ and build/printer/ are both two levels below the
// package root, so this resolves from source and from the build output alike.
const RELATIVE_PATH_TO_IPP_QUERIES = '../../ipp_queries';

export const GET_JOB_ATTRIBUTES_QUERY_PATH = join(
  __dirname,
  RELATIVE_PATH_TO_IPP_QUERIES,
  'get-job-attributes.ipp'
);

const IPPTOOL_TIMEOUT_SECONDS = '5';

/**
 * Reduces the seven IPP job states to what the application acts on. Note that
 * `completed` means CUPS finished transferring the job to the printer, not
 * that the pages have physically printed.
 */
export function classifyJobState(state: IppJobState): PrintJobOutcome {
  switch (state) {
    case 'completed':
      return 'sent-to-printer';
    case 'canceled':
    case 'aborted':
      return 'failed';
    case 'pending':
    case 'pending-held':
    case 'processing':
    case 'processing-stopped':
      return 'in-progress';
    /* istanbul ignore next - @preserve */
    default:
      return throwIllegalValue(state);
  }
}

/**
 * Why a job status query did not produce a status. `query-failed` means we
 * could not ask — CUPS is unreachable or `ipptool` timed out — and says nothing
 * about the job. `unknown-job` means CUPS answered that it has no record of the
 * job, which happens once the job ages out of its history.
 */
export type JobStatusQueryError =
  | { type: 'query-failed'; message: string }
  | { type: 'unknown-job'; message: string };

/**
 * Asks the CUPS scheduler for the status of a single job.
 *
 * Note that `ipptool` exits 0 even for a job CUPS does not have — its exit
 * status reflects whether the query ran, not what the server answered — so the
 * status line has to be checked explicitly.
 */
export async function queryJobStatus(
  jobId: PrintJobId
): Promise<Result<PrintJobStatus, JobStatusQueryError>> {
  const ipptoolArgs = [
    '-T',
    IPPTOOL_TIMEOUT_SECONDS,
    // `-t` selects CUPS test report output and `-v` includes the response
    // attributes in it. Together they produce the format parseIpptoolOutput
    // expects; `-v` alone does nothing.
    '-tv',
    '-d',
    `job-id=${jobId}`,
    CUPS_SCHEDULER_IPP_URI,
    GET_JOB_ATTRIBUTES_QUERY_PATH,
  ];

  debug('querying job %d status, args=%o', jobId, ipptoolArgs);
  const ipptoolResult = await exec('ipptool', ipptoolArgs);
  if (ipptoolResult.isErr()) {
    return err({
      type: 'query-failed',
      message: `ipptool failed: ${ipptoolResult.err().stderr.trim()}`,
    });
  }

  const { statusLine, attributes } = parseIpptoolOutput(
    ipptoolResult.ok().stdout,
    { requireSuccessStatus: false }
  );
  if (statusLine !== IPPTOOL_SUCCESS_STATUS_LINE) {
    return err({
      type: 'unknown-job',
      message: `CUPS did not return job ${jobId}: ${statusLine}`,
    });
  }

  const state = attributes['job-state'] as IppJobState;
  const message = attributes['job-printer-state-message'] as string;
  debug('job %d state=%s message=%s', jobId, state, message);

  return ok({
    outcome: classifyJobState(state),
    // Empty for any job that did not fault. Collapse it so callers see an
    // absent reason rather than an empty string.
    reason: message || undefined,
  });
}
