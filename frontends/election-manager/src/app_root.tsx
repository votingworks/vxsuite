import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import 'normalize.css';
import { sha256 } from 'js-sha256';
import {
  Logger,
  LogSource,
  LogEventId,
  LogDispositionStandardTypes,
} from '@votingworks/logging';
import {
  ElectionDefinition,
  safeParseElection,
  FullElectionExternalTally,
  ExternalTallySourceType,
  Provider,
} from '@votingworks/types';
import {
  assert,
  Storage,
  throwIllegalValue,
  usbstick,
  Printer,
  Card,
  Hardware,
  typedAs,
} from '@votingworks/utils';
import {
  useUsbDrive,
  useDevices,
  useDippedSmartcardAuth,
} from '@votingworks/ui';
import moment from 'moment';
import {
  computeFullElectionTally,
  getEmptyFullElectionTally,
} from './lib/votecounting';

import { AppContext } from './contexts/app_context';
import { ElectionManager } from './components/election_manager';
import {
  SaveElection,
  PrintedBallot,
  Iso8601Timestamp,
  ExportableTallies,
  ResultsFileType,
  MachineConfig,
  CastVoteRecord,
  ConverterClientType,
  CastVoteRecordFile,
} from './config/types';
import { getExportableTallies } from './utils/exportable_tallies';
import {
  convertExternalTalliesToStorageString,
  convertStorageStringToExternalTallies,
} from './utils/external_tallies';
import { areVvsg2AuthFlowsEnabled } from './config/features';

export interface AppStorage {
  electionDefinition?: ElectionDefinition;
  cvrFiles?: string;
  isOfficialResults?: boolean;
  printedBallots?: PrintedBallot[];
  configuredAt?: Iso8601Timestamp;
  externalVoteTallies?: string;
}

export interface Props {
  storage: Storage;
  printer: Printer;
  hardware: Hardware;
  card: Card;
  machineConfigProvider: Provider<MachineConfig>;
  converter?: ConverterClientType;
}

export const electionDefinitionStorageKey = 'electionDefinition';
export const isOfficialResultsKey = 'isOfficialResults';
export const printedBallotsStorageKey = 'printedBallots';
export const configuredAtStorageKey = 'configuredAt';
export const externalVoteTalliesFileStorageKey = 'externalVoteTallies';

