import {
  useMutation,
  useQueryClient,
  UseMutationResult,
} from '@tanstack/react-query';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';
import { getCurrentElectionMetadataResultsQueryKey } from './use_current_election_metadata';

/**
 * The mutation result returned by {@link useMarkResultsOfficialMutation}.
 */
export type UseMarkResultsOfficialMutationResult = UseMutationResult<
  void,
  unknown,
  void
>;

/**
 * Returns a mutation for marking the results as official for the current election.
 */
export function useMarkResultsOfficialMutation(): UseMarkResultsOfficialMutationResult {
  const { backend } = useContext(ServicesContext);
  const queryClient = useQueryClient();

  return useMutation(
    async () => {
      await backend.markResultsOfficial();
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries(
          getCurrentElectionMetadataResultsQueryKey()
        );
      },
    }
  );
}
