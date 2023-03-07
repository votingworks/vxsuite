import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assert, typedAs } from '@votingworks/basics';
import { LoggingUserRole } from '@votingworks/logging';
import {
  ElectionDefinition,
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
} from '@votingworks/types';
import { useCallback, useContext, useMemo, useRef } from 'react';
import { ServicesContext } from '../contexts/services_context';

export interface ElectionManagerStore {
  /**
   * The currently configured election definition.
   */
  readonly electionDefinition?: ElectionDefinition;

  /**
   * Tallies from external sources, e.g. manually entered tallies.
   */
  readonly fullElectionExternalTallies: FullElectionExternalTallies;

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

export const externalVoteTalliesFileStorageKey = 'externalVoteTallies';

/**
 * Manages the stored data for VxAdmin.
 */
export function useElectionManagerStore(): ElectionManagerStore {
  const { backend } = useContext(ServicesContext);
  const queryClient = useQueryClient();
  const currentUserRoleRef = useRef<LoggingUserRole>('unknown');

  const getExternalElectionTalliesQuery = useQuery<FullElectionExternalTallies>(
    [externalVoteTalliesFileStorageKey],
    async () => {
      return (await backend.loadFullElectionExternalTallies()) ?? new Map();
    }
  );
  const fullElectionExternalTallies = getExternalElectionTalliesQuery.data;

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
        fullElectionExternalTallies: fullElectionExternalTallies ?? new Map(),
        clearFullElectionExternalTallies,
        setCurrentUserRole,
        updateFullElectionExternalTally,
        removeFullElectionExternalTally,
      }),
    [
      clearFullElectionExternalTallies,
      fullElectionExternalTallies,
      removeFullElectionExternalTally,
      setCurrentUserRole,
      updateFullElectionExternalTally,
    ]
  );
}
