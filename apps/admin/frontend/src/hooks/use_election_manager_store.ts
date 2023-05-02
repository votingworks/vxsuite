import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { typedAs } from '@votingworks/basics';
import { LoggingUserRole } from '@votingworks/logging';
import { FullElectionManualTally } from '@votingworks/types';
import { useCallback, useContext, useMemo, useRef } from 'react';
import { ServicesContext } from '../contexts/services_context';

export interface ElectionManagerStore {
  /**
   * Manually entered tally.
   */
  readonly fullElectionManualTally?: FullElectionManualTally;

  /**
   * Adds or updates the manual tally.
   */
  updateFullElectionManualTally(
    newFullElectionManualTally: FullElectionManualTally
  ): Promise<void>;

  /**
   * Removes the manual tally.
   */
  removeFullElectionManualTally(): Promise<void>;

  /**
   * Sets the current user's role, i.e. the person taking action.
   */
  setCurrentUserRole(newCurrentUserRole: LoggingUserRole): void;
}

export const manualVoteTallyFileStorageKey = 'manualVoteTallies';

/**
 * Manages the stored data for Vx
 */
export function useElectionManagerStore(): ElectionManagerStore {
  const { backend } = useContext(ServicesContext);
  const queryClient = useQueryClient();
  const currentUserRoleRef = useRef<LoggingUserRole>('unknown');

  const getManualElectionTalliesQuery =
    useQuery<FullElectionManualTally | null>(
      [manualVoteTallyFileStorageKey],
      async () => {
        return (await backend.loadFullElectionManualTally()) ?? null;
      }
    );
  const fullElectionManualTally = getManualElectionTalliesQuery.data;

  const updateFullElectionManualTallyMutation = useMutation(
    async (newFullElectionManualTally: FullElectionManualTally) => {
      await backend.updateFullElectionManualTally(newFullElectionManualTally);
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([manualVoteTallyFileStorageKey]);
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
        void queryClient.invalidateQueries([manualVoteTallyFileStorageKey]);
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
