import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { typedAs } from '@votingworks/basics';
import { LoggingUserRole } from '@votingworks/logging';
import { FullElectionManualTally } from '@votingworks/types';
import { useCallback, useContext, useMemo, useRef } from 'react';
import { ServicesContext } from '../contexts/services_context';

export interface ElectionManagerStore {
  /**
   * Tallies from external sources, e.g. manually entered tallies.
   */
  readonly fullElectionManualTally?: FullElectionManualTally;

  /**
   * Updates the external tally for a given source.
   */
  updateFullElectionManualTally(
    newFullElectionManualTally: FullElectionManualTally
  ): Promise<void>;

  /**
   * Removes the external tally for a given source.
   */
  removeFullElectionManualTally(): Promise<void>;

  /**
   * Sets the current user's role, i.e. the person taking action.
   */
  setCurrentUserRole(newCurrentUserRole: LoggingUserRole): void;
}

export const externalVoteTallyFileStorageKey = 'externalVoteTallies';

/**
 * Manages the stored data for VxAdmin.
 */
export function useElectionManagerStore(): ElectionManagerStore {
  const { backend } = useContext(ServicesContext);
  const queryClient = useQueryClient();
  const currentUserRoleRef = useRef<LoggingUserRole>('unknown');

  const getExternalElectionTalliesQuery =
    useQuery<FullElectionManualTally | null>(
      [externalVoteTallyFileStorageKey],
      async () => {
        return (await backend.loadFullElectionManualTally()) ?? null;
      }
    );
  const fullElectionManualTally = getExternalElectionTalliesQuery.data;

  const updateFullElectionManualTallyMutation = useMutation(
    async (newFullElectionManualTally: FullElectionManualTally) => {
      await backend.updateFullElectionManualTally(newFullElectionManualTally);
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([externalVoteTallyFileStorageKey]);
      },
    }
  );

  const updateFullElectionManualTally = useCallback(
    async (newFullElectionManualTally: FullElectionManualTally) => {
      await updateFullElectionManualTallyMutation.mutateAsync(
        newFullElectionManualTally
      );
    },
    [updateFullElectionManualTallyMutation]
  );

  const removeFullElectionManualTallyMutation = useMutation(
    async () => {
      await backend.removeFullElectionManualTally();
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([externalVoteTallyFileStorageKey]);
      },
    }
  );

  const removeFullElectionManualTally = useCallback(async () => {
    await removeFullElectionManualTallyMutation.mutateAsync();
  }, [removeFullElectionManualTallyMutation]);

  const setCurrentUserRole = useCallback((newCurrentUserRole) => {
    currentUserRoleRef.current = newCurrentUserRole;
  }, []);

  return useMemo(
    () =>
      typedAs<ElectionManagerStore>({
        fullElectionManualTally: fullElectionManualTally || undefined,
        setCurrentUserRole,
        updateFullElectionManualTally,
        removeFullElectionManualTally,
      }),
    [
      fullElectionManualTally,
      removeFullElectionManualTally,
      setCurrentUserRole,
      updateFullElectionManualTally,
    ]
  );
}
