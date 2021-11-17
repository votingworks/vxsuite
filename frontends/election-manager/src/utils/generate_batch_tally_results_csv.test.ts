import {
  electionMultiPartyPrimaryWithDataFiles,
  electionWithMsEitherNeitherWithDataFiles,
} from '@votingworks/fixtures';
import {
  generateCvr,
  generateFileContentFromCvrs,
} from '@votingworks/test-utils';
import { computeFullElectionTally } from '../lib/votecounting';
import { parseCvrsAndAssertSuccess } from '../lib/votecounting.test';
import {
  generateBatchTallyResultsCsv,
  generateHeaderRowForBatchResultsCsv,
  generateRowsForBatchTallyResultsCsv,
} from './generate_batch_tally_results_csv';

describe('generateBatchTallyResultsCSV', () => {
  it('generates correct candidate tallies in primary election', () => {
    const {
      election,
    } = electionMultiPartyPrimaryWithDataFiles.electionDefinition;
    const cvrsFileContent = generateFileContentFromCvrs([
      generateCvr(
        election,
        {
          'governor-contest-liberty': ['aaron-aligator'],
          'schoolboard-liberty': [],
        },
        { batchId: 'batch-1', batchLabel: 'Batch 1', ballotStyleId: '2L' }
      ),
      generateCvr(
        election,
        {
          'governor-contest-liberty': ['peter-pigeon'],
          'schoolboard-liberty': ['amber-brkich', 'chris-daugherty'],
        },
        { batchId: 'batch-1', batchLabel: 'Batch 1', ballotStyleId: '2L' }
      ),
      generateCvr(
        election,
        {
          'governor-contest-liberty': [],
          'schoolboard-liberty': ['amber-brkich'],
        },
        { batchId: 'batch-2', batchLabel: 'Batch 2', ballotStyleId: '2L' }
      ),
    ]);
    const castVoteRecords = parseCvrsAndAssertSuccess(
      cvrsFileContent,
      election
    );
    const fullTally = computeFullElectionTally(election, [castVoteRecords]);
    const headerRow = generateHeaderRowForBatchResultsCsv(election);
    expect(headerRow).toContain(
      'Batch ID,Batch Name,Tabulator,Number of Ballots'
    );
    expect(headerRow).toContain(
      'Liberty Party Governor - Ballots Cast,Liberty Party Governor - Undervotes,Liberty Party Governor - Overvotes,Liberty Party Governor - Aaron Aligator,Liberty Party Governor - Peter Pigeon,Liberty Party Governor - Write In,'
    );
    const expectedDataRows = [
      'batch-1,Batch 1,scanner-1,2,2,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
      'batch-2,Batch 2,scanner-1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
    ];
    let i = 0;
    for (const resultDataRow of generateRowsForBatchTallyResultsCsv(
      fullTally,
      election
    )) {
      expect(resultDataRow).toEqual(expectedDataRows[i]);
      i += 1;
    }
  });

  it('generates correct candidate tallies in primary election', () => {
    const {
      election,
    } = electionWithMsEitherNeitherWithDataFiles.electionDefinition;
    const cvrsFileContent = generateFileContentFromCvrs([
      generateCvr(
        election,
        {
          '750000017': ['yes'],
          '750000018': [],
          '750000015': ['yes'],
          '750000016': ['no'],
        },
        { batchId: 'batch-1', batchLabel: 'Batch 1', ballotStyleId: '5' }
      ),
      generateCvr(
        election,
        {
          '750000017': ['no'],
          '750000018': ['yes', 'no'],
          '750000015': ['no'],
          '750000016': ['no'],
        },
        { batchId: 'batch-1', batchLabel: 'Batch 1', ballotStyleId: '5' }
      ),
      generateCvr(
        election,
        {
          '750000017': ['no', 'yes'],
          '750000018': ['no'],
          '750000015': [],
          '750000016': ['yes'],
        },
        { batchId: 'batch-2', batchLabel: 'Batch 2', ballotStyleId: '4' }
      ),
    ]);
    const castVoteRecords = parseCvrsAndAssertSuccess(
      cvrsFileContent,
      election
    );
    const fullTally = computeFullElectionTally(election, [castVoteRecords]);
    const expectedDataRows = [
      'batch-1,Batch 1,scanner-1,2,2,2,0,0,0,0,0,2,2,0,0,0,0,0,2,2,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,2,2,0,0,0,2,0,0,1,1,2,1,1,0,0,2,0,0,1,1,2,0,0,0,2',
      'batch-2,Batch 2,scanner-1,1,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,0,1,0,0,0,1,1,1,0,0,0,1,0,0,1,0',
    ];
    const headerRow = generateHeaderRowForBatchResultsCsv(election);
    const generatedRows = generateRowsForBatchTallyResultsCsv(
      fullTally,
      election
    );
    expect(headerRow).toContain(
      'Batch ID,Batch Name,Tabulator,Number of Ballots'
    );
    expect(headerRow).toContain(
      'Ballot Measure 2 House Concurrent Resolution No  47 - Ballots Cast,Ballot Measure 2 House Concurrent Resolution No  47 - Undervotes,Ballot Measure 2 House Concurrent Resolution No  47 - Overvotes,Ballot Measure 2 House Concurrent Resolution No  47 - Yes,Ballot Measure 2 House Concurrent Resolution No  47 - No'
    );
    expect(headerRow).toContain(
      'Ballot Measure 1   Either Neither - Ballots Cast,Ballot Measure 1   Either Neither - Undervotes,Ballot Measure 1   Either Neither - Overvotes,Ballot Measure 1   Either Neither - Yes,Ballot Measure 1   Either Neither - No,Ballot Measure 1   Pick One - Ballots Cast,Ballot Measure 1   Pick One - Undervotes,Ballot Measure 1   Pick One - Overvotes,Ballot Measure 1   Pick One - Yes,Ballot Measure 1   Pick One - No'
    );
    let i = 0;
    for (const resultDataRow of generatedRows) {
      expect(resultDataRow).toEqual(expectedDataRows[i]);
      i += 1;
    }
  });

  it('conversion of full tally matches snapshot', () => {
    const {
      electionDefinition,
      cvrData,
      csvData,
    } = electionMultiPartyPrimaryWithDataFiles;
    const { election } = electionDefinition;
    const castVoteRecords = parseCvrsAndAssertSuccess(cvrData, election);
    const fullTally = computeFullElectionTally(election, [castVoteRecords]);
    const generatedCsvFileContent = generateBatchTallyResultsCsv(
      fullTally,
      election
    );
    expect(generatedCsvFileContent).toEqual(csvData);
  });
});
