import {
  useMutation,
  UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';
import { getCurrentElectionMetadataResultsQueryKey } from './use_current_election_metadata';
import { getWriteInsQueryKey } from './use_write_ins_query';
import { getWriteInAdjudicationTableQueryKey } from './use_write_in_adjudication_table_query';
import { getCvrFileModeQueryKey } from './use_cvr_file_mode_query';
import { getWriteInImageQueryKey } from './use_write_in_images_query';
import { getWriteInSummaryQueryKey } from './use_write_in_summary_query';
import { getCvrFilesQueryKey } from './use_cvr_files_query';
import { getCvrsQueryKey } from './use_cvrs_query';

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
        void queryClient.invalidateQueries(getWriteInImageQueryKey());
        void queryClient.invalidateQueries(getWriteInsQueryKey());
        void queryClient.invalidateQueries(getWriteInSummaryQueryKey());
        void queryClient.invalidateQueries(
          getWriteInAdjudicationTableQueryKey()
        );
        void queryClient.invalidateQueries(
          getCurrentElectionMetadataResultsQueryKey()
        );
        void queryClient.invalidateQueries(getCvrFilesQueryKey());
        void queryClient.invalidateQueries(getCvrsQueryKey());
        void queryClient.invalidateQueries(getCvrFileModeQueryKey());
      },
    }
  );
}
