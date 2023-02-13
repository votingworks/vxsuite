import React from 'react';
import { renderHook } from '@testing-library/react-hooks/dom';
import { fakeLogger } from '@votingworks/logging';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { MemoryStorage } from '@votingworks/shared';
import { typedAs } from '@votingworks/basics';
import { Admin } from '@votingworks/api';
import { ServicesContext } from '../contexts/services_context';
import { ElectionManagerStoreMemoryBackend } from '../lib/backends';
import { useAdjudicateTranscriptionMutation } from './use_adjudicate_transcription_mutation';

test('useAdjudicateTranscriptionMutation', async () => {
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition:
      electionMinimalExhaustiveSampleFixtures.electionDefinition,
  });

  // set up write-in & transcription
  await backend.addCastVoteRecordFile(
    new File(
      [electionMinimalExhaustiveSampleFixtures.partial1CvrFile.asBuffer()],
      'partial1.jsonl'
    )
  );

  const [writeIn] = await backend.loadWriteIns();

  expect(writeIn).toEqual(
    expect.objectContaining(
      typedAs<Partial<Admin.WriteInRecord>>({
        contestId: 'zoo-council-mammal',
        status: 'pending',
      })
    )
  );
  await backend.transcribeWriteIn(writeIn.id, 'Zebra');

  // set up & trigger mutation
  function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ServicesContext.Provider
        value={{ backend, logger, storage: new MemoryStorage() }}
      >
        <QueryClientProvider client={new QueryClient()}>
          {children}
        </QueryClientProvider>
      </ServicesContext.Provider>
    );
  }
  const { result } = renderHook(() => useAdjudicateTranscriptionMutation(), {
    wrapper,
  });

  expect(
    await result.current.mutateAsync({
      contestId: 'zoo-council-mammal',
      transcribedValue: 'Zebra',
      adjudicatedValue: 'Zebra',
      adjudicatedOptionId: 'zebra',
    })
  ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

  // we should now have an adjudicated write-in
  const [writeInAfterTranscription] = await backend.loadWriteIns();

  expect(writeInAfterTranscription).toEqual(
    typedAs<Admin.WriteInRecord>({
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
