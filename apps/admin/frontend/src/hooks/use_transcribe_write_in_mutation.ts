import {
  useMutation,
  UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query';
import { Id } from '@votingworks/types';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';
import { getWriteInsQueryKey } from './use_write_ins_query';
import { getWriteInAdjudicationTableQueryKey } from './use_write_in_adjudication_table_query';
import { getWriteInSummaryQueryKey } from './use_write_in_summary_query';

/**
 * Values to pass to the transcription mutation.
 */
export interface Props {
  readonly writeInId: Id;
  readonly transcribedValue: string;
}

/**
 * `useMutation` result for transcribing a write-in value.
 */
export type UseTranscribeWriteInMutationResult = UseMutationResult<
  void,
  unknown,
  Props,
  unknown
>;

/**
 * Provides a mutation function to transcribe a write-in value.
 */
export function useTranscribeWriteInMutation(): UseTranscribeWriteInMutationResult {
  const { backend } = useContext(ServicesContext);
  const queryClient = useQueryClient();

  return useMutation(
    async ({ writeInId, transcribedValue }) => {
      await backend.transcribeWriteIn(writeInId, transcribedValue);
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(getWriteInsQueryKey());
        void queryClient.invalidateQueries(getWriteInSummaryQueryKey());
        void queryClient.invalidateQueries(
          getWriteInAdjudicationTableQueryKey()
        );
      },
    }
  );
}
