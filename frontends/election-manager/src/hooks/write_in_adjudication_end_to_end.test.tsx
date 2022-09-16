import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks/dom';
import { Admin } from '@votingworks/api';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { fakeLogger } from '@votingworks/logging';
import { typedAs } from '@votingworks/utils';
import React from 'react';
import { ServicesContext } from '../contexts/services_context';
import { ElectionManagerStoreMemoryBackend } from '../lib/backends';
import { useAdjudicateTranscriptionMutation } from './use_adjudicate_transcription_mutation';
import { useDeleteWriteInAdjudicationMutation } from './use_delete_write_in_adjudication_mutation';
import { useTranscribeWriteInMutation } from './use_transcribe_write_in_mutation';
import { useUpdateWriteInAdjudicationMutation } from './use_update_write_in_adjudication_mutation';
import { useWriteInsQuery } from './use_write_ins_query';

test('write-in adjudication end-to-end', async () => {
  const logger = fakeLogger();
  const queryClient = new QueryClient();
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition:
      electionMinimalExhaustiveSampleFixtures.electionDefinition,
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ServicesContext.Provider value={{ backend, logger }}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </ServicesContext.Provider>
    );
  }

  // set up write-in & transcription
  await backend.addCastVoteRecordFile(
    new File(
      [electionMinimalExhaustiveSampleFixtures.partial1CvrFile.asBuffer()],
      'partial1.jsonl'
    )
  );

  /// Load initial write-ins
  const { result: useWriteInsQueryResult } = renderHook(
    () => useWriteInsQuery(),
    { wrapper }
  );

  let writeIn!: Admin.WriteInRecord;

  await waitFor(() => {
    const [writeInInitial] = useWriteInsQueryResult.current.data!;

    expect(writeInInitial).toEqual(
      expect.objectContaining(
        typedAs<Partial<Admin.WriteInRecordPendingTranscription>>({
          contestId: 'zoo-council-mammal',
          status: 'pending',
        })
      )
    );

    writeIn = writeInInitial;
  });

  /// Transcribe write-in
  const { result: useTranscribeWriteInMutationResult } = renderHook(
    () => useTranscribeWriteInMutation(),
    { wrapper }
  );

  await useTranscribeWriteInMutationResult.current.mutateAsync({
    writeInId: writeIn.id,
    transcribedValue: 'Zebra',
  });

  await waitFor(() => {
    const [writeInAfterTranscription] = useWriteInsQueryResult.current.data!;

    expect(writeInAfterTranscription).toEqual(
      typedAs<Admin.WriteInRecordTranscribed>({
        id: writeIn.id,
        castVoteRecordId: writeIn.castVoteRecordId,
        contestId: 'zoo-council-mammal',
        optionId: writeIn.optionId,
        status: 'transcribed',
        transcribedValue: 'Zebra',
      })
    );
  });

  /// Adjudicate write-in
  const { result: useAdjudicateTranscriptionMutationResult } = renderHook(
    () => useAdjudicateTranscriptionMutation(),
    { wrapper }
  );

  const writeInAdjudicationId =
    await useAdjudicateTranscriptionMutationResult.current.mutateAsync({
      contestId: 'zoo-council-mammal',
      transcribedValue: 'Zebra',
      adjudicatedValue: 'Zebra',
      adjudicatedOptionId: 'zebra',
    });
  expect(writeInAdjudicationId).toBeDefined();

  await waitFor(() => {
    const [writeInAfterAdjudication] = useWriteInsQueryResult.current.data!;

    expect(writeInAfterAdjudication).toEqual(
      typedAs<Admin.WriteInRecordAdjudicated>({
        id: writeIn.id,
        castVoteRecordId: writeIn.castVoteRecordId,
        contestId: 'zoo-council-mammal',
        optionId: writeIn.optionId,
        status: 'adjudicated',
        transcribedValue: 'Zebra',
        adjudicatedValue: 'Zebra',
        adjudicatedOptionId: 'zebra',
      })
    );
  });

  /// Update adjudication
  const { result: useUpdateWriteInAdjudicationMutationResult } = renderHook(
    () => useUpdateWriteInAdjudicationMutation(),
    { wrapper }
  );

  await useUpdateWriteInAdjudicationMutationResult.current.mutateAsync({
    writeInAdjudicationId,
    adjudicatedValue: 'Otter',
  });

  await waitFor(() => {
    const [writeInAfterUpdate] = useWriteInsQueryResult.current.data!;

    expect(writeInAfterUpdate).toEqual(
      typedAs<Admin.WriteInRecordAdjudicated>({
        id: writeIn.id,
        castVoteRecordId: writeIn.castVoteRecordId,
        contestId: 'zoo-council-mammal',
        optionId: writeIn.optionId,
        status: 'adjudicated',
        transcribedValue: 'Zebra',
        adjudicatedValue: 'Otter',
      })
    );
  });

  /// Delete adjudication
  const { result: useDeleteWriteInAdjudicationMutationResult } = renderHook(
    () => useDeleteWriteInAdjudicationMutation(),
    { wrapper }
  );

  await useDeleteWriteInAdjudicationMutationResult.current.mutateAsync({
    writeInAdjudicationId,
  });

  await waitFor(() => {
    const [writeInAfterDelete] = useWriteInsQueryResult.current.data!;

    expect(writeInAfterDelete).toEqual(
      typedAs<Admin.WriteInRecordTranscribed>({
        id: writeIn.id,
        castVoteRecordId: writeIn.castVoteRecordId,
        contestId: 'zoo-council-mammal',
        optionId: writeIn.optionId,
        status: 'transcribed',
        transcribedValue: 'Zebra',
      })
    );
  });
});
