import {
  useMutation,
  UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query';
import { Admin } from '@votingworks/api';
import { Id } from '@votingworks/types';
import { fetchJson, typedAs } from '@votingworks/utils';
import { getWriteInsQueryKey } from './use_write_ins_query';

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
  const queryClient = useQueryClient();

  return useMutation(
    async ({ writeInId, transcribedValue }) => {
      const response = (await fetchJson(
        `/admin/write-ins/${writeInId}/transcription`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            typedAs<Admin.PutWriteInTranscriptionRequest>({
              value: transcribedValue,
            })
          ),
        }
      )) as Admin.PutWriteInTranscriptionResponse;

      if (response.status !== 'ok') {
        throw new Error(response.errors.map((e) => e.message).join(', '));
      }
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(getWriteInsQueryKey());
      },
    }
  );
}
