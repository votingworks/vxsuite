import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { CastVoteRecord, Election } from '@votingworks/types';
import { computeFullElectionTally, parseCvrs } from '@votingworks/shared';
import { generateResultsCsv } from './generate_results_csv';

function parseCvrsAndAssertSuccess(
  cvrsFileContents: string,
  election: Election
): CastVoteRecord[] {
  return [...parseCvrs(cvrsFileContents, election)].map(({ cvr, errors }) => {
    expect({ cvr, errors }).toEqual({ cvr, errors: [] });
    return cvr;
  });
}

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
