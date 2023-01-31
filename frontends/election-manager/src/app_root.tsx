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
  Provider,
  Printer,
  VotingMethod,
  ConverterClientType,
} from '@votingworks/types';
import {
  Hardware,
  computeFullElectionTally,
  getEmptyFullElectionTally,
} from '@votingworks/utils';
import {
  useUsbDrive,
  useDevices,
  useDippedSmartCardAuth,
} from '@votingworks/ui';

import { assert, throwIllegalValue } from '@votingworks/basics';
import { AppContext } from './contexts/app_context';
import { ElectionManager } from './components/election_manager';
import {
  SaveElection,
  ResultsFileType,
  MachineConfig,
  ExportableTallies,
  ResetElection,
} from './config/types';
import { useElectionManagerStore } from './hooks/use_election_manager_store';
import { getExportableTallies } from './utils/exportable_tallies';
import { ServicesContext } from './contexts/services_context';
import { useClearCastVoteRecordFilesMutation } from './hooks/use_clear_cast_vote_record_files_mutation';
import { useCurrentElectionMetadata } from './hooks/use_current_election_metadata';
import { useCvrsQuery } from './hooks/use_cvrs_query';
import { useApiClient } from './api';

export interface Props {
  printer: Printer;
  hardware: Hardware;
  machineConfigProvider: Provider<MachineConfig>;
  converter?: ConverterClientType;
}

export function AppRoot({
  printer,
  hardware,
  machineConfigProvider,
  converter,
}: Props): JSX.Element | null {
  const { logger } = useContext(ServicesContext);

  const { cardReader, printer: printerInfo } = useDevices({ hardware, logger });

  const [isTabulationRunning, setIsTabulationRunning] = useState(false);
  const [manualTallyVotingMethod, setManualTallyVotingMethod] = useState(
    VotingMethod.Precinct
  );
  const [machineConfig, setMachineConfig] = useState<MachineConfig>({
    machineId: '0000',
    codeVersion: '',
  });

  const store = useElectionManagerStore();
  const currentElection = useCurrentElectionMetadata();
  const cvrs = useCvrsQuery().data;

  const electionDefinition = currentElection.data?.electionDefinition;

  const apiClient = useApiClient();
  const auth = useDippedSmartCardAuth(apiClient);
  const currentUserRole =
    auth.status === 'logged_in' ? auth.user.role : 'unknown';

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

  // Handle Machine Config
  useEffect(() => {
    void (async () => {
      try {
        const newMachineConfig = await machineConfigProvider.get();
        setMachineConfig(newMachineConfig);
      } catch {
        // Do nothing if machineConfig fails. Default values will be used.
      }
    })();
  }, [machineConfigProvider]);

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

  const saveElection: SaveElection = useCallback(
    async (electionJson) => {
      await store.configure(electionJson);
    },
    [store]
  );

  const resetElection: ResetElection = useCallback(async () => {
    await store.reset();
  }, [store]);

  const generateExportableTallies = useCallback((): ExportableTallies => {
    assert(electionDefinition);
    return getExportableTallies(
      fullElectionTally,
      store.fullElectionExternalTallies,
      electionDefinition.election
    );
  }, [electionDefinition, store, fullElectionTally]);

  const clearCastVoteRecordFilesMutation =
    useClearCastVoteRecordFilesMutation();

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
        case ResultsFileType.SEMS: {
          await store.removeFullElectionExternalTally(
            ExternalTallySourceType.SEMS
          );
          await logger.log(LogEventId.RemovedTallyFile, currentUserRole, {
            message: 'User removed all SEMS external tally files.',
            fileType,
            disposition: 'success',
          });
          break;
        }
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

  if (!currentElection.isSuccess) {
    return null;
  }

  return (
    <AppContext.Provider
      value={{
        electionDefinition,
        configuredAt: currentElection.data?.createdAt,
        converter,
        isOfficialResults: currentElection.data?.isOfficialResults ?? false,
        printer,
        saveElection,
        resetElection,
        resetFiles,
        usbDrive,
        fullElectionTally,
        fullElectionExternalTallies: store.fullElectionExternalTallies,
        updateExternalTally,
        manualTallyVotingMethod,
        setManualTallyVotingMethod,
        isTabulationRunning,
        setIsTabulationRunning,
        generateExportableTallies,
        auth,
        machineConfig,
        hasCardReaderAttached: !!cardReader,
        hasPrinterAttached: !!printerInfo,
        logger,
      }}
    >
      <ElectionManager />
    </AppContext.Provider>
  );
}
