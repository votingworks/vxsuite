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
import { ServicesContext } from '../contexts/services_context';
import { CastVoteRecordFiles } from '../utils/cast_vote_record_files';
import { getCurrentElectionMetadataResultsQueryKey } from './use_current_election_metadata';
import { getCvrFilesQueryKey } from './use_cvr_files_query';
import { getCvrFileModeQueryKey } from './use_cvr_file_mode_query';
import { getPrintedBallotsQueryKey } from './use_printed_ballots_query';
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
   * Sets the current user's role, i.e. the person taking action.
   */
  setCurrentUserRole(newCurrentUserRole: LoggingUserRole): void;
}

export const cvrsStorageKey = 'cvrFiles';
export const configuredAtStorageKey = 'configuredAt';
export const externalVoteTalliesFileStorageKey = 'externalVoteTallies';

/**
 * Manages the stored data for VxAdmin.
 */
export function useElectionManagerStore(): ElectionManagerStore {
  const { backend, logger } = useContext(ServicesContext);
  const queryClient = useQueryClient();
  const currentUserRoleRef = useRef<LoggingUserRole>('unknown');

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
    await queryClient.invalidateQueries(getPrintedBallotsQueryKey());
    await queryClient.invalidateQueries(getWriteInImageQueryKey());
    await queryClient.invalidateQueries(getWriteInsQueryKey());
    await queryClient.invalidateQueries(getWriteInSummaryQueryKey());
    await queryClient.invalidateQueries(getWriteInAdjudicationTableQueryKey());
    await queryClient.invalidateQueries(
      getCurrentElectionMetadataResultsQueryKey()
    );
    await queryClient.invalidateQueries(getCvrFilesQueryKey());
    await queryClient.invalidateQueries(getCvrFileModeQueryKey());
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

        clearFullElectionExternalTallies,
        configure,
        reset,
        setCurrentUserRole,
        updateFullElectionExternalTally,
        removeFullElectionExternalTally,
      }),
    [
      castVoteRecordFiles,
      clearFullElectionExternalTallies,
      configure,
      fullElectionExternalTallies,
      removeFullElectionExternalTally,
      reset,
      setCurrentUserRole,
      updateFullElectionExternalTally,
    ]
  );
}
