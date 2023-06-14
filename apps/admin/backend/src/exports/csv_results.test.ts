import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { Tabulation } from '@votingworks/types';
import { Buffer } from 'buffer';
import { buildElectionResultsFixture } from '@votingworks/utils';
import { generateResultsCsv } from './csv_results';
import { WriteInCandidateRecord } from '../types';

test('generateResultsCsv', async () => {
  const { election } =
    electionMinimalExhaustiveSampleFixtures.electionDefinition;
  const electionResultsByPrecinctAndVotingMethod: Tabulation.GroupedElectionResults =
    {
      'root&precinct-1&absentee': {
        precinctId: 'precinct-1',
        votingMethod: 'absentee',
        ...buildElectionResultsFixture({
          election,
          includeGenericWriteIn: true,
          cardCounts: {
            hmpb: [10],
            bmd: 0,
          },
          contestResultsSummaries: {
            'zoo-council-mammal': {
              type: 'candidate',
              ballots: 10,
              overvotes: 3,
              undervotes: 2,
              officialOptionTallies: {
                lion: 20,
                'write-in': 3,
              },
              writeInOptionTallies: {
                unofficial: {
                  name: 'Unofficial Write-In',
                  tally: 2,
                },
              },
            },
          },
        }),
      },
      'root&precinct-2&precinct': {
        precinctId: 'precinct-2',
        votingMethod: 'precinct',
        ...buildElectionResultsFixture({
          election,
          includeGenericWriteIn: true,
          cardCounts: {
            hmpb: [30, 0],
            bmd: 0,
          },
          contestResultsSummaries: {
            fishing: {
              type: 'yesno',
              ballots: 10,
              overvotes: 3,
              undervotes: 2,
              yesTally: 1,
              noTally: 4,
            },
          },
        }),
      },
    };

  const writeInCandidates: WriteInCandidateRecord[] = [
    {
      electionId: 'id',
      id: 'unofficial',
      name: 'Unofficial Write-In',
      contestId: 'zoo-council-mammal',
    },
  ];

  const resultsGenerator = generateResultsCsv({
    electionResultsByPrecinctAndVotingMethod,
    election,
    writeInCandidates,
  });

  const chunks = [];

  for await (const chunk of resultsGenerator) {
    chunks.push(Buffer.from(chunk));
  }

  const csvString = Buffer.concat(chunks).toString('utf-8');

  expect(csvString).toMatchSnapshot();
});
