import { ok, type Result } from '@votingworks/basics';
import {
  type ElectionPackageError,
  readElectionPackageFromFile,
} from '@votingworks/backend';
import { LogEventId, type Logger } from '@votingworks/logging';
import type { Id } from '@votingworks/types';
import { systemLimitViolationToString } from '@votingworks/utils';
import type { Store } from './store.js';

export async function configureFromElectionPackageFile({
  store,
  logger,
  electionPackageFilePath,
}: {
  store: Store;
  logger: Logger;
  electionPackageFilePath: string;
}): Promise<Result<{ electionId: Id }, ElectionPackageError>> {
  const electionPackageResult = await readElectionPackageFromFile(
    electionPackageFilePath
  );

  if (electionPackageResult.isErr()) {
    const errorDetails = electionPackageResult.err();
    await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
      message: `Error configuring machine.`,
      disposition: 'failure',
      errorDetails:
        // @coverage-defer
        errorDetails.type === 'system-limit-violation'
          ? systemLimitViolationToString(errorDetails.violation)
          : JSON.stringify(errorDetails),
    });
    return electionPackageResult;
  }
  const { electionPackage, electionPackageHash } = electionPackageResult.ok();

  const { electionDefinition, systemSettings, registeredVoterCounts } =
    electionPackage;
  const electionId = await store.addElection({
    electionData: electionDefinition.electionData,
    ballotHash: electionDefinition.ballotHash,
    systemSettingsData: JSON.stringify(systemSettings),
    electionPackageSourceFilePath: electionPackageFilePath,
    electionPackageHash,
  });
  if (registeredVoterCounts) {
    store.setRegisteredVoterCounts(electionId, registeredVoterCounts);
  }
  store.setCurrentElectionId(electionId);
  await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
    disposition: 'success',
    newBallotHash: electionDefinition.ballotHash,
  });
  return ok({ electionId });
}
