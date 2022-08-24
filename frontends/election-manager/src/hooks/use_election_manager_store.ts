import {
  LogDispositionStandardTypes,
  LogEventId,
  Logger,
  LoggingUserRole,
} from '@votingworks/logging';
import {
  ElectionDefinition,
  FullElectionExternalTally,
  Iso8601Timestamp,
  Iso8601TimestampSchema,
  safeParse,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { assert, Storage, typedAs } from '@votingworks/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { PrintedBallot, PrintedBallotSchema } from '../config/types';
import { CastVoteRecordFiles } from '../utils/cast_vote_record_files';
import {
  convertExternalTalliesToStorageString,
  convertStorageStringToExternalTallies,
} from '../utils/external_tallies';

type LoadState = 'init' | 'loading' | 'loaded' | 'error';

interface ElectionManagerStore {
  /**
   * What loading state is the store in?
   */
  readonly loadState: LoadState;

  /**
   * Any error that occurred while loading from storage.
   */
  readonly loadError?: Error;

  /**
   * The currently configured election definition.
   */
  readonly electionDefinition?: ElectionDefinition;

  /**
   * The time at which the election definition was configured.
   */
  readonly configuredAt?: Iso8601Timestamp;

  /**
   * The current set of loaded cast vote record files.
   */
  readonly castVoteRecordFiles: CastVoteRecordFiles;

  /**
   * Whether the results have been marked as official.
   */
  readonly isOfficialResults: boolean;

  /**
   * Information about the ballots that have been printed.
   */
  readonly printedBallots: readonly PrintedBallot[];

  /**
   * Tallies from external sources, e.g. SEMS or manually entered tallies.
   */
  readonly fullElectionExternalTallies: readonly FullElectionExternalTally[];

  /**
   * Reloads all data from storage.
   */
  reload(): Promise<void>;

  /**
   * Resets all stored data, including the election definition and CVRs.
   */
  reset(): Promise<void>;

  /**
   * Configures with a new election definition after resetting.
   *
   * @param newElectionData election definition as JSON string
   */
  configure(newElectionData?: string): Promise<void>;

  /**
   * Overwrites the existing cast vote record files with the given ones.
   */
  setCastVoteRecordFiles(
    newCastVoteRecordFiles: CastVoteRecordFiles
  ): Promise<void>;

  /**
   * Resets all cast vote record files.
   */
  clearCastVoteRecordFiles(): Promise<void>;

  /**
   * Adds an external tally to the list.
   */
  addFullElectionExternalTally(
    newFullElectionExternalTally: FullElectionExternalTally
  ): Promise<void>;

  /**
   * Replaces all external tallies with the given ones.
   */
  setFullElectionExternalTallies(
    newFullElectionExternalTallies: readonly FullElectionExternalTally[]
  ): Promise<void>;

  /**
   * Marks the results as official. No more tallies can be added after this.
   */
  markResultsOfficial(): Promise<void>;

  /**
   * Adds a new printed ballot to the list.
   */
  addPrintedBallot(printedBallot: PrintedBallot): Promise<void>;

  /**
   * Sets the current user's role, i.e. the person taking action.
   */
  setCurrentUserRole(newCurrentUserRole: LoggingUserRole): void;
}

interface Props {
  logger: Logger;
  storage: Storage;
}

interface StoreState {
  electionDefinition?: ElectionDefinition;
  configuredAt?: string;
  isOfficialResults?: boolean;
  castVoteRecordFiles?: CastVoteRecordFiles;
  fullElectionExternalTallies?: FullElectionExternalTally[];
  printedBallots?: PrintedBallot[];
}

export const electionDefinitionStorageKey = 'electionDefinition';
export const cvrsStorageKey = 'cvrFiles';
export const isOfficialResultsKey = 'isOfficialResults';
export const printedBallotsStorageKey = 'printedBallots';
export const configuredAtStorageKey = 'configuredAt';
export const externalVoteTalliesFileStorageKey = 'externalVoteTallies';

/**
 * Manages the stored data for VxAdmin.
 */
export function useElectionManagerStore({
  logger,
  storage,
}: Props): ElectionManagerStore {
  // Loading state is stored in refs to avoid re-rendering.
  const loadStateRef = useRef<LoadState>('init');
  const loadErrorRef = useRef<Error | undefined>();

  // All state is store together to make resets and bulk updates easier.
  const [state, setState] = useState<StoreState>({});

  const updateState = useCallback((updates: Partial<StoreState>) => {
    setState((prevState) => ({
      ...prevState,
      ...updates,
    }));
  }, []);

  const currentUserRoleRef = useRef<LoggingUserRole>('unknown');

  const loadPrintedBallots = useCallback(async (): Promise<
    PrintedBallot[] | undefined
  > => {
    const parseResult = safeParse(
      z.array(PrintedBallotSchema),
      await storage.get(printedBallotsStorageKey)
    );

    if (parseResult.isErr()) {
      await logger.log(LogEventId.LoadFromStorage, currentUserRoleRef.current, {
        message: 'Failed to parse printed ballots from storage',
        disposition: 'failure',
        storageKey: printedBallotsStorageKey,
        error: parseResult.err().message,
      });
      return;
    }

    const printedBallots = parseResult.ok();

    await logger.log(LogEventId.LoadFromStorage, currentUserRoleRef.current, {
      message: 'Printed ballots automatically loaded from storage',
      disposition: 'success',
      storageKey: printedBallotsStorageKey,
      totalCount: printedBallots.reduce(
        (count, printedBallot) => count + printedBallot.numCopies,
        0
      ),
    });

    return printedBallots;
  }, [logger, storage]);

  const loadElectionDefinition = useCallback(async (): Promise<
    ElectionDefinition | undefined
  > => {
    const loadedElectionDefinition = (await storage.get(
      electionDefinitionStorageKey
    )) as ElectionDefinition | undefined;

    if (loadedElectionDefinition) {
      const parseResult = safeParseElectionDefinition(
        loadedElectionDefinition.electionData
      );

      if (parseResult.isErr()) {
        await logger.log(LogEventId.LoadFromStorage, 'system', {
          message: 'Error parsing election definition from storage',
          disposition: 'failure',
          storageKey: electionDefinitionStorageKey,
          error: parseResult.err().message,
        });
        return;
      }

      const parsedElectionDefinition = parseResult.ok();

      if (
        parsedElectionDefinition.electionHash !==
        loadedElectionDefinition.electionHash
      ) {
        await logger.log(LogEventId.LoadFromStorage, 'system', {
          message: 'Election definition hash mismatch',
          disposition: 'failure',
          storageKey: electionDefinitionStorageKey,
          expectedElectionHash: loadedElectionDefinition.electionHash,
          actualElectionHash: parsedElectionDefinition.electionHash,
        });
        return;
      }

      await logger.log(LogEventId.LoadFromStorage, currentUserRoleRef.current, {
        message: 'Election definition automatically loaded from storage',
        disposition: 'success',
        storageKey: electionDefinitionStorageKey,
        electionHash: parsedElectionDefinition.electionHash,
      });

      return parsedElectionDefinition;
    }
  }, [logger, storage]);

  const loadConfiguredAt = useCallback(async (): Promise<
    string | undefined
  > => {
    const parseResult = safeParse(
      Iso8601TimestampSchema.optional(),
      await storage.get(configuredAtStorageKey)
    );

    if (parseResult.isErr()) {
      await logger.log(LogEventId.LoadFromStorage, 'system', {
        message: 'Error parsing configuredAt from storage',
        disposition: 'failure',
        storageKey: configuredAtStorageKey,
        error: parseResult.err().message,
      });
      return;
    }

    const configuredAt = parseResult.ok();

    await logger.log(LogEventId.LoadFromStorage, 'system', {
      message: 'Configuration timestamp automatically loaded from storage',
      disposition: 'success',
      storageKey: configuredAtStorageKey,
      configuredAt,
    });

    return configuredAt;
  }, [logger, storage]);

  const loadCastVoteRecordFiles = useCallback(async (): Promise<
    CastVoteRecordFiles | undefined
  > => {
    const serializedCvrFiles = safeParse(
      z.string().optional(),
      await storage.get(cvrsStorageKey)
    ).ok();

    if (serializedCvrFiles) {
      const cvrs = CastVoteRecordFiles.import(serializedCvrFiles);
      await logger.log(LogEventId.LoadFromStorage, 'system', {
        message:
          'Cast vote records automatically loaded into application from local storage.',
        disposition: 'success',
        numberOfCvrs: cvrs.fileList.length,
      });
      return cvrs;
    }
  }, [logger, storage]);

  const loadExternalElectionTallies = useCallback(async (): Promise<
    FullElectionExternalTally[] | undefined
  > => {
    const serializedExternalTallies = safeParse(
      z.string().optional(),
      await storage.get(externalVoteTalliesFileStorageKey)
    ).ok();

    if (serializedExternalTallies) {
      const importedData = convertStorageStringToExternalTallies(
        serializedExternalTallies
      );
      await logger.log(LogEventId.LoadFromStorage, 'system', {
        message:
          'External file format vote tally data automatically loaded into application from local storage.',
        disposition: 'success',
        importedTallyFileNames: importedData
          .map((d) => d.inputSourceName)
          .join(', '),
      });
      return importedData;
    }
  }, [logger, storage]);

  const loadIsOfficialResults = useCallback(async (): Promise<
    boolean | undefined
  > => {
    const parseResult = safeParse(
      z.boolean(),
      await storage.get(isOfficialResultsKey)
    );

    if (parseResult.isErr()) {
      await logger.log(LogEventId.LoadFromStorage, 'system', {
        message: 'Error parsing official results flag from storage',
        disposition: 'failure',
        storageKey: isOfficialResultsKey,
        error: parseResult.err().message,
      });
      return undefined;
    }

    const isOfficialResults = parseResult.ok();

    await logger.log(LogEventId.LoadFromStorage, 'system', {
      message:
        'Official results flag automatically loaded into application from local storage.',
      disposition: 'success',
      storageKey: isOfficialResultsKey,
      isOfficialResults,
    });

    return isOfficialResults;
  }, [logger, storage]);

  const setStorageKeyAndLog = useCallback(
    async (storageKey: string, value: unknown, logDescription: string) => {
      try {
        await storage.set(storageKey, value);
        await logger.log(LogEventId.SaveToStorage, currentUserRoleRef.current, {
          message: `${logDescription} successfully saved to storage.`,
          storageKey,
          disposition: 'success',
        });
      } catch (error) {
        assert(error instanceof Error);
        await logger.log(LogEventId.SaveToStorage, currentUserRoleRef.current, {
          message: `Failed to save ${logDescription} to storage.`,
          storageKey,
          error: error.message,
          disposition: 'failure',
        });
      }
    },
    [logger, storage]
  );

  const removeStorageKeyAndLog = useCallback(
    async (storageKey: string, logDescription: string) => {
      try {
        await storage.remove(storageKey);
        await logger.log(LogEventId.SaveToStorage, currentUserRoleRef.current, {
          message: `${logDescription} successfully cleared in storage.`,
          storageKey,
          disposition: 'success',
        });
      } catch (error) {
        assert(error instanceof Error);
        await logger.log(LogEventId.SaveToStorage, currentUserRoleRef.current, {
          message: `Failed to clear ${logDescription} in storage.`,
          storageKey,
          error: error.message,
          disposition: 'failure',
        });
      }
    },
    [logger, storage]
  );

  const reload = useCallback(async () => {
    if (loadStateRef.current === 'loading') {
      return;
    }
    loadStateRef.current = 'loading';
    loadErrorRef.current = undefined;

    try {
      const castVoteRecordFiles = await loadCastVoteRecordFiles();
      const configuredAt = await loadConfiguredAt();
      const electionDefinition = await loadElectionDefinition();
      const fullElectionExternalTallies = await loadExternalElectionTallies();
      const isOfficialResults = await loadIsOfficialResults();
      const printedBallots = await loadPrintedBallots();

      loadStateRef.current = 'loaded';
      updateState({
        castVoteRecordFiles,
        configuredAt,
        electionDefinition,
        fullElectionExternalTallies,
        isOfficialResults,
        printedBallots,
      });
    } catch (error) {
      assert(error instanceof Error);
      loadStateRef.current = 'error';
      loadErrorRef.current = error;
    }
  }, [
    loadCastVoteRecordFiles,
    loadConfiguredAt,
    loadElectionDefinition,
    loadExternalElectionTallies,
    loadIsOfficialResults,
    loadPrintedBallots,
    updateState,
  ]);

  useEffect(() => {
    if (loadStateRef.current === 'init') {
      void reload();
    }
  }, [reload]);

  const reset = useCallback(async () => {
    const previousElection = state.electionDefinition;
    if (previousElection) {
      void logger.log(
        LogEventId.ElectionUnconfigured,
        currentUserRoleRef.current,
        {
          disposition: LogDispositionStandardTypes.Success,
          previousElectionHash: previousElection.electionHash,
        }
      );
    }
    // we set a new election definition, reset everything
    try {
      await storage.clear();
      await logger.log(LogEventId.SaveToStorage, currentUserRoleRef.current, {
        message:
          'All current data in storage, including election definition, cast vote records, tallies, and printed ballot information cleared.',
        disposition: 'success',
      });
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(LogEventId.SaveToStorage, currentUserRoleRef.current, {
        message: 'Failed clearing all current data in storage.',
        disposition: 'failure',
        error: error.message,
      });
    }
    loadStateRef.current = 'init';
    await reload();
  }, [logger, reload, state.electionDefinition, storage]);

  const configure = useCallback(
    async (newElectionData?: string): Promise<void> => {
      await reset();
      if (!newElectionData) {
        return;
      }

      loadStateRef.current = 'loading';
      const newElectionDefinition =
        safeParseElectionDefinition(newElectionData).unsafeUnwrap();
      const newConfiguredAt = new Date().toISOString();

      await setStorageKeyAndLog(
        electionDefinitionStorageKey,
        newElectionDefinition,
        'Election Definition'
      );
      await setStorageKeyAndLog(
        configuredAtStorageKey,
        newConfiguredAt,
        'Election configured at time'
      );

      setState({
        electionDefinition: newElectionDefinition,
        configuredAt: newConfiguredAt,
      });

      await logger.log(
        LogEventId.ElectionConfigured,
        currentUserRoleRef.current,
        {
          disposition: LogDispositionStandardTypes.Success,
          newElectionHash: newElectionDefinition.electionHash,
        }
      );
    },
    [logger, reset, setStorageKeyAndLog]
  );

  const setCastVoteRecordFiles = useCallback(
    async (newCastVoteRecordFiles) => {
      if (newCastVoteRecordFiles === CastVoteRecordFiles.empty) {
        await fetch('/admin/write-ins/cvrs', { method: 'DELETE' });
        await removeStorageKeyAndLog(cvrsStorageKey, 'Cast vote records');
        await removeStorageKeyAndLog(
          isOfficialResultsKey,
          'isOfficialResults flag'
        );
        updateState({
          castVoteRecordFiles: newCastVoteRecordFiles,
          isOfficialResults: false,
        });
      } else {
        await setStorageKeyAndLog(
          cvrsStorageKey,
          newCastVoteRecordFiles.export(),
          'Cast vote records'
        );
        await fetch('/admin/write-ins/cvrs', {
          method: 'POST',
          body: newCastVoteRecordFiles.export(),
          headers: {
            'Content-Type': 'application/json',
          },
        });
        updateState({ castVoteRecordFiles: newCastVoteRecordFiles });
      }
    },
    [removeStorageKeyAndLog, setStorageKeyAndLog, updateState]
  );

  const clearCastVoteRecordFiles = useCallback(async () => {
    await setCastVoteRecordFiles(CastVoteRecordFiles.empty);
  }, [setCastVoteRecordFiles]);

  const markResultsOfficial = useCallback(async () => {
    updateState({ isOfficialResults: true });
    await logger.log(
      LogEventId.MarkedTallyResultsOfficial,
      currentUserRoleRef.current,
      {
        message:
          'User has marked the tally results as official, no more Cvr files can be loaded.',
        disposition: 'success',
      }
    );
    await setStorageKeyAndLog(
      isOfficialResultsKey,
      true,
      'isOfficialResults flag'
    );
  }, [logger, setStorageKeyAndLog, updateState]);

  const addPrintedBallot = useCallback(
    async (newPrintedBallot) => {
      const newPrintedBallots = [
        ...(state.printedBallots ?? []),
        newPrintedBallot,
      ];
      await setStorageKeyAndLog(
        printedBallotsStorageKey,
        newPrintedBallots,
        'Printed ballot information'
      );
      updateState({ printedBallots: newPrintedBallots });
    },
    [setStorageKeyAndLog, state.printedBallots, updateState]
  );

  const addFullElectionExternalTally = useCallback(
    async (newFullElectionExternalTally) => {
      const newFullElectionExternalTallies = [
        ...(state.fullElectionExternalTallies ?? []),
        newFullElectionExternalTally,
      ];
      if (newFullElectionExternalTallies.length > 0) {
        await setStorageKeyAndLog(
          externalVoteTalliesFileStorageKey,
          convertExternalTalliesToStorageString(newFullElectionExternalTallies),
          'Loaded tally data from external file formats'
        );
      } else {
        await removeStorageKeyAndLog(
          externalVoteTalliesFileStorageKey,
          'Loaded tally data from external files'
        );
      }
      updateState({
        fullElectionExternalTallies: newFullElectionExternalTallies,
      });
    },
    [
      state.fullElectionExternalTallies,
      updateState,
      setStorageKeyAndLog,
      removeStorageKeyAndLog,
    ]
  );

  const setFullElectionExternalTallies = useCallback(
    async (newFullElectionExternalTallies) => {
      if (newFullElectionExternalTallies.length > 0) {
        await setStorageKeyAndLog(
          externalVoteTalliesFileStorageKey,
          convertExternalTalliesToStorageString(newFullElectionExternalTallies),
          'Loaded tally data from external file formats'
        );
      } else {
        await removeStorageKeyAndLog(
          externalVoteTalliesFileStorageKey,
          'Loaded tally data from external files'
        );
      }
      updateState({
        fullElectionExternalTallies: newFullElectionExternalTallies,
      });
    },
    [removeStorageKeyAndLog, setStorageKeyAndLog, updateState]
  );

  const setCurrentUserRole = useCallback((newCurrentUserRole) => {
    currentUserRoleRef.current = newCurrentUserRole;
  }, []);

  return useMemo(
    () =>
      typedAs<ElectionManagerStore>({
        loadState: loadStateRef.current,
        loadError: loadErrorRef.current,

        castVoteRecordFiles:
          state.castVoteRecordFiles ?? CastVoteRecordFiles.empty,
        configuredAt: state.configuredAt,
        electionDefinition: state.electionDefinition,
        fullElectionExternalTallies: state.fullElectionExternalTallies ?? [],
        isOfficialResults: state.isOfficialResults ?? false,
        printedBallots: state.printedBallots ?? [],

        addFullElectionExternalTally,
        addPrintedBallot,
        clearCastVoteRecordFiles,
        configure,
        markResultsOfficial,
        reload,
        reset,
        setCastVoteRecordFiles,
        setCurrentUserRole,
        setFullElectionExternalTallies,
      }),
    [
      addFullElectionExternalTally,
      addPrintedBallot,
      clearCastVoteRecordFiles,
      configure,
      markResultsOfficial,
      reload,
      reset,
      setCastVoteRecordFiles,
      setCurrentUserRole,
      setFullElectionExternalTallies,
      state.castVoteRecordFiles,
      state.configuredAt,
      state.electionDefinition,
      state.fullElectionExternalTallies,
      state.isOfficialResults,
      state.printedBallots,
    ]
  );
}
