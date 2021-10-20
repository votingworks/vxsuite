import { strict as assert } from 'assert';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RouteComponentProps } from 'react-router-dom';
import 'normalize.css';
import { sha256 } from 'js-sha256';

import {
  ElectionDefinition,
  parseElection,
  safeParseElection,
  FullElectionExternalTally,
  ExternalTallySourceType,
  Provider,
} from '@votingworks/types';

import {
  Storage,
  throwIllegalValue,
  usbstick,
  Printer,
  Card,
  Hardware,
} from '@votingworks/utils';
import { useSmartcard, useUsbDrive, useUserSession } from '@votingworks/ui';
import {
  computeFullElectionTally,
  getEmptyFullElectionTally,
} from './lib/votecounting';

import AppContext from './contexts/AppContext';

import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from './utils/CastVoteRecordFiles';

import ElectionManager from './components/ElectionManager';
import {
  SaveElection,
  PrintedBallot,
  ISO8601Timestamp,
  CastVoteRecordLists,
  ExportableTallies,
  ResultsFileType,
  MachineConfig,
} from './config/types';
import { getExportableTallies } from './utils/exportableTallies';
import {
  convertExternalTalliesToStorageString,
  convertStorageStringToExternalTallies,
} from './utils/externalTallies';

export interface AppStorage {
  electionDefinition?: ElectionDefinition;
  cvrFiles?: string;
  isOfficialResults?: boolean;
  printedBallots?: PrintedBallot[];
  configuredAt?: ISO8601Timestamp;
  externalVoteTallies?: string;
}

export interface Props extends RouteComponentProps {
  storage: Storage;
  printer: Printer;
  hardware: Hardware;
  card: Card;
  machineConfigProvider: Provider<MachineConfig>;
}

export const electionDefinitionStorageKey = 'electionDefinition';
export const cvrsStorageKey = 'cvrFiles';
export const isOfficialResultsKey = 'isOfficialResults';
export const printedBallotsStorageKey = 'printedBallots';
export const configuredAtStorageKey = 'configuredAt';
export const externalVoteTalliesFileStorageKey = 'externalVoteTallies';

