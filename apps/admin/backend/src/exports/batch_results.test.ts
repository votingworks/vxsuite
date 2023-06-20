import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { Tabulation, writeInCandidate } from '@votingworks/types';
import { buildElectionResultsFixture } from '@votingworks/utils';
import { Buffer } from 'buffer';
import { generateBatchResultsFile } from './batch_results';
import { ScannerBatch } from '../types';

test('generateBatchResultsFile', async () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  const batchGroupedResults: Tabulation.ElectionResultsGroupMap = {
    'root&batchId=batch-1': buildElectionResultsFixture({
      election,
      cardCounts: {
        hmpb: [30, 29],
        bmd: 5,
      },
      contestResultsSummaries: {
        'zoo-council-mammal': {
          type: 'candidate',
          ballots: 35,
          undervotes: 2,
          overvotes: 3,
          officialOptionTallies: {
            lion: 25,
            [writeInCandidate.id]: 5,
          },
        },
        fishing: {
          type: 'yesno',
          ballots: 34,
          undervotes: 1,
          overvotes: 3,
          yesTally: 25,
          noTally: 5,
        },
      },
      includeGenericWriteIn: true,
    }),
    'root&batchId=batch-2': buildElectionResultsFixture({
      election,
      cardCounts: {
        hmpb: [29, 29],
        bmd: 1,
      },
      contestResultsSummaries: {
        'zoo-council-mammal': {
          type: 'candidate',
          ballots: 30,
          undervotes: 1,
          overvotes: 3,
          officialOptionTallies: {
            lion: 20,
            [writeInCandidate.id]: 6,
          },
        },
        fishing: {
          type: 'yesno',
          ballots: 30,
          undervotes: 1,
          overvotes: 5,
          yesTally: 20,
          noTally: 4,
        },
      },
      includeGenericWriteIn: true,
    }),
  };

  const allBatchMetadata: ScannerBatch[] = [
    {
      electionId: 'id',
      batchId: 'batch-1',
      label: 'Batch 1',
      scannerId: 'scanner-1',
    },
    {
      electionId: 'id',
      batchId: 'batch-2',
      label: 'Batch 2',
      scannerId: 'scanner-1',
    },
  ];

  const csvExportStream = generateBatchResultsFile({
    election,
    batchGroupedResults,
    allBatchMetadata,
  });

  const chunks = [];

  for await (const chunk of csvExportStream) {
    chunks.push(Buffer.from(chunk));
  }

  const csvString = Buffer.concat(chunks).toString('utf-8');

  expect(csvString).toMatchInlineSnapshot(`
    "Batch ID,Batch Name,Tabulator,Number of Ballots,\\"Mammal Party Best Animal - Ballots Cast\\",\\"Mammal Party Best Animal - Undervotes\\",\\"Mammal Party Best Animal - Overvotes\\",\\"Mammal Party Best Animal - Horse\\",\\"Mammal Party Best Animal - Otter\\",\\"Mammal Party Best Animal - Fox\\",\\"Fish Party Best Animal - Ballots Cast\\",\\"Fish Party Best Animal - Undervotes\\",\\"Fish Party Best Animal - Overvotes\\",\\"Fish Party Best Animal - Seahorse\\",\\"Fish Party Best Animal - Salmon\\",\\"Mammal Party Zoo Council - Ballots Cast\\",\\"Mammal Party Zoo Council - Undervotes\\",\\"Mammal Party Zoo Council - Overvotes\\",\\"Mammal Party Zoo Council - Zebra\\",\\"Mammal Party Zoo Council - Lion\\",\\"Mammal Party Zoo Council - Kangaroo\\",\\"Mammal Party Zoo Council - Elephant\\",\\"Mammal Party Zoo Council - Write In\\",\\"Fish Party Zoo Council - Ballots Cast\\",\\"Fish Party Zoo Council - Undervotes\\",\\"Fish Party Zoo Council - Overvotes\\",\\"Fish Party Zoo Council - Manta Ray\\",\\"Fish Party Zoo Council - Pufferfish\\",\\"Fish Party Zoo Council - Rockfish\\",\\"Fish Party Zoo Council - Triggerfish\\",\\"Fish Party Zoo Council - Write In\\",\\"Ballot Measure 1 - Ballots Cast\\",\\"Ballot Measure 1 - Undervotes\\",\\"Ballot Measure 1 - Overvotes\\",\\"Ballot Measure 1 - Yes\\",\\"Ballot Measure 1 - No\\",\\"Ballot Measure 1 - Ballots Cast\\",\\"Ballot Measure 1 - Undervotes\\",\\"Ballot Measure 1 - Overvotes\\",\\"Ballot Measure 1 - Yes\\",\\"Ballot Measure 1 - No\\",\\"Ballot Measure 3 - Ballots Cast\\",\\"Ballot Measure 3 - Undervotes\\",\\"Ballot Measure 3 - Overvotes\\",\\"Ballot Measure 3 - Yes\\",\\"Ballot Measure 3 - No\\"
    batch-1,Batch 1,scanner-1,35,0,0,0,0,0,0,0,0,0,0,0,35,2,3,0,25,0,0,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,34,1,3,25,5
    batch-2,Batch 2,scanner-1,30,0,0,0,0,0,0,0,0,0,0,0,30,1,3,0,20,0,0,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,30,1,5,20,4
    "
  `);
});
