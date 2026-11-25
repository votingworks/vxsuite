import { ok, type Result } from '@votingworks/basics';
import type { ElectionPackageError } from '@votingworks/backend';
import { LogEventId, type Logger } from '@votingworks/logging';
import type { Id } from '@votingworks/types';
import { systemLimitViolationToString } from '@votingworks/utils';
import type { Store } from './store.js';

/**
 * Configures VxAdmin with the election package at the given path and logs the
 * result. `onConfigured` runs in the same transaction that sets the current
 * election.
 */
export async function configureFromElectionPackageFile({
  store,
  logger,
  packagePath,
  successMessage,
  onConfigured,
}: {
  store: Store;
  logger: Logger;
  packagePath: string;
  successMessage?: string;
  onConfigured?: (electionId: Id) => void;
}): Promise<Result<{ electionId: Id }, ElectionPackageError>> {
  const res = await store.importElectionPackage({ packagePath });
  if (res.isErr()) {
    const errorDetails = res.err();
    await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
      message: `Error configuring machine.`,
      disposition: 'failure',
      errorDetails:
        // @coverage-defer
        errorDetails.type === 'system-limit-violation'
          ? systemLimitViolationToString(errorDetails.violation)
          : JSON.stringify(errorDetails),
    });
    return res;
  }

  const { electionId, electionPackage } = res.ok();
  store.withTransaction(() => {
    store.setCurrentElectionId(electionId);
    onConfigured?.(electionId);
  });

  await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
    disposition: 'success',
    newBallotHash: electionPackage.electionDefinition.ballotHash,
    ...(successMessage ? { message: successMessage } : {}),
  });

  return ok({ electionId });
}