export function AppRoot({
  storage,
  printer,
  card,
  hardware,
  machineConfigProvider,
  converter,
}: Props): JSX.Element {
  const logger = useMemo(
    () => new Logger(LogSource.VxAdminFrontend, window.kiosk),
    []
  );

  const printBallotRef = useRef<HTMLDivElement>(null);

  const { cardReader } = useDevices({ hardware, logger });

  const getElectionDefinition = useCallback(async (): Promise<
    ElectionDefinition | undefined
  > => {
    // TODO: validate this with zod schema
    const electionDefinition = (await storage.get(
      electionDefinitionStorageKey
    )) as ElectionDefinition | undefined;

    if (electionDefinition) {
      const { electionData, electionHash } = electionDefinition;
      assert(sha256(electionData) === electionHash);
      return electionDefinition;
    }
  }, [storage]);

  const getExternalElectionTallies = useCallback(
    async (): Promise<string | undefined> =>
      // TODO: validate this with zod schema
      (await storage.get(externalVoteTalliesFileStorageKey)) as
        | string
        | undefined,
    [storage]
  );
  const getIsOfficialResults = useCallback(
    async (): Promise<boolean | undefined> =>
      // TODO: validate this with zod schema
      (await storage.get(isOfficialResultsKey)) as boolean | undefined,
    [storage]
  );

  const [electionDefinition, setElectionDefinition] =
    useState<ElectionDefinition>();
  const [configuredAt, setConfiguredAt] = useState<Iso8601Timestamp>();

  const [isTabulationRunning, setIsTabulationRunning] = useState(false);
  const [isOfficialResults, setIsOfficialResults] = useState(false);
  const [castVoteRecordFiles, setCastVoteRecordFiles] = useState<
    CastVoteRecordFile[]
  >([]);
  const [importedBallotIds, setImportedBallotIds] = useState<Set<string>>(
    new Set()
  );
  const [machineConfig, setMachineConfig] = useState<MachineConfig>({
    machineId: '0000',
    codeVersion: '',
  });

  const auth = useDippedSmartcardAuth({ cardApi: card, logger });
  const currentUserRole =
    auth.status === 'logged_in' ? auth.user.role : 'unknown';

  async function setStorageKeyAndLog(
    storageKey: string,
    value: unknown,
    logDescription: string
  ) {
    try {
      await storage.set(storageKey, value);
      await logger.log(LogEventId.SaveToStorage, currentUserRole, {
        message: `${logDescription} successfully saved to storage.`,
        storageKey,
        disposition: 'success',
      });
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(LogEventId.SaveToStorage, currentUserRole, {
        message: `Failed to save ${logDescription} to storage.`,
        storageKey,
        error: error.message,
        disposition: 'failure',
      });
    }
  }
  async function removeStorageKeyAndLog(
    storageKey: string,
    logDescription: string
  ) {
    try {
      await storage.remove(storageKey);
      await logger.log(LogEventId.SaveToStorage, currentUserRole, {
        message: `${logDescription} successfully cleared in storage.`,
        storageKey,
        disposition: 'success',
      });
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(LogEventId.SaveToStorage, currentUserRole, {
        message: `Failed to clear ${logDescription} in storage.`,
        storageKey,
        error: error.message,
        disposition: 'failure',
      });
    }
  }

  async function saveIsOfficialResults() {
    setIsOfficialResults(true);
    await logger.log(LogEventId.MarkedTallyResultsOfficial, currentUserRole, {
      message:
        'User has marked the tally results as official, no more Cvr files can be imported.',
      disposition: 'success',
    });
    await setStorageKeyAndLog(
      isOfficialResultsKey,
      true,
      'isOfficialResults flag'
    );
  }

  const [fullElectionTally, setFullElectionTally] = useState(
    getEmptyFullElectionTally()
  );

  const [fullElectionExternalTallies, setFullElectionExternalTallies] =
    useState<FullElectionExternalTally[]>([]);

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
  const [printedBallots, setPrintedBallots] = useState<
    PrintedBallot[] | undefined
  >(undefined);

  const getPrintedBallots = useCallback(async (): Promise<PrintedBallot[]> => {
    // TODO: validate this with zod schema
    return (
      ((await storage.get(printedBallotsStorageKey)) as
        | PrintedBallot[]
        | undefined) || []
    );
  }, [storage]);

  async function savePrintedBallots(printedBallotsToStore: PrintedBallot[]) {
    await setStorageKeyAndLog(
      printedBallotsStorageKey,
      printedBallotsToStore,
      'Printed ballot information'
    );
  }

  async function addPrintedBallot(printedBallot: PrintedBallot) {
    const ballots = await getPrintedBallots();
    ballots.push(printedBallot);
    await savePrintedBallots(ballots);
    setPrintedBallots(ballots);
  }

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
    void (async () => {
      if (!printedBallots) {
        setPrintedBallots(await getPrintedBallots());
      }
    })();
  }, [getPrintedBallots, printedBallots]);

  const computeVoteCounts = useCallback(
    (castVoteRecords: ReadonlySet<CastVoteRecord>) => {
      void logger.log(LogEventId.RecomputingTally, currentUserRole);
      assert(electionDefinition);
      setIsTabulationRunning(true);
      const fullTally = computeFullElectionTally(
        electionDefinition.election,
        castVoteRecords
      );
      setFullElectionTally(fullTally);
      setIsTabulationRunning(false);
    },
    [setFullElectionTally, electionDefinition, logger, currentUserRole]
  );

  const refreshCastVoteRecordFiles = useCallback(async () => {
    const response = await fetch('/admin/write-ins/cvr-files', {
      method: 'GET',
    });
    const cvrData = await response.json();
    const cvrFiles = cvrData.map((c: any) => {
      const data = JSON.parse(c);
      return typedAs<CastVoteRecordFile>({
        signature: data.signature,
        name: data.filename,
        exportTimestamp: moment(data.timestamp).toDate(),
        precinctIds: data.precinct_ids.split(','),
        scannerIds: data.scanner_ids.split(','),
        importedCvrCount: data.imported_cvr_count,
        duplicatedCvrCount: data.duplicated_cvr_count,
        isTestMode: data.contains_test_mode_cvrs === 'true',
      });
    });
    setCastVoteRecordFiles(cvrFiles);

    const ballotIdResponse = await fetch('/admin/write-ins/cvr-ballot-ids', {
      method: 'GET',
    });
    const ballotIds = await ballotIdResponse.json();
    setImportedBallotIds(new Set(ballotIds));
  }, []);

  useEffect(() => {
    async function updateTallies() {
      const cvrResponse = await fetch('/admin/write-ins/cvrs', {
        method: 'GET',
      });
      const cvrsJson = await cvrResponse.json();
      const cvrs = cvrsJson.map((c: string) => JSON.parse(c) as CastVoteRecord);
      computeVoteCounts(new Set(cvrs));
    }
    void updateTallies();
  }, [castVoteRecordFiles, computeVoteCounts]);

  useEffect(() => {
    void (async () => {
      if (!electionDefinition) {
        const storageElectionDefinition = await getElectionDefinition();
        if (storageElectionDefinition) {
          const configuredAtTime = (await storage.get(
            // TODO: validate this with zod schema
            configuredAtStorageKey
          )) as string | undefined;
          setElectionDefinition(storageElectionDefinition);
          setConfiguredAt(configuredAtTime);
          await logger.log(LogEventId.LoadFromStorage, 'system', {
            message:
              'Election definition automatically loaded into application from storage.',
            disposition: 'success',
            electionHash: storageElectionDefinition.electionHash,
            electionConfiguredAt: configuredAtTime,
          });
        }

        if (castVoteRecordFiles.length === 0) {
          await refreshCastVoteRecordFiles();
          const newIsOfficialResults = (await getIsOfficialResults()) || false;
          setIsOfficialResults(newIsOfficialResults);
          await logger.log(LogEventId.LoadFromStorage, 'system', {
            message:
              'Cast vote records automatically loaded into application from local storage.',
            disposition: 'success',
            numberOfCvrs: 0, // TODO cvrs.fileList.length,
            isOfficialResults: newIsOfficialResults,
          });
        }
        if (
          fullElectionExternalTallies.length === 0 &&
          storageElectionDefinition
        ) {
          const storageExternalTalliesJson = await getExternalElectionTallies();
          if (storageExternalTalliesJson) {
            const importedData = convertStorageStringToExternalTallies(
              storageExternalTalliesJson
            );
            setFullElectionExternalTallies(importedData);
            await logger.log(LogEventId.LoadFromStorage, 'system', {
              message:
                'External file format vote tally data automatically loaded into application from local storage.',
              disposition: 'success',
              importedTallyFileNames: importedData
                .map((d) => d.inputSourceName)
                .join(', '),
            });
          }
        }
      }
    })();
  }, [
    electionDefinition,
    fullElectionExternalTallies.length,
    refreshCastVoteRecordFiles,
    getElectionDefinition,
    getExternalElectionTallies,
    getIsOfficialResults,
    storage,
    logger,
    castVoteRecordFiles,
  ]);

  useEffect(() => {
    const totalBallots =
      fullElectionTally.overallTally.numberOfBallotsCounted +
      fullElectionExternalTallies.reduce(
        (previous, tally) =>
          previous + tally.overallTally.numberOfBallotsCounted,
        0
      );
    void logger.log(LogEventId.RecomputedTally, currentUserRole, {
      message: `Tally recomputed, there are now ${totalBallots} total ballots tallied.`,
      disposition: 'success',
      totalBallots,
    });
  }, [fullElectionTally, fullElectionExternalTallies, currentUserRole, logger]);

  async function saveExternalTallies(
    externalTallies: FullElectionExternalTally[]
  ) {
    setFullElectionExternalTallies(externalTallies);
    if (externalTallies.length > 0) {
      await setStorageKeyAndLog(
        externalVoteTalliesFileStorageKey,
        convertExternalTalliesToStorageString(externalTallies),
        'Imported tally data from external file formats'
      );
    } else {
      await removeStorageKeyAndLog(
        externalVoteTalliesFileStorageKey,
        'Imported tally data from external files'
      );
    }
  }

  async function clearCastVoteRecordFiles() {
    computeVoteCounts(new Set());
    await fetch('/admin/write-ins/cvrs/reset', { method: 'GET' });
    setCastVoteRecordFiles([]);
    await removeStorageKeyAndLog(
      isOfficialResultsKey,
      'isOfficialResults flag'
    );
    setIsOfficialResults(false);
  }

  const saveElection: SaveElection = useCallback(
    async (electionJson) => {
      const previousElection = electionDefinition;
      if (previousElection) {
        void logger.log(LogEventId.ElectionUnconfigured, currentUserRole, {
          disposition: LogDispositionStandardTypes.Success,
          previousElectionHash: previousElection.electionHash,
        });
      }
      // we set a new election definition, reset everything
      try {
        await storage.clear();
        await fetch('/admin/write-ins/cvrs/reset', { method: 'GET' });
        setCastVoteRecordFiles([]);
        await logger.log(LogEventId.SaveToStorage, currentUserRole, {
          message:
            'All current data in storage, including election definition, cast vote records, tallies, and printed ballot information cleared.',
          disposition: 'success',
        });
      } catch (error) {
        assert(error instanceof Error);
        await logger.log(LogEventId.SaveToStorage, currentUserRole, {
          message: 'Failed clearing all current data in storage.',
          disposition: 'failure',
          error: error.message,
        });
      }
      setIsOfficialResults(false);
      setFullElectionExternalTallies([]);
      setPrintedBallots([]);
      setElectionDefinition(undefined);

      if (electionJson) {
        const electionData = electionJson;
        const electionHash = sha256(electionData);
        const election = safeParseElection(electionData).unsafeUnwrap();

        if (!areVvsg2AuthFlowsEnabled() && auth.status === 'logged_out') {
          auth.bootstrapAuthenticatedAdminSession(electionHash);
        }

        setElectionDefinition({
          electionData,
          electionHash,
          election,
        });

        const newConfiguredAt = new Date().toISOString();
        setConfiguredAt(newConfiguredAt);

        await setStorageKeyAndLog(
          configuredAtStorageKey,
          newConfiguredAt,
          'Election configured at time'
        );
        await setStorageKeyAndLog(
          electionDefinitionStorageKey,
          {
            election,
            electionData,
            electionHash,
          },
          'Election Definition'
        );
        await logger.log(LogEventId.ElectionConfigured, currentUserRole, {
          disposition: LogDispositionStandardTypes.Success,
          newElectionHash: electionHash,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      electionDefinition,
      storage,
      setIsOfficialResults,
      setPrintedBallots,
      setElectionDefinition,
      setConfiguredAt,
    ]
  );

  function generateExportableTallies(): ExportableTallies {
    assert(electionDefinition);
    return getExportableTallies(
      fullElectionTally,
      fullElectionExternalTallies,
      electionDefinition.election
    );
  }

  async function resetFiles(fileType: ResultsFileType) {
    switch (fileType) {
      case ResultsFileType.CastVoteRecord:
        await logger.log(LogEventId.RemovedTallyFile, currentUserRole, {
          message: 'User removed all Cast vote record files.',
          fileType,
          disposition: 'success',
        });
        await clearCastVoteRecordFiles();
        break;
      case ResultsFileType.SEMS: {
        const newFiles = fullElectionExternalTallies.filter(
          (tally) => tally.source !== ExternalTallySourceType.SEMS
        );
        await logger.log(LogEventId.RemovedTallyFile, currentUserRole, {
          message: 'User removed all SEMS external tally files.',
          fileType,
          disposition: 'success',
        });
        await saveExternalTallies(newFiles);
        break;
      }
      case ResultsFileType.Manual: {
        const newFiles = fullElectionExternalTallies.filter(
          (tally) => tally.source !== ExternalTallySourceType.Manual
        );
        await logger.log(LogEventId.RemovedTallyFile, currentUserRole, {
          message: 'User removed all manually entered tally data.',
          fileType,
          disposition: 'success',
        });
        await saveExternalTallies(newFiles);
        break;
      }
      case ResultsFileType.All:
        await logger.log(LogEventId.RemovedTallyFile, currentUserRole, {
          message: 'User removed all tally data.',
          fileType,
          disposition: 'success',
        });
        await clearCastVoteRecordFiles();
        await saveExternalTallies([]);
        break;
      default:
        throwIllegalValue(fileType);
    }
  }

  return (
    <AppContext.Provider
      value={{
        electionDefinition,
        configuredAt,
        converter,
        isOfficialResults,
        printer,
        printBallotRef,
        refreshCastVoteRecordFiles,
        saveElection,
        saveIsOfficialResults,
        resetFiles,
        usbDriveStatus: displayUsbStatus,
        usbDriveEject: usbDrive.eject,
        printedBallots: printedBallots || [],
        addPrintedBallot,
        fullElectionTally,
        setFullElectionTally,
        fullElectionExternalTallies,
        saveExternalTallies,
        saveTranscribedValue,
        isTabulationRunning,
        setIsTabulationRunning,
        generateExportableTallies,
        auth,
        machineConfig,
        hasCardReaderAttached: !!cardReader,
        logger,
        castVoteRecordFiles,
        importedBallotIds,
      }}
    >
      <ElectionManager />
      <div ref={printBallotRef} />
    </AppContext.Provider>
  );
}
