import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import { find, typedAs } from '@votingworks/utils';
import * as Admin from '../index';
import * as view from './write_in_adjudication_table';

const officialCandidatesOptionGroup: Admin.WriteInAdjudicationTableOptionGroup =
  {
    title: 'Official Candidates',
    options: [
      {
        adjudicatedValue: 'Elephant',
        adjudicatedOptionId: 'elephant',
        enabled: true,
      },
      {
        adjudicatedValue: 'Kangaroo',
        adjudicatedOptionId: 'kangaroo',
        enabled: true,
      },
      {
        adjudicatedValue: 'Lion',
        adjudicatedOptionId: 'lion',
        enabled: true,
      },
      {
        adjudicatedValue: 'Zebra',
        adjudicatedOptionId: 'zebra',
        enabled: true,
      },
    ],
  };

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
  const contestId = 'zoo-council-mammal';
  const contest = find(
    electionMinimalExhaustiveSampleFixtures.election.contests,
    ({ id }) => id === contestId
  ) as CandidateContest;

  const summariesAfterTranscription: Admin.WriteInSummaryEntryNonPending[] = [
    {
      status: 'transcribed',
      contestId: 'zoo-council-mammal',
      transcribedValue: 'Gibbon',
      writeInCount: 1,
    },
    {
      status: 'transcribed',
      contestId: 'zoo-council-mammal',
      transcribedValue: 'Hyena',
      writeInCount: 1,
    },
    {
      status: 'transcribed',
      contestId: 'zoo-council-mammal',
      transcribedValue: 'Polar Bear',
      writeInCount: 1,
    },
  ];

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
              officialCandidatesOptionGroup,
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
              officialCandidatesOptionGroup,
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
              officialCandidatesOptionGroup,
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
  const summariesAfterAdjudication: Admin.WriteInSummaryEntryNonPending[] = [
    {
      status: 'adjudicated',
      contestId: 'zoo-council-mammal',
      writeInCount: 1,
      transcribedValue: 'Gibbon',
      writeInAdjudication: {
        id: 'gibbon-adjudication-id',
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Gibbon',
        adjudicatedValue: 'Gibbon',
      },
    },
    {
      status: 'adjudicated',
      contestId: 'zoo-council-mammal',
      writeInCount: 1,
      transcribedValue: 'Hyena',
      writeInAdjudication: {
        id: 'hyena-adjudication-id',
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Hyena',
        adjudicatedValue: 'Gibbon',
      },
    },
    {
      status: 'transcribed',
      contestId: 'zoo-council-mammal',
      transcribedValue: 'Polar Bear',
      writeInCount: 1,
    },
  ];

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
                officialCandidatesOptionGroup,
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
                officialCandidatesOptionGroup,
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
              officialCandidatesOptionGroup,
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
