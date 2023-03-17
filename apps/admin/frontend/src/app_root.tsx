import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useContext,
} from 'react';
import { LogEventId } from '@votingworks/logging';
import {
  FullElectionExternalTally,
  ExternalTallySourceType,
  Printer,
  VotingMethod,
  ConverterClientType,
} from '@votingworks/types';
import {
  Hardware,
  computeFullElectionTally,
  getEmptyFullElectionTally,
  randomBallotId,
} from '@votingworks/utils';
import { useUsbDrive, useDevices } from '@votingworks/ui';

import { assert, throwIllegalValue } from '@votingworks/basics';
import { AppContext } from './contexts/app_context';
import { ElectionManager } from './components/election_manager';
import { ResultsFileType, ExportableTallies } from './config/types';
import { useElectionManagerStore } from './hooks/use_election_manager_store';
import { getExportableTallies } from './utils/exportable_tallies';
import { ServicesContext } from './contexts/services_context';
import {
  clearCastVoteRecordFiles,
  getAuthStatus,
  getCastVoteRecords,
  getCurrentElectionMetadata,
  getMachineConfig,
} from './api';

export interface Props {
  printer: Printer;
  hardware: Hardware;
  converter?: ConverterClientType;
  generateBallotId?: () => string;
}

export function AppRoot({
  printer,
  hardware,
  converter,
  generateBallotId = randomBallotId,
}: Props): JSX.Element | null {
  const { logger } = useContext(ServicesContext);

  const { cardReader, printer: printerInfo } = useDevices({ hardware, logger });

  const [isTabulationRunning, setIsTabulationRunning] = useState(false);
  const [manualTallyVotingMethod, setManualTallyVotingMethod] = useState(
    VotingMethod.Precinct
  );

  const authStatusQuery = getAuthStatus.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const currentElectionMetadataQuery = getCurrentElectionMetadata.useQuery();
  const castVoteRecordsQuery = getCastVoteRecords.useQuery();
  const currentUserRole =
    authStatusQuery.data?.status === 'logged_in'
      ? authStatusQuery.data.user.role
      : 'unknown';

  const store = useElectionManagerStore();
  const cvrs = castVoteRecordsQuery.data;

  const electionDefinition =
    currentElectionMetadataQuery.data?.electionDefinition;

  store.setCurrentUserRole(currentUserRole);

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
      Array.from(store.fullElectionExternalTallies.values()).reduce(
        (previous, tally) =>
          previous + tally.overallTally.numberOfBallotsCounted,
        0
      );
    void logger.log(LogEventId.RecomputedTally, currentUserRole, {
      message: `Tally recomputed, there are now ${totalBallots} total ballots tallied.`,
      disposition: 'success',
      totalBallots,
    });
  }, [
    currentUserRole,
    fullElectionTally.overallTally.numberOfBallotsCounted,
    logger,
    store.fullElectionExternalTallies,
  ]);

  const updateExternalTally = useCallback(
    async (newFullElectionExternalTally: FullElectionExternalTally) => {
      await store.updateFullElectionExternalTally(
        newFullElectionExternalTally.source,
        newFullElectionExternalTally
      );
    },
    [store]
  );

  const generateExportableTallies = useCallback((): ExportableTallies => {
    assert(electionDefinition);
    return getExportableTallies(
      fullElectionTally,
      store.fullElectionExternalTallies,
      electionDefinition.election
    );
  }, [electionDefinition, store, fullElectionTally]);

  const clearCastVoteRecordFilesMutation =
    clearCastVoteRecordFiles.useMutation();

  const resetFiles = useCallback(
    async (fileType: ResultsFileType) => {
      switch (fileType) {
        case ResultsFileType.CastVoteRecord:
          await logger.log(LogEventId.RemovedTallyFile, currentUserRole, {
            message: 'User removed all Cast vote record files.',
            fileType,
            disposition: 'success',
          });
          await clearCastVoteRecordFilesMutation.mutateAsync();
          break;
        case ResultsFileType.Manual: {
          await store.removeFullElectionExternalTally(
            ExternalTallySourceType.Manual
          );
          await logger.log(LogEventId.RemovedTallyFile, currentUserRole, {
            message: 'User removed all manually entered tally data.',
            fileType,
            disposition: 'success',
          });
          break;
        }
        case ResultsFileType.All:
          await clearCastVoteRecordFilesMutation.mutateAsync();
          await store.clearFullElectionExternalTallies();
          await logger.log(LogEventId.RemovedTallyFile, currentUserRole, {
            message: 'User removed all tally data.',
            fileType,
            disposition: 'success',
          });
          break;
        default:
          throwIllegalValue(fileType);
      }
    },
    [logger, currentUserRole, clearCastVoteRecordFilesMutation, store]
  );

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
        resetFiles,
        usbDrive,
        fullElectionTally,
        fullElectionExternalTallies: store.fullElectionExternalTallies,
        generateBallotId,
        updateExternalTally,
        manualTallyVotingMethod,
        setManualTallyVotingMethod,
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
