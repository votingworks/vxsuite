import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LogDispositionStandardTypes,
  LogEventId,
  LoggingUserRole,
} from '@votingworks/logging';
import {
  ElectionDefinition,
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
} from '@votingworks/types';
import { assert, typedAs } from '@votingworks/utils';
import { useCallback, useContext, useMemo, useRef } from 'react';
import { PrintedBallot } from '../config/types';
import { ServicesContext } from '../contexts/services_context';
import { AddCastVoteRecordFileResult } from '../lib/backends/types';
import { CastVoteRecordFiles } from '../utils/cast_vote_record_files';
import { getCurrentElectionMetadataResultsQueryKey } from './use_current_election_metadata';
import { getWriteInsQueryKey } from './use_write_ins_query';
import { getWriteInAdjudicationTableQueryKey } from './use_write_in_adjudication_table_query';
import { getWriteInImageQueryKey } from './use_write_in_images_query';
import { getWriteInSummaryQueryKey } from './use_write_in_summary_query';

export interface ElectionManagerStore {
  /**
   * The currently configured election definition.
   */
  readonly electionDefinition?: ElectionDefinition;

  /**
   * The current set of loaded cast vote record files.
   */
  readonly castVoteRecordFiles: CastVoteRecordFiles;

  /**
   * Information about the ballots that have been printed.
   */
  readonly printedBallots: readonly PrintedBallot[];

  /**
   * Tallies from external sources, e.g. SEMS or manually entered tallies.
   */
  readonly fullElectionExternalTallies: FullElectionExternalTallies;

  /**
   * Resets all stored data, including the election definition and CVRs.
   */
  reset(): Promise<void>;

  /**
   * Configures with a new election definition after resetting.
   *
   * @param newElectionData election definition as JSON string
   */
  configure(newElectionData: string): Promise<ElectionDefinition>;

  /**
   * Adds a new cast vote record file.
   */
  addCastVoteRecordFile(
    newCastVoteRecordFile: File
  ): Promise<AddCastVoteRecordFileResult>;

  /**
   * Updates the external tally for a given source.
   */
  updateFullElectionExternalTally(
    sourceType: ExternalTallySourceType,
    newFullElectionExternalTally: FullElectionExternalTally
  ): Promise<void>;

  /**
   * Removes the external tally for a given source.
   */
  removeFullElectionExternalTally(
    sourceType: ExternalTallySourceType
  ): Promise<void>;

  /**
   * Clears all external tallies.
   */
  clearFullElectionExternalTallies(): Promise<void>;

  /**
   * Adds a new printed ballot to the list.
   */
  addPrintedBallot(printedBallot: PrintedBallot): Promise<void>;

  /**
   * Sets the current user's role, i.e. the person taking action.
   */
  setCurrentUserRole(newCurrentUserRole: LoggingUserRole): void;
}

export const cvrsStorageKey = 'cvrFiles';
export const printedBallotsStorageKey = 'printedBallots';
export const configuredAtStorageKey = 'configuredAt';
export const externalVoteTalliesFileStorageKey = 'externalVoteTallies';

/**
 * Manages the stored data for VxAdmin.
 */
