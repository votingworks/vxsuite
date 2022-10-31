import {
  useMutation,
  UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';
import { AddCastVoteRecordFileResult } from '../lib/backends';
import { getCvrFileModeQueryKey } from './use_cvr_file_mode_query';
import { cvrsStorageKey } from './use_election_manager_store';

/**
 * The result of calling {@link useAddCastVoteRecordFileMutation}.
 */
export type UseAddCastVoteRecordFileMutationResult = UseMutationResult<
  AddCastVoteRecordFileResult,
  unknown,
  File,
  unknown
>;

/**
 * Returns a mutation that clears the CVR files in the current election.
 */
export function useAddCastVoteRecordFileMutation(): UseAddCastVoteRecordFileMutationResult {
  const { backend } = useContext(ServicesContext);
  const queryClient = useQueryClient();

  return useMutation(
    async (newCastVoteRecordFile: File) =>
      await backend.addCastVoteRecordFile(newCastVoteRecordFile),
    {
      onSuccess() {
        void queryClient.invalidateQueries([cvrsStorageKey]);
        void queryClient.invalidateQueries(getCvrFileModeQueryKey());
      },
    }
  );
}
