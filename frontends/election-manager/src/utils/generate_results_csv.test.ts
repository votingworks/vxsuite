import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { computeFullElectionTally } from '../lib/votecounting';
import { parseCvrsAndAssertSuccess } from '../lib/votecounting.test';
import { generateResultsCsv } from './generate_results_csv';

describe('generateResultsCSV', () => {
  it('conversion of full tally matches snapshot', () => {
    const { electionDefinition, cvrData, finalCsvData } =
      electionMinimalExhaustiveSampleFixtures;
    const { election } = electionDefinition;
    const castVoteRecords = parseCvrsAndAssertSuccess(cvrData, election);
    const fullTally = computeFullElectionTally(
      election,
      new Set(castVoteRecords)
    );
    const generatedCsvFileContent = generateResultsCsv(fullTally, election);
    expect(generatedCsvFileContent).toEqual(finalCsvData);
  });
});
