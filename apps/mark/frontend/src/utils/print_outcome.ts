import { Result } from '@votingworks/basics';
import { PrintJobOutcome, PrintJobStatus } from '@votingworks/types';

export function getPrintOutcome(
  jobStatusResult?: Result<PrintJobStatus, Error>
): PrintJobOutcome {
  if (!jobStatusResult) return 'in-progress';
  if (jobStatusResult.isErr()) return 'failed';
  return jobStatusResult.ok().outcome;
}
