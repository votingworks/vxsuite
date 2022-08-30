import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useCallback, useMemo, useRef } from 'react';
import { z } from 'zod';
import { PrintedBallot, PrintedBallotSchema } from '../config/types';
import { CastVoteRecordFiles } from '../utils/cast_vote_record_files';
import {
  convertExternalTalliesToStorageString,
  convertStorageStringToExternalTallies,
} from '../utils/external_tallies';

interface ElectionManagerStore {
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
  const queryClient = useQueryClient();
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

  const getPrintedBallotsQuery = useQuery<PrintedBallot[]>(
    [printedBallotsStorageKey],
    async () => {
      return (await loadPrintedBallots()) ?? [];
    }
  );
  const printedBallots = getPrintedBallotsQuery.data;

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

  const getElectionDefinitionQuery = useQuery<ElectionDefinition | null>(
    [electionDefinitionStorageKey],
    async () => {
      // Return `null` if there is no election definition because `react-query`
      // does not allow returning `undefined` for query results.
      return (await loadElectionDefinition()) ?? null;
    }
  );
  const electionDefinition = getElectionDefinitionQuery.data ?? undefined;

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

  const getConfiguredAtQuery = useQuery<string | null>(
    [configuredAtStorageKey],
    async () => {
      // Return `null` if there is no timestamp because `react-query` does not
      // allow returning `undefined` for query results.
      return (await loadConfiguredAt()) ?? null;
    }
  );
  const configuredAt = getConfiguredAtQuery.data ?? undefined;

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

  const getCastVoteRecordFilesQuery = useQuery<CastVoteRecordFiles>(
    [cvrsStorageKey],
    async () => {
      return (await loadCastVoteRecordFiles()) ?? CastVoteRecordFiles.empty;
    }
  );
  const castVoteRecordFiles = getCastVoteRecordFilesQuery.data;

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

  const getExternalElectionTalliesQuery = useQuery<FullElectionExternalTally[]>(
    [externalVoteTalliesFileStorageKey],
    async () => {
      return (await loadExternalElectionTallies()) ?? [];
    }
  );
  const fullElectionExternalTallies = getExternalElectionTalliesQuery.data;

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

  const getIsOfficialResultsQuery = useQuery<boolean>(
    [isOfficialResultsKey],
    async () => {
      return (await loadIsOfficialResults()) ?? false;
    }
  );
  const isOfficialResults = getIsOfficialResultsQuery.data;

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

  const reset = useCallback(async () => {
    const previousElection = electionDefinition;
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
    void queryClient.invalidateQueries([electionDefinitionStorageKey]);
    void queryClient.invalidateQueries([cvrsStorageKey]);
    void queryClient.invalidateQueries([externalVoteTalliesFileStorageKey]);
    void queryClient.invalidateQueries([isOfficialResultsKey]);
    void queryClient.invalidateQueries([printedBallotsStorageKey]);
  }, [electionDefinition, logger, queryClient, storage]);

  const configure = useCallback(
    async (newElectionData?: string): Promise<void> => {
      await reset();

      if (!newElectionData) {
        return;
      }

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

      await queryClient.invalidateQueries([electionDefinitionStorageKey]);
      await queryClient.invalidateQueries([configuredAtStorageKey]);

      await logger.log(
        LogEventId.ElectionConfigured,
        currentUserRoleRef.current,
        {
          disposition: LogDispositionStandardTypes.Success,
          newElectionHash: newElectionDefinition.electionHash,
        }
      );
    },
    [logger, queryClient, reset, setStorageKeyAndLog]
  );

  const setCastVoteRecordFilesMutation = useMutation(
    async (newCastVoteRecordFiles: CastVoteRecordFiles) => {
      if (newCastVoteRecordFiles === CastVoteRecordFiles.empty) {
        await fetch('/admin/write-ins/cvrs', { method: 'DELETE' });
        await removeStorageKeyAndLog(cvrsStorageKey, 'Cast vote records');
        await removeStorageKeyAndLog(
          isOfficialResultsKey,
          'isOfficialResults flag'
        );
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
      }
    },
    {
      onSuccess(data, newCastVoteRecordFiles) {
        void queryClient.invalidateQueries([cvrsStorageKey]);
        if (newCastVoteRecordFiles === CastVoteRecordFiles.empty) {
          void queryClient.invalidateQueries([isOfficialResultsKey]);
        }
      },
    }
  );

