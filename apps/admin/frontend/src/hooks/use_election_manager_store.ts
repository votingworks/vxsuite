import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { typedAs } from '@votingworks/basics';
import { LoggingUserRole } from '@votingworks/logging';
import { FullElectionExternalTally } from '@votingworks/types';
import { useCallback, useContext, useMemo, useRef } from 'react';
import { ServicesContext } from '../contexts/services_context';

export interface ElectionManagerStore {
  /**
   * Tallies from external sources, e.g. manually entered tallies.
   */
  readonly fullElectionExternalTally?: FullElectionExternalTally;

  /**
   * Updates the external tally for a given source.
   */
  updateFullElectionExternalTally(
    newFullElectionExternalTally: FullElectionExternalTally
  ): Promise<void>;

  /**
   * Removes the external tally for a given source.
   */
  removeFullElectionExternalTally(): Promise<void>;

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
    useQuery<FullElectionExternalTally | null>(
      [externalVoteTallyFileStorageKey],
      async () => {
        return (await backend.loadFullElectionExternalTally()) ?? null;
      }
    );
  const fullElectionExternalTally = getExternalElectionTalliesQuery.data;

  const updateFullElectionExternalTallyMutation = useMutation(
    async (newFullElectionExternalTally: FullElectionExternalTally) => {
      await backend.updateFullElectionExternalTally(
        newFullElectionExternalTally
      );
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([externalVoteTallyFileStorageKey]);
      },
    }
  );

  const updateFullElectionExternalTally = useCallback(
    async (newFullElectionExternalTally: FullElectionExternalTally) => {
      await updateFullElectionExternalTallyMutation.mutateAsync(
        newFullElectionExternalTally
      );
    },
    [updateFullElectionExternalTallyMutation]
  );

  const removeFullElectionExternalTallyMutation = useMutation(
    async () => {
      await backend.removeFullElectionExternalTally();
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([externalVoteTallyFileStorageKey]);
      },
    }
  );

  const removeFullElectionExternalTally = useCallback(async () => {
    await removeFullElectionExternalTallyMutation.mutateAsync();
  }, [removeFullElectionExternalTallyMutation]);

  const setCurrentUserRole = useCallback((newCurrentUserRole) => {
    currentUserRoleRef.current = newCurrentUserRole;
  }, []);

  return useMemo(
    () =>
      typedAs<ElectionManagerStore>({
        fullElectionExternalTally: fullElectionExternalTally || undefined,
        setCurrentUserRole,
        updateFullElectionExternalTally,
        removeFullElectionExternalTally,
      }),
    [
      fullElectionExternalTally,
      removeFullElectionExternalTally,
      setCurrentUserRole,
      updateFullElectionExternalTally,
    ]
  );
}
