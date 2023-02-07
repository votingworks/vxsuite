import {
  useMutation,
  UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query';
import { ContestOptionId, Id } from '@votingworks/types';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';
import { getWriteInsQueryKey } from './use_write_ins_query';
import { getWriteInAdjudicationTableQueryKey } from './use_write_in_adjudication_table_query';
import { getWriteInSummaryQueryKey } from './use_write_in_summary_query';

/**
 * Values to pass to the update write-in adjudication mutation.
 */
export interface Props {
  readonly writeInAdjudicationId: Id;
  readonly adjudicatedValue: string;
  readonly adjudicatedOptionId?: ContestOptionId;
}

/**
 * `useMutation` result for updating a write-in adjudication.
 */
export type UseUpdateWriteInAdjudicationMutationResult = UseMutationResult<
  void,
  unknown,
  Props,
  unknown
>;

/**
 * Provides a mutation function to update a write-in adjudication.
 */
export function useUpdateWriteInAdjudicationMutation(): UseUpdateWriteInAdjudicationMutationResult {
  const { backend } = useContext(ServicesContext);
  const queryClient = useQueryClient();

  return useMutation(
    async ({
      writeInAdjudicationId,
      adjudicatedValue,
      adjudicatedOptionId,
    }) => {
      await backend.updateWriteInAdjudication(
        writeInAdjudicationId,
        adjudicatedValue,
        adjudicatedOptionId
      );
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