  const setCastVoteRecordFiles = useCallback(
    async (newCastVoteRecordFiles: CastVoteRecordFiles) => {
      await setCastVoteRecordFilesMutation.mutateAsync(newCastVoteRecordFiles);
    },
    [setCastVoteRecordFilesMutation]
  );

  const clearCastVoteRecordFiles = useCallback(async () => {
    await setCastVoteRecordFiles(CastVoteRecordFiles.empty);
  }, [setCastVoteRecordFiles]);

  const markResultsOfficialMutation = useMutation(
    async () => {
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
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([isOfficialResultsKey]);
      },
    }
  );

  const markResultsOfficial = useCallback(async () => {
    await markResultsOfficialMutation.mutateAsync();
  }, [markResultsOfficialMutation]);

  const addPrintedBallotMutation = useMutation(
    async (newPrintedBallot: PrintedBallot) => {
      const oldPrintedBallots = await loadPrintedBallots();
      const newPrintedBallots = [
        ...(oldPrintedBallots ?? []),
        newPrintedBallot,
      ];
      await setStorageKeyAndLog(
        printedBallotsStorageKey,
        newPrintedBallots,
        'Printed ballot information'
      );
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([printedBallotsStorageKey]);
      },
    }
  );

  const addPrintedBallot = useCallback(
    async (newPrintedBallot: PrintedBallot) => {
      await addPrintedBallotMutation.mutateAsync(newPrintedBallot);
    },
    [addPrintedBallotMutation]
  );

  const addFullElectionExternalTallyMutation = useMutation(
    async (newFullElectionExternalTally: FullElectionExternalTally) => {
      const newFullElectionExternalTallies = [
        ...((await loadExternalElectionTallies()) ?? []),
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
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([externalVoteTalliesFileStorageKey]);
      },
    }
  );

  const addFullElectionExternalTally = useCallback(
    async (newFullElectionExternalTally: FullElectionExternalTally) => {
      await addFullElectionExternalTallyMutation.mutateAsync(
        newFullElectionExternalTally
      );
    },
    [addFullElectionExternalTallyMutation]
  );

  const setFullElectionExternalTalliesMutation = useMutation(
    async (
      newFullElectionExternalTallies: readonly FullElectionExternalTally[]
    ) => {
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
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([externalVoteTalliesFileStorageKey]);
      },
    }
  );

  const setFullElectionExternalTallies = useCallback(
    async (
      newFullElectionExternalTallies: readonly FullElectionExternalTally[]
    ) => {
      await setFullElectionExternalTalliesMutation.mutateAsync(
        newFullElectionExternalTallies
      );
    },
    [setFullElectionExternalTalliesMutation]
  );

  const setCurrentUserRole = useCallback((newCurrentUserRole) => {
    currentUserRoleRef.current = newCurrentUserRole;
  }, []);

  return useMemo(
    () =>
      typedAs<ElectionManagerStore>({
        castVoteRecordFiles: castVoteRecordFiles ?? CastVoteRecordFiles.empty,
        configuredAt,
        electionDefinition,
        fullElectionExternalTallies: fullElectionExternalTallies ?? [],
        isOfficialResults: isOfficialResults ?? false,
        printedBallots: printedBallots ?? [],

        addFullElectionExternalTally,
        addPrintedBallot,
        clearCastVoteRecordFiles,
        configure,
        markResultsOfficial,
        reset,
        setCastVoteRecordFiles,
        setCurrentUserRole,
        setFullElectionExternalTallies,
      }),
    [
      addFullElectionExternalTally,
      addPrintedBallot,
      castVoteRecordFiles,
      clearCastVoteRecordFiles,
      configure,
      configuredAt,
      electionDefinition,
      fullElectionExternalTallies,
      isOfficialResults,
      markResultsOfficial,
      printedBallots,
      reset,
      setCastVoteRecordFiles,
      setCurrentUserRole,
      setFullElectionExternalTallies,
    ]
  );
}
