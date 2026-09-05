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
 * :631 is the CUPS scheduler's IPP endpoint, where our print jobs live. Not to be
 * confused with {@link CUPS_DEFAULT_IPP_URI}, which addresses the printer
 * itself via the `ipp-usb` daemon and numbers its jobs independently of CUPS —
 * a job id from `lp` means nothing there.
 */
export const CUPS_SCHEDULER_IPP_URI = `ipp://localhost:631/printers/${DEFAULT_MANAGED_PRINTER_NAME}`;

const RELATIVE_PATH_TO_IPP_QUERIES = './ipp_queries';

export const GET_JOB_ATTRIBUTES_QUERY_PATH = join(
  __dirname,
  RELATIVE_PATH_TO_IPP_QUERIES,
  'get-job-attributes.ipp'
);

const IPPTOOL_TIMEOUT_SECONDS = '5';

/**
 * Reduces IPP job states to what VxSuite business logic needs to know.
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
 * Why a job status query did not produce a status.
 * `query-failed` means CUPS is unreachable or `ipptool` timed out.
 * `unknown-job` means CUPS answered that it has no record of the
 * job, which happens once the job ages out of its history.
 */
export type JobStatusQueryError =
  | { type: 'query-failed'; message: string }
  | { type: 'unknown-job'; message: string };

/**
 * Asks the CUPS scheduler for the status of a single job.
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
  // Query failed to run; job status unknown
  if (ipptoolResult.isErr()) {
    return err({
      type: 'query-failed',
      message: `ipptool failed: ${ipptoolResult.err().stderr.trim()}`,
    });
  }

  const { statusLine, attributes } = parseIpptoolOutput(
    ipptoolResult.ok().stdout,
    { allowFailureStatus: true }
  );
  if (statusLine !== IPPTOOL_SUCCESS_STATUS_LINE) {
    return err({
      type: 'unknown-job',
      message: `CUPS did not return job ${jobId}: ${statusLine}`,
    });
  }

  const state = attributes['job-state'] as IppJobState;
  // job-printer-state-message is empty for any job that did not fault.
  // Collapse it so callers see an absent reason rather than an empty string.
  const message =
    (attributes['job-printer-state-message'] as string) || undefined;
  debug('job %d state=%s message=%s', jobId, state, message);

  return ok({
    outcome: classifyJobState(state),
    reason: message,
  });
}
