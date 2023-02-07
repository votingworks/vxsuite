import {
  useMutation,
  UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query';
import { Admin } from '@votingworks/api';
import { Id } from '@votingworks/types';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';
import { getPrintedBallotsQueryKey } from './use_printed_ballots_query';

/**
 * The result of calling {@link useAddPrintedBallotMutation}.
 */
export type UseAddPrintedBallotMutationResult = UseMutationResult<
  Id,
  unknown,
  Admin.PrintedBallot,
  unknown
>;

/**
 * Returns a mutation that adds a printed ballot to the current election.
 */
export function useAddPrintedBallotMutation(): UseAddPrintedBallotMutationResult {
  const { backend } = useContext(ServicesContext);
  const queryClient = useQueryClient();

  return useMutation(
    async (newPrintedBallot: Admin.PrintedBallot) =>
      await backend.addPrintedBallot(newPrintedBallot),
    {
      onSuccess() {
        void queryClient.invalidateQueries(getPrintedBallotsQueryKey());
      },
    }
  );
}
