import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { ElectionDefinition, unsafeParse } from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { BallotPackage, BallotPackageEntry } from '@votingworks/utils';
import { EventEmitter } from 'events';
import { assert } from '@votingworks/basics';
import { setElection } from './config';

export interface AddTemplatesEvents extends EventEmitter {
  on(
    event: 'configuring',
    callback: (
      pkg: BallotPackage,
      electionDefinition: ElectionDefinition
    ) => void
  ): this;
  on(
    event: 'uploading',
    callback: (pkg: BallotPackage, entry: BallotPackageEntry) => void
  ): this;
  on(event: 'completed', callback: (pkg: BallotPackage) => void): this;
  on(event: 'error', callback: (error: Error) => void): this;
  off(
    event: 'configuring',
    callback: (
      pkg: BallotPackage,
      electionDefinition: ElectionDefinition
    ) => void
  ): this;
  off(
    event: 'uploading',
    callback: (pkg: BallotPackage, entry: BallotPackageEntry) => void
  ): this;
  off(event: 'completed', callback: (pkg: BallotPackage) => void): this;
  off(event: 'error', callback: (error: Error) => void): this;
  emit(
    event: 'configuring',
    pkg: BallotPackage,
    electionDefinition: ElectionDefinition
  ): boolean;
  emit(
    event: 'uploading',
    pkg: BallotPackage,
    entry: BallotPackageEntry
  ): boolean;
  emit(event: 'completed', pkg: BallotPackage): boolean;
  emit(event: 'error', error: Error): boolean;
}

export function addTemplates(
  pkg: BallotPackage,
  logger: Logger,
  currentUserType: LoggingUserRole
): AddTemplatesEvents {
  const result: AddTemplatesEvents = new EventEmitter();

  setImmediate(async () => {
    try {
      result.emit('configuring', pkg, pkg.electionDefinition);
      await setElection(pkg.electionDefinition.electionData);

      for (const ballot of pkg.ballots) {
        result.emit('uploading', pkg, ballot);

        const body = new FormData();

        body.append(
          'ballots',
          new Blob([ballot.pdf], { type: 'application/pdf' }),
          ballot.ballotConfig.filename
        );

        body.append(
          'metadatas',
          new Blob([JSON.stringify(ballot.ballotConfig)], {
            type: 'application/json',
          }),
          'ballot-config.json'
        );

        body.append(
          'layouts',
          new Blob([JSON.stringify(ballot.layout)], {
            type: 'application/json',
          }),
          ballot.ballotConfig.layoutFilename
        );

        try {
          await fetch('/central-scanner/scan/hmpb/addTemplates', {
            method: 'POST',
            body,
          });
          await logger.log(
            LogEventId.BallotConfiguredOnMachine,
            currentUserType,
            {
              message: `${
                ballot.ballotConfig.isLiveMode ? 'Live' : 'Test'
              } Ballot with ballotStyleId: ${
                ballot.ballotConfig.ballotStyleId
              } precinctId: ${
                ballot.ballotConfig.precinctId
              } successfully configured on machine.`,
              disposition: 'success',
              precinctId: ballot.ballotConfig.precinctId,
              ballotStyleId: ballot.ballotConfig.ballotStyleId,
              isLiveMode: ballot.ballotConfig.isLiveMode,
            }
          );
        } catch (error) {
          assert(error instanceof Error);
          await logger.log(
            LogEventId.BallotConfiguredOnMachine,
            currentUserType,
            {
              message: `${
                ballot.ballotConfig.isLiveMode ? 'Live' : 'Test'
              } Ballot with ballotStyleId: ${
                ballot.ballotConfig.ballotStyleId
              } precinctId: ${
                ballot.ballotConfig.precinctId
              } failed to be configured on machine.`,
              disposition: 'failure',
              error: error.message,
              result:
                'Machine not configured for election, user shown error and asked to try again.',
              precinctId: ballot.ballotConfig.precinctId,
              ballotStyleId: ballot.ballotConfig.ballotStyleId,
              isLiveMode: ballot.ballotConfig.isLiveMode,
            }
          );
          throw error;
        }
      }

      result.emit('completed', pkg);
    } catch (error) {
      assert(error instanceof Error);
      result.emit('error', error);
    }
  });

  return result;
}

export async function doneTemplates(): Promise<void> {
  await fetch('/central-scanner/scan/hmpb/doneTemplates', { method: 'POST' });
}

export async function fetchNextBallotSheetToReview(): Promise<
  Scan.GetNextReviewSheetResponse | undefined
> {
  const response = await fetch('/central-scanner/scan/hmpb/review/next-sheet');

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error('fetch response is not ok');
  }

  return unsafeParse(
    Scan.GetNextReviewSheetResponseSchema,
    await response.json()
  );
}
