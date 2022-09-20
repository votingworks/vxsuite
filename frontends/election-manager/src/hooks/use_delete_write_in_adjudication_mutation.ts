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
 * Values to pass to the delete write-in adjudication mutation.
 */
export interface Props {
  readonly writeInAdjudicationId: Id;
}

/**
 * `useMutation` result for deleting a write-in adjudication.
 */
export type UseDeleteWriteInAdjudicationMutationResult = UseMutationResult<
  void,
  unknown,
  Props,
  unknown
>;

/**
 * Provides a mutation function to delete a write-in adjudication.
 */
export function useDeleteWriteInAdjudicationMutation(): UseDeleteWriteInAdjudicationMutationResult {
  const { backend } = useContext(ServicesContext);
  const queryClient = useQueryClient();

  return useMutation(
    async ({ writeInAdjudicationId }) => {
      await backend.deleteWriteInAdjudication(writeInAdjudicationId);
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
