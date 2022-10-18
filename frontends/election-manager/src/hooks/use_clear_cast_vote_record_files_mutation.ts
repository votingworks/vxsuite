import {
  useMutation,
  UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';
import {
  cvrsStorageKey,
  isOfficialResultsKey,
} from './use_election_manager_store';
import { getWriteInsQueryKey } from './use_write_ins_query';
import { getWriteInAdjudicationTableQueryKey } from './use_write_in_adjudication_table_query';
import { getWriteInImageQueryKey } from './use_write_in_images_query';
import { getWriteInSummaryQueryKey } from './use_write_in_summary_query';

/**
 * The result of calling {@link useClearCastVoteRecordFilesMutation}.
 */
export type UseClearCastVoteRecordFilesMutationResult = UseMutationResult<
  void,
  unknown,
  void,
  unknown
>;

/**
 * Returns a mutation that clears the CVR files in the current election.
 */
export function useClearCastVoteRecordFilesMutation(): UseClearCastVoteRecordFilesMutationResult {
  const { backend } = useContext(ServicesContext);
  const queryClient = useQueryClient();

  return useMutation(
    async () => {
      await backend.clearCastVoteRecordFiles();
    },
    {
      onSuccess() {
        void queryClient.invalidateQueries([cvrsStorageKey]);
        void queryClient.invalidateQueries([isOfficialResultsKey]);
        void queryClient.invalidateQueries(getWriteInImageQueryKey());
        void queryClient.invalidateQueries(getWriteInsQueryKey());
        void queryClient.invalidateQueries(getWriteInSummaryQueryKey());
        void queryClient.invalidateQueries(
          getWriteInAdjudicationTableQueryKey()
        );
      },
    }
  );
}
