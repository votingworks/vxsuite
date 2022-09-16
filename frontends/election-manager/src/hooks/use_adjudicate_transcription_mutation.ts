import {
  useMutation,
  UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query';
import { ContestId, ContestOptionId, Id } from '@votingworks/types';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';
import { getWriteInsQueryKey } from './use_write_ins_query';
import { getWriteInSummaryQueryKey } from './use_write_in_summary_query';

export interface Props {
  readonly contestId: ContestId;
  readonly transcribedValue: string;
  readonly adjudicatedValue: string;
  readonly adjudicatedOptionId?: ContestOptionId;
}

/**
 * `useMutation` result for adjudicating a transcription.
 */
export type UseAdjudicateTranscriptionMutationResult = UseMutationResult<
  Id,
  unknown,
  Props,
  unknown
>;

/**
 * Provides a mutation function to adjudicate a transcription.
 */
export function useAdjudicateTranscriptionMutation(): UseAdjudicateTranscriptionMutationResult {
  const { backend } = useContext(ServicesContext);
  const queryClient = useQueryClient();

  return useMutation(
    async ({
      contestId,
      transcribedValue,
      adjudicatedValue,
      adjudicatedOptionId,
    }) => {
      return await backend.adjudicateWriteInTranscription(
        contestId,
        transcribedValue,
        adjudicatedValue,
        adjudicatedOptionId
      );
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(getWriteInsQueryKey());
        void queryClient.invalidateQueries(getWriteInSummaryQueryKey());
      },
    }
  );
}