export function useElectionManagerStore(): ElectionManagerStore {
  const { backend, logger } = useContext(ServicesContext);
  const queryClient = useQueryClient();
  const currentUserRoleRef = useRef<LoggingUserRole>('unknown');

  const getPrintedBallotsQuery = useQuery<PrintedBallot[]>(
    [printedBallotsStorageKey],
    async () => {
      return (await backend.loadPrintedBallots()) ?? [];
    }
  );
  const printedBallots = getPrintedBallotsQuery.data;

  const getCastVoteRecordFilesQuery = useQuery<CastVoteRecordFiles>(
    [cvrsStorageKey],
    async () => {
      return (
        (await backend.loadCastVoteRecordFiles()) ?? CastVoteRecordFiles.empty
      );
    }
  );
  const castVoteRecordFiles = getCastVoteRecordFilesQuery.data;

  const getExternalElectionTalliesQuery = useQuery<FullElectionExternalTallies>(
    [externalVoteTalliesFileStorageKey],
    async () => {
      return (await backend.loadFullElectionExternalTallies()) ?? new Map();
    }
  );
  const fullElectionExternalTallies = getExternalElectionTalliesQuery.data;

  const reset = useCallback(async () => {
    await backend.reset();
    await logger.log(
      LogEventId.ElectionUnconfigured,
      currentUserRoleRef.current,
      {
        disposition: LogDispositionStandardTypes.Success,
      }
    );
    await queryClient.invalidateQueries([cvrsStorageKey]);
    await queryClient.invalidateQueries([externalVoteTalliesFileStorageKey]);
    await queryClient.invalidateQueries([printedBallotsStorageKey]);
    await queryClient.invalidateQueries(getWriteInImageQueryKey());
    await queryClient.invalidateQueries(getWriteInsQueryKey());
    await queryClient.invalidateQueries(getWriteInSummaryQueryKey());
    await queryClient.invalidateQueries(getWriteInAdjudicationTableQueryKey());
    await queryClient.invalidateQueries(
      getCurrentElectionMetadataResultsQueryKey()
    );
  }, [backend, logger, queryClient]);

  const configure = useCallback(
    async (newElectionData: string): Promise<ElectionDefinition> => {
      await reset();
      const newElectionDefinition = await backend.configure(newElectionData);
      await logger.log(
        LogEventId.ElectionConfigured,
        currentUserRoleRef.current,
        {
          disposition: LogDispositionStandardTypes.Success,
          newElectionHash: newElectionDefinition.electionHash,
        }
      );
      await queryClient.invalidateQueries(
        getCurrentElectionMetadataResultsQueryKey()
      );
      await queryClient.invalidateQueries([configuredAtStorageKey]);
      return newElectionDefinition;
    },
    [backend, logger, queryClient, reset]
  );

  const addCastVoteRecordFileMutation = useMutation(
    async (newCastVoteRecordFile: File) => {
      return await backend.addCastVoteRecordFile(newCastVoteRecordFile);
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([cvrsStorageKey]);
      },
    }
  );

  const addCastVoteRecordFile = useCallback(
    async (newCastVoteRecordFile: File) => {
      return await addCastVoteRecordFileMutation.mutateAsync(
        newCastVoteRecordFile
      );
    },
    [addCastVoteRecordFileMutation]
  );

  const addPrintedBallotMutation = useMutation(
    async (newPrintedBallot: PrintedBallot) => {
      await backend.addPrintedBallot(newPrintedBallot);
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

  const updateFullElectionExternalTallyMutation = useMutation(
    async (newFullElectionExternalTally: FullElectionExternalTally) => {
      await backend.updateFullElectionExternalTally(
        newFullElectionExternalTally.source,
        newFullElectionExternalTally
      );
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([externalVoteTalliesFileStorageKey]);
      },
    }
  );

  const updateFullElectionExternalTally = useCallback(
    async (
      sourceType: ExternalTallySourceType,
      newFullElectionExternalTally: FullElectionExternalTally
    ) => {
      assert(newFullElectionExternalTally.source === sourceType);
      await updateFullElectionExternalTallyMutation.mutateAsync(
        newFullElectionExternalTally
      );
    },
    [updateFullElectionExternalTallyMutation]
  );

  const removeFullElectionExternalTallyMutation = useMutation(
    async (sourceType: ExternalTallySourceType) => {
      await backend.removeFullElectionExternalTally(sourceType);
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([externalVoteTalliesFileStorageKey]);
      },
    }
  );

  const removeFullElectionExternalTally = useCallback(
    async (sourceType: ExternalTallySourceType) => {
      await removeFullElectionExternalTallyMutation.mutateAsync(sourceType);
    },
    [removeFullElectionExternalTallyMutation]
  );

  const clearFullElectionExternalTalliesMutation = useMutation(
    async () => {
      await backend.clearFullElectionExternalTallies();
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([externalVoteTalliesFileStorageKey]);
      },
    }
  );

  const clearFullElectionExternalTallies = useCallback(async () => {
    await clearFullElectionExternalTalliesMutation.mutateAsync();
  }, [clearFullElectionExternalTalliesMutation]);

  const setCurrentUserRole = useCallback((newCurrentUserRole) => {
    currentUserRoleRef.current = newCurrentUserRole;
  }, []);

  return useMemo(
    () =>
      typedAs<ElectionManagerStore>({
        castVoteRecordFiles: castVoteRecordFiles ?? CastVoteRecordFiles.empty,
        fullElectionExternalTallies: fullElectionExternalTallies ?? new Map(),
        printedBallots: printedBallots ?? [],

        addCastVoteRecordFile,
        addPrintedBallot,
        clearFullElectionExternalTallies,
        configure,
        reset,
        setCurrentUserRole,
        updateFullElectionExternalTally,
        removeFullElectionExternalTally,
      }),
    [
      addCastVoteRecordFile,
      addPrintedBallot,
      castVoteRecordFiles,
      clearFullElectionExternalTallies,
      configure,
      fullElectionExternalTallies,
      printedBallots,
      removeFullElectionExternalTally,
      reset,
      setCurrentUserRole,
      updateFullElectionExternalTally,
    ]
  );
}
