import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LogEventId, Logger } from '@votingworks/logging';
import { Printer, ConverterClientType } from '@votingworks/types';
import {
  Hardware,
  computeFullElectionTally,
  getEmptyFullElectionTally,
  randomBallotId,
} from '@votingworks/utils';
import { useUsbDrive, useDevices } from '@votingworks/ui';

import { assert } from '@votingworks/basics';
import { AppContext } from './contexts/app_context';
import { ElectionManager } from './components/election_manager';
import { ExportableTallies } from './config/types';
import { getExportableTallies } from './utils/exportable_tallies';
import {
  getAuthStatus,
  getCastVoteRecords,
  getCurrentElectionMetadata,
  getFullElectionManualTally,
  getMachineConfig,
} from './api';
import { convertServerFullElectionManualTally } from './utils/manual_tallies';

export interface Props {
  printer: Printer;
  hardware: Hardware;
  logger: Logger;
  converter?: ConverterClientType;
  generateBallotId?: () => string;
}

export function AppRoot({
  printer,
  hardware,
  converter,
  logger,
  generateBallotId = randomBallotId,
}: Props): JSX.Element | null {
  const { cardReader, printer: printerInfo } = useDevices({ hardware, logger });

  const [isTabulationRunning, setIsTabulationRunning] = useState(false);

  const authStatusQuery = getAuthStatus.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const currentElectionMetadataQuery = getCurrentElectionMetadata.useQuery();
  const castVoteRecordsQuery = getCastVoteRecords.useQuery();
  const fullElectionManualTallyQuery = getFullElectionManualTally.useQuery();
  const fullElectionManualTally = useMemo(() => {
    return fullElectionManualTallyQuery.data
      ? convertServerFullElectionManualTally(fullElectionManualTallyQuery.data)
      : undefined;
  }, [fullElectionManualTallyQuery.data]);

  const currentUserRole =
    authStatusQuery.data?.status === 'logged_in'
      ? authStatusQuery.data.user.role
      : 'unknown';

  const cvrs = castVoteRecordsQuery.data;

  const electionDefinition =
    currentElectionMetadataQuery.data?.electionDefinition;

  // Recomputed as needed based on the cast vote record files. Uses `useMemo`
  // because it can be slow with a lot of CVRs.
  const fullElectionTally = useMemo(() => {
    if (!electionDefinition || !cvrs) {
      return getEmptyFullElectionTally();
    }

    void logger.log(LogEventId.RecomputingTally, currentUserRole);
    const fullTally = computeFullElectionTally(
      electionDefinition.election,
      new Set(cvrs)
    );
    return fullTally;
  }, [currentUserRole, electionDefinition, logger, cvrs]);

  const usbDrive = useUsbDrive({ logger });

  useEffect(() => {
    const totalBallots =
      fullElectionTally.overallTally.numberOfBallotsCounted +
      (fullElectionManualTally?.overallTally.numberOfBallotsCounted ?? 0);
    void logger.log(LogEventId.RecomputedTally, currentUserRole, {
      message: `Tally recomputed, there are now ${totalBallots} total ballots tallied.`,
      disposition: 'success',
      totalBallots,
    });
  }, [
    currentUserRole,
    fullElectionTally.overallTally.numberOfBallotsCounted,
    logger,
    fullElectionManualTally,
  ]);

  const generateExportableTallies = useCallback((): ExportableTallies => {
    assert(electionDefinition);
    return getExportableTallies(
      fullElectionTally,
      electionDefinition.election,
      fullElectionManualTally
    );
  }, [electionDefinition, fullElectionManualTally, fullElectionTally]);

  if (
    !authStatusQuery.isSuccess ||
    !getMachineConfigQuery.isSuccess ||
    !currentElectionMetadataQuery.isSuccess ||
    !castVoteRecordsQuery.isSuccess
  ) {
    return null;
  }

  return (
    <AppContext.Provider
      value={{
        electionDefinition,
        configuredAt: currentElectionMetadataQuery.data?.createdAt,
        converter,
        isOfficialResults:
          currentElectionMetadataQuery.data?.isOfficialResults ?? false,
        printer,
        usbDrive,
        fullElectionTally,
        fullElectionManualTally,
        generateBallotId,
        isTabulationRunning,
        setIsTabulationRunning,
        generateExportableTallies,
        auth: authStatusQuery.data,
        machineConfig: getMachineConfigQuery.data,
        hasCardReaderAttached: !!cardReader,
        hasPrinterAttached: !!printerInfo,
        logger,
      }}
    >
      <ElectionManager />
    </AppContext.Provider>
  );
}
