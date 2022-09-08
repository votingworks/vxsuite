import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import 'normalize.css';
import { Logger, LogEventId } from '@votingworks/logging';
import {
  Card,
  FullElectionExternalTally,
  ExternalTallySourceType,
  Provider,
} from '@votingworks/types';
import {
  assert,
  throwIllegalValue,
  usbstick,
  Printer,
  Hardware,
} from '@votingworks/utils';
import {
  useUsbDrive,
  useDevices,
  useDippedSmartcardAuth,
} from '@votingworks/ui';
import {
  computeFullElectionTally,
  getEmptyFullElectionTally,
} from './lib/votecounting';

import { AppContext } from './contexts/app_context';
import { AddCastVoteRecordFile } from './utils/cast_vote_record_files';
import { ElectionManager } from './components/election_manager';
import {
  SaveElection,
  PrintedBallot,
  ResultsFileType,
  MachineConfig,
  ConverterClientType,
  ExportableTallies,
  ResetElection,
} from './config/types';
import { useElectionManagerStore } from './hooks/use_election_manager_store';
import { getExportableTallies } from './utils/exportable_tallies';
import { ElectionManagerStoreBackend } from './lib/backends/types';

export interface Props {
  logger: Logger;
  backend: ElectionManagerStoreBackend;
  printer: Printer;
  hardware: Hardware;
  card: Card;
  machineConfigProvider: Provider<MachineConfig>;
  converter?: ConverterClientType;
}

export function AppRoot({
  backend,
  logger,
  printer,
  card,
  hardware,
  machineConfigProvider,
  converter,
}: Props): JSX.Element {
  const printBallotRef = useRef<HTMLDivElement>(null);

  const { cardReader, printer: printerInfo } = useDevices({ hardware, logger });

  const [isTabulationRunning, setIsTabulationRunning] = useState(false);
  const [machineConfig, setMachineConfig] = useState<MachineConfig>({
    machineId: '0000',
    codeVersion: '',
  });

  const store = useElectionManagerStore({
    logger,
    backend,
  });

  const { electionDefinition } = store;

  const auth = useDippedSmartcardAuth({
    cardApi: card,
    logger,
    scope: { electionDefinition },
  });
  const currentUserRole =
    auth.status === 'logged_in' ? auth.user.role : 'unknown';

  store.setCurrentUserRole(currentUserRole);

  const markResultsOfficial = useCallback(async () => {
    await store.markResultsOfficial();
  }, [store]);

  // Recomputed as needed based on the cast vote record files. Uses `useMemo`
  // because it can be slow with a lot of CVRs.
  const fullElectionTally = useMemo(() => {
    if (!electionDefinition) return getEmptyFullElectionTally();
    void logger.log(LogEventId.RecomputingTally, currentUserRole);
    const fullTally = computeFullElectionTally(
      electionDefinition.election,
      new Set(store.castVoteRecordFiles.castVoteRecords)
    );
    return fullTally;
  }, [currentUserRole, electionDefinition, logger, store]);

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
  const displayUsbStatus = usbDrive.status ?? usbstick.UsbDriveStatus.absent;

  const addPrintedBallot = useCallback(
    async (printedBallot: PrintedBallot) => {
      await store.addPrintedBallot(printedBallot);
    },
    [store]
  );

  const saveTranscribedValue = useCallback(
    async (adjudicationId: string, transcribedValue: string) => {
      try {
        await fetch(
          `/admin/write-ins/adjudications/${adjudicationId}/transcription`,
          {
            method: 'PATCH',
            body: JSON.stringify({ transcribedValue }),
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      } catch (error) {
        assert(error instanceof Error);
        throw error;
      }
    },
    []
  );

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

  const addCastVoteRecordFile: AddCastVoteRecordFile = useCallback(
    async (newCvrFile) => {
      await store.addCastVoteRecordFile(newCvrFile);
    },
    [store]
  );

  const clearCastVoteRecordFiles = useCallback(async () => {
    await store.clearCastVoteRecordFiles();
  }, [store]);

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

  const resetFiles = useCallback(
    async (fileType: ResultsFileType) => {
      switch (fileType) {
        case ResultsFileType.CastVoteRecord:
          await logger.log(LogEventId.RemovedTallyFile, currentUserRole, {
            message: 'User removed all Cast vote record files.',
            fileType,
            disposition: 'success',
          });
          await store.clearCastVoteRecordFiles();
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
          await store.clearCastVoteRecordFiles();
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
    [currentUserRole, store, logger]
  );

  return (
    <AppContext.Provider
      value={{
        castVoteRecordFiles: store.castVoteRecordFiles,
        electionDefinition,
        configuredAt: store.configuredAt,
        converter,
        isOfficialResults: store.isOfficialResults,
        printer,
        printBallotRef,
        addCastVoteRecordFile,
        clearCastVoteRecordFiles,
        saveElection,
        resetElection,
        markResultsOfficial,
        resetFiles,
        usbDriveStatus: displayUsbStatus,
        usbDriveEject: usbDrive.eject,
        printedBallots: store.printedBallots,
        addPrintedBallot,
        fullElectionTally,
        fullElectionExternalTallies: store.fullElectionExternalTallies,
        updateExternalTally,
        saveTranscribedValue,
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
      <div ref={printBallotRef} />
    </AppContext.Provider>
  );
}
