import { Admin } from '@votingworks/api';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { assert, typedAs } from '@votingworks/utils';
import { Store } from '../store';
import * as view from './write_in_adjudication_table';

const officialCandidateAdjudicationOptionGroup: Admin.WriteInAdjudicationTableOptionGroup =
  {
    title: 'Official Candidates',

    options: [
      {
        adjudicatedValue: 'Elephant',
        adjudicatedOptionId: 'elephant',
      },
      {
        adjudicatedValue: 'Kangaroo',
        adjudicatedOptionId: 'kangaroo',
      },
      {
        adjudicatedValue: 'Lion',
        adjudicatedOptionId: 'lion',
      },
      {
        adjudicatedValue: 'Zebra',
        adjudicatedOptionId: 'zebra',
      },
    ],
  };

test('invalid election ID', () => {
  const store = Store.memoryStore();
  expect(
    view.render(store, { electionId: 'invalid', contestId: 'contest-1' })
  ).toBeUndefined();
});

test('invalid contest ID', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  expect(
    view.render(store, { electionId, contestId: 'invalid' })
  ).toBeUndefined();
});

test('no CVRs', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  expect(
    view.render(store, { electionId, contestId: 'zoo-council-mammal' })
  ).toEqual(
    typedAs<Admin.WriteInAdjudicationTable>({
      contestId: 'zoo-council-mammal',
      writeInCount: 0,
      adjudicated: [],
      transcribed: {
        writeInCount: 0,
        rows: [],
      },
    })
  );
});

test('with CVRs but no transcriptions', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  store
    .addCastVoteRecordFile({
      electionId,
      cvrFile: electionMinimalExhaustiveSampleFixtures.cvrData,
      filename: 'cvrs.jsonl',
    })
    .unsafeUnwrap();
  expect(
    view.render(store, { electionId, contestId: 'zoo-council-mammal' })
  ).toEqual(
    typedAs<Admin.WriteInAdjudicationTable>({
      contestId: 'zoo-council-mammal',
      writeInCount: 0,
      adjudicated: [],
      transcribed: {
        writeInCount: 0,
        rows: [],
      },
    })
  );
});

test('end-to-end adjudication & update', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const contestId = 'zoo-council-mammal';
  store
    .addCastVoteRecordFile({
      electionId,
      cvrFile: electionMinimalExhaustiveSampleFixtures.cvrData,
      filename: 'cvrs.jsonl',
    })
    .unsafeUnwrap();
  const writeIns = store.getWriteInRecords({
    electionId,
    contestId,
  });
  const [firstWriteIn, secondWriteIn] = writeIns;
  assert(firstWriteIn && secondWriteIn);

  store.transcribeWriteIn(firstWriteIn.id, 'Gibbon');
  store.transcribeWriteIn(secondWriteIn.id, 'Hyena');

  expect(view.render(store, { electionId, contestId })).toEqual(
    typedAs<Admin.WriteInAdjudicationTable>({
      contestId,
      writeInCount: 2,
      adjudicated: [],
      transcribed: {
        writeInCount: 2,
        rows: [
          {
            transcribedValue: 'Gibbon',
            writeInCount: 1,
            adjudicationOptionGroups: [
              officialCandidateAdjudicationOptionGroup,
              {
                title: 'Original Transcription',
                options: [{ adjudicatedValue: 'Gibbon' }],
              },
            ],
          },
          {
            transcribedValue: 'Hyena',
            writeInCount: 1,
            adjudicationOptionGroups: [
              officialCandidateAdjudicationOptionGroup,
              {
                title: 'Original Transcription',
                options: [{ adjudicatedValue: 'Hyena' }],
              },
            ],
          },
        ],
      },
    })
  );

  // adjudicate the first write-in
  const firstWriteInAdjudicationId = store.createWriteInAdjudication({
    electionId,
    contestId,
    transcribedValue: 'Gibbon',
    adjudicatedValue: 'Gibbon',
  });

  expect(view.render(store, { electionId, contestId })).toEqual(
    typedAs<Admin.WriteInAdjudicationTable>({
      contestId,
      writeInCount: 2,
      adjudicated: [
        {
          adjudicatedValue: 'Gibbon',
          writeInCount: 1,
          rows: [
            {
              transcribedValue: 'Gibbon',
              writeInAdjudicationId: firstWriteInAdjudicationId,
              writeInCount: 1,
              adjudicationOptionGroups: [
                officialCandidateAdjudicationOptionGroup,
                {
                  title: 'Original Transcription',
                  options: [{ adjudicatedValue: 'Gibbon' }],
                },
              ],
            },
          ],
        },
      ],
      transcribed: {
        writeInCount: 1,
        rows: [
          {
            transcribedValue: 'Hyena',
            writeInCount: 1,
            adjudicationOptionGroups: [
              officialCandidateAdjudicationOptionGroup,
              {
                title: 'Write-In Candidates',
                options: [{ adjudicatedValue: 'Gibbon' }],
              },
              {
                title: 'Original Transcription',
                options: [{ adjudicatedValue: 'Hyena' }],
              },
            ],
          },
        ],
      },
    })
  );

  // change the adjudication to an official candidate
  store.updateWriteInAdjudication(firstWriteInAdjudicationId, {
    adjudicatedValue: 'Kangaroo',
    adjudicatedOptionId: 'kangaroo',
  });

  expect(view.render(store, { electionId, contestId })).toEqual(
    typedAs<Admin.WriteInAdjudicationTable>({
      contestId,
      writeInCount: 2,
      adjudicated: [
        {
          adjudicatedValue: 'Kangaroo',
          adjudicatedOptionId: 'kangaroo',
          writeInCount: 1,
          rows: [
            {
              transcribedValue: 'Gibbon',
              writeInAdjudicationId: firstWriteInAdjudicationId,
              writeInCount: 1,
              adjudicationOptionGroups: [
                officialCandidateAdjudicationOptionGroup,
                {
                  title: 'Original Transcription',
                  options: [{ adjudicatedValue: 'Gibbon' }],
                },
              ],
            },
          ],
        },
      ],
      transcribed: {
        writeInCount: 1,
        rows: [
          {
            transcribedValue: 'Hyena',
            writeInCount: 1,
            adjudicationOptionGroups: [
              officialCandidateAdjudicationOptionGroup,
              {
                title: 'Original Transcription',
                options: [{ adjudicatedValue: 'Hyena' }],
              },
            ],
          },
        ],
      },
    })
  );
});