function AppRoot({
  storage,
  printer,
  card,
  hardware,
  machineConfigProvider,
}: Props): JSX.Element {
  const printBallotRef = useRef<HTMLDivElement>(null);

  const getElectionDefinition = useCallback(async (): Promise<
    ElectionDefinition | undefined
  > => {
    // TODO: validate this with zod schema
    const electionDefinition = (await storage.get(
      electionDefinitionStorageKey
    )) as ElectionDefinition | undefined;

    if (electionDefinition) {
      const { electionData, electionHash } = electionDefinition;
      assert.equal(sha256(electionData), electionHash);
      return electionDefinition;
    }
  }, [storage]);

  const getCVRFiles = useCallback(
    async (): Promise<string | undefined> =>
      // TODO: validate this with zod schema
      (await storage.get(cvrsStorageKey)) as string | undefined,
    [storage]
  );
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

  const [
    electionDefinition,
    setElectionDefinition,
  ] = useState<ElectionDefinition>();
  const [configuredAt, setConfiguredAt] = useState<ISO8601Timestamp>('');

  const [castVoteRecordFiles, setCastVoteRecordFiles] = useState(
    CastVoteRecordFiles.empty
  );
  const [isTabulationRunning, setIsTabulationRunning] = useState(false);
  const [isOfficialResults, setIsOfficialResults] = useState(false);

  async function saveIsOfficialResults() {
    setIsOfficialResults(true);
    await storage.set(isOfficialResultsKey, true);
  }

  const [fullElectionTally, setFullElectionTally] = useState(
    getEmptyFullElectionTally()
  );

  const [
    fullElectionExternalTallies,
    setFullElectionExternalTallies,
  ] = useState<FullElectionExternalTally[]>([]);

  const [machineConfig, setMachineConfig] = useState<MachineConfig>({
    machineId: '0000',
    bypassAuthentication: false,
    codeVersion: '',
  });

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

  const usbDrive = useUsbDrive();
  const displayUsbStatus = usbDrive.status ?? usbstick.UsbDriveStatus.absent;

  const [smartcard, hasCardReaderAttached] = useSmartcard({ card, hardware });
  const {
    currentUserSession,
    attemptToAuthenticateAdminUser,
    lockMachine,
    bootstrapAuthenticatedAdminSession,
  } = useUserSession({
    smartcard,
    electionDefinition,
    persistAuthentication: true,
    bypassAuthentication: machineConfig.bypassAuthentication,
  });
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
    return await storage.set(printedBallotsStorageKey, printedBallotsToStore);
  }

  async function addPrintedBallot(printedBallot: PrintedBallot) {
    const ballots = await getPrintedBallots();
    ballots.push(printedBallot);
    await savePrintedBallots(ballots);
    setPrintedBallots(ballots);
  }

  useEffect(() => {
    void (async () => {
      if (!printedBallots) {
        setPrintedBallots(await getPrintedBallots());
      }
    })();
  }, [getPrintedBallots, printedBallots]);

  useEffect(() => {
    void (async () => {
      if (!electionDefinition) {
        const storageElectionDefinition = await getElectionDefinition();
        if (storageElectionDefinition) {
          setElectionDefinition(storageElectionDefinition);
          setConfiguredAt(
            // TODO: validate this with zod schema
            ((await storage.get(configuredAtStorageKey)) as
              | string
              | undefined) || ''
          );
        }

        if (castVoteRecordFiles === CastVoteRecordFiles.empty) {
          const storageCVRFiles = await getCVRFiles();
          if (storageCVRFiles) {
            setCastVoteRecordFiles(CastVoteRecordFiles.import(storageCVRFiles));
            setIsOfficialResults((await getIsOfficialResults()) || false);
          }
        }

        if (
          fullElectionExternalTallies.length === 0 &&
          storageElectionDefinition
        ) {
          const storageExternalTalliesJSON = await getExternalElectionTallies();
          if (storageExternalTalliesJSON) {
            const importedData = convertStorageStringToExternalTallies(
              storageExternalTalliesJSON
            );
            setFullElectionExternalTallies(importedData);
          }
        }
      }
    })();
  }, [
    castVoteRecordFiles,
    electionDefinition,
    fullElectionExternalTallies.length,
    getCVRFiles,
    getElectionDefinition,
    getExternalElectionTallies,
    getIsOfficialResults,
    storage,
  ]);

  const computeVoteCounts = useCallback(
    (castVoteRecords: CastVoteRecordLists) => {
      assert(electionDefinition);
      setIsTabulationRunning(true);
      const fullTally = computeFullElectionTally(
        electionDefinition.election,
        castVoteRecords
      );
      setFullElectionTally(fullTally);
      setIsTabulationRunning(false);
    },
    [setFullElectionTally, electionDefinition]
  );

  useEffect(() => {
    if (electionDefinition) {
      computeVoteCounts(castVoteRecordFiles.castVoteRecords);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeVoteCounts, castVoteRecordFiles]);

  async function saveExternalTallies(
    externalTallies: FullElectionExternalTally[]
  ) {
    setFullElectionExternalTallies(externalTallies);
    if (externalTallies.length > 0) {
      await storage.set(
        externalVoteTalliesFileStorageKey,
        convertExternalTalliesToStorageString(externalTallies)
      );
    } else {
      await storage.remove(externalVoteTalliesFileStorageKey);
    }
  }

  const saveCastVoteRecordFiles: SaveCastVoteRecordFiles = async (
    newCVRFiles = CastVoteRecordFiles.empty
  ) => {
    setCastVoteRecordFiles(newCVRFiles);
    if (newCVRFiles === CastVoteRecordFiles.empty) {
      setIsOfficialResults(false);
    }

    if (newCVRFiles === CastVoteRecordFiles.empty) {
      await storage.remove(cvrsStorageKey);
      await storage.remove(isOfficialResultsKey);
      setIsOfficialResults(false);
    } else {
      await storage.set(cvrsStorageKey, newCVRFiles.export());
    }
  };

  const saveElection: SaveElection = useCallback(
    async (electionJSON) => {
      // we set a new election definition, reset everything
      await storage.clear();
      setIsOfficialResults(false);
      setCastVoteRecordFiles(CastVoteRecordFiles.empty);
      setFullElectionExternalTallies([]);
      setPrintedBallots([]);
      setElectionDefinition(undefined);

      if (electionJSON) {
        const electionData = electionJSON;
        const electionHash = sha256(electionData);
        const election = safeParseElection(electionData).unsafeUnwrap();

        setElectionDefinition({
          electionData,
          electionHash,
          election,
        });

        const newConfiguredAt = new Date().toISOString();
        setConfiguredAt(newConfiguredAt);
        // Temporarily bootstrap an authenticated user session. This will be removed
        // once we have a full story for how to bootstrap the auth process.
        bootstrapAuthenticatedAdminSession();

        await storage.set(configuredAtStorageKey, newConfiguredAt);
        await storage.set(electionDefinitionStorageKey, {
          election,
          electionData,
          electionHash,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      storage,
      setIsOfficialResults,
      setCastVoteRecordFiles,
      setPrintedBallots,
      setElectionDefinition,
      parseElection,
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
        await saveCastVoteRecordFiles();
        break;
      case ResultsFileType.SEMS: {
        const newFiles = fullElectionExternalTallies.filter(
          (tally) => tally.source !== ExternalTallySourceType.SEMS
        );
        await saveExternalTallies(newFiles);
        break;
      }
      case ResultsFileType.Manual: {
        const newFiles = fullElectionExternalTallies.filter(
          (tally) => tally.source !== ExternalTallySourceType.Manual
        );
        await saveExternalTallies(newFiles);
        break;
      }
      case ResultsFileType.All:
        await saveCastVoteRecordFiles();
        await saveExternalTallies([]);
        break;
      default:
        throwIllegalValue(fileType);
    }
  }

  return (
    <AppContext.Provider
      value={{
        castVoteRecordFiles,
        electionDefinition,
        configuredAt,
        isOfficialResults,
        printer,
        printBallotRef,
        saveCastVoteRecordFiles,
        saveElection,
        saveIsOfficialResults,
        setCastVoteRecordFiles,
        resetFiles,
        usbDriveStatus: displayUsbStatus,
        usbDriveEject: usbDrive.eject,
        printedBallots: printedBallots || [],
        addPrintedBallot,
        fullElectionTally,
        setFullElectionTally,
        fullElectionExternalTallies,
        saveExternalTallies,
        isTabulationRunning,
        setIsTabulationRunning,
        generateExportableTallies,
        currentUserSession,
        attemptToAuthenticateAdminUser,
        lockMachine,
        machineConfig,
        hasCardReaderAttached,
      }}
    >
      <ElectionManager />
      <div ref={printBallotRef} />
    </AppContext.Provider>
  );
}

export default AppRoot;
