import { Admin } from '@votingworks/api';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import { assert, find, typedAs } from '@votingworks/utils';
import { buildOfficialCandidatesWriteInAdjudicationOptionGroup } from '../../test/utils';
import { Store } from '../store';
import * as view from './write_in_adjudication_table';

test('no transcribed or adjudicated write-ins', () => {
  const contest =
    electionMinimalExhaustiveSampleFixtures.election.contests.find(
      ({ id }) => id === 'zoo-council-mammal'
    ) as CandidateContest;
  expect(view.render(contest, [])).toEqual(
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
  const contest = find(
    electionMinimalExhaustiveSampleFixtures.election.contests,
    ({ id }) => id === contestId
  ) as CandidateContest;

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
  const [firstWriteIn, secondWriteIn, thirdWriteIn] = writeIns;
  assert(firstWriteIn && secondWriteIn && thirdWriteIn);

  store.transcribeWriteIn(firstWriteIn.id, 'Gibbon');
  store.transcribeWriteIn(secondWriteIn.id, 'Hyena');
  store.transcribeWriteIn(thirdWriteIn.id, 'Polar Bear');

  const summariesAfterTranscription = store
    .getWriteInAdjudicationSummary({ electionId, contestId })
    .filter(
      (entry): entry is Admin.WriteInSummaryEntryNonPending =>
        entry.status !== 'pending'
    );

  expect(view.render(contest, summariesAfterTranscription)).toEqual(
    typedAs<Admin.WriteInAdjudicationTable>({
      contestId,
      writeInCount: 3,
      adjudicated: [],
      transcribed: {
        writeInCount: 3,
        rows: [
          {
            transcribedValue: 'Gibbon',
            writeInCount: 1,
            adjudicationOptionGroups: [
              buildOfficialCandidatesWriteInAdjudicationOptionGroup(contest),
              {
                title: 'Write-In Candidates',
                options: [
                  { adjudicatedValue: 'Gibbon', enabled: true },
                  { adjudicatedValue: 'Hyena', enabled: true },
                  { adjudicatedValue: 'Polar Bear', enabled: true },
                ],
              },
            ],
          },
          {
            transcribedValue: 'Hyena',
            writeInCount: 1,
            adjudicationOptionGroups: [
              buildOfficialCandidatesWriteInAdjudicationOptionGroup(contest),
              {
                title: 'Write-In Candidates',
                options: [
                  { adjudicatedValue: 'Gibbon', enabled: true },
                  { adjudicatedValue: 'Hyena', enabled: true },
                  { adjudicatedValue: 'Polar Bear', enabled: true },
                ],
              },
            ],
          },
          {
            transcribedValue: 'Polar Bear',
            writeInCount: 1,
            adjudicationOptionGroups: [
              buildOfficialCandidatesWriteInAdjudicationOptionGroup(contest),
              {
                title: 'Write-In Candidates',
                options: [
                  { adjudicatedValue: 'Gibbon', enabled: true },
                  { adjudicatedValue: 'Hyena', enabled: true },
                  { adjudicatedValue: 'Polar Bear', enabled: true },
                ],
              },
            ],
          },
        ],
      },
    })
  );

  // adjudicate "Hyena" and "Gibbon" together
  store.createWriteInAdjudication({
    electionId,
    contestId,
    transcribedValue: 'Hyena',
    adjudicatedValue: 'Gibbon',
  });

  const summariesAfterAdjudication = store
    .getWriteInAdjudicationSummary({ electionId, contestId })
    .filter(
      (entry): entry is Admin.WriteInSummaryEntryNonPending =>
        entry.status !== 'pending'
    );

  expect(view.render(contest, summariesAfterAdjudication)).toEqual(
    typedAs<Admin.WriteInAdjudicationTable>({
      contestId,
      writeInCount: 3,
      adjudicated: [
        {
          adjudicatedValue: 'Gibbon',
          writeInCount: 2,
          rows: [
            {
              transcribedValue: 'Gibbon',
              writeInAdjudicationId: expect.any(String),
              writeInCount: 1,
              editable: false,
              adjudicationOptionGroups: [
                buildOfficialCandidatesWriteInAdjudicationOptionGroup(contest),
                {
                  title: 'Write-In Candidates',
                  options: [
                    { adjudicatedValue: 'Gibbon', enabled: true },
                    { adjudicatedValue: 'Hyena', enabled: false },
                    { adjudicatedValue: 'Polar Bear', enabled: true },
                  ],
                },
              ],
            },
            {
              transcribedValue: 'Hyena',
              writeInAdjudicationId: expect.any(String),
              writeInCount: 1,
              editable: true,
              adjudicationOptionGroups: [
                buildOfficialCandidatesWriteInAdjudicationOptionGroup(contest),
                {
                  title: 'Write-In Candidates',
                  options: [
                    { adjudicatedValue: 'Gibbon', enabled: true },
                    { adjudicatedValue: 'Hyena', enabled: true },
                    { adjudicatedValue: 'Polar Bear', enabled: true },
                  ],
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
            transcribedValue: 'Polar Bear',
            writeInCount: 1,
            adjudicationOptionGroups: [
              buildOfficialCandidatesWriteInAdjudicationOptionGroup(contest),
              {
                title: 'Write-In Candidates',
                options: [
                  { adjudicatedValue: 'Gibbon', enabled: true },
                  { adjudicatedValue: 'Hyena', enabled: false },
                  { adjudicatedValue: 'Polar Bear', enabled: true },
                ],
              },
            ],
          },
        ],
      },
    })
  );
});
