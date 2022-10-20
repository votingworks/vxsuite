import { Admin } from '@votingworks/api';
import {
  BallotLocale,
  ElectionDefinition,
  getPrecinctById,
} from '@votingworks/types';
import {
  getBallotPath,
  getBallotStylesData,
  sortBallotStyleDataByPrecinct,
} from './election';

const headers = ['Filename', 'Precinct', 'Ballot Style'];

/**
 *
 * Creates a CSV metadata file for ballot PDF export zip archive. Includes a
 * row for each PDF file included in the zip archive.
 * @param electionDefinition Contains the election schema and hash
 * @param ballotMode Identifies the export as for official, test, or sample ballots
 * @param isAbsentee Identifies the export as for absentee or precinct ballots
 * @param ballotLocales Identifies the export as for a given BallotLocale
 * @returns string file content for a CSV file with export metadata
 */
export function generatePdfExportMetadataCsv({
  electionDefinition,
  ballotMode,
  isAbsentee,
  ballotLocales,
}: {
  electionDefinition: ElectionDefinition;
  ballotMode: Admin.BallotMode;
  isAbsentee: boolean;
  ballotLocales: BallotLocale;
}): string {
  const { election, electionHash } = electionDefinition;
  const ballotStyleList = sortBallotStyleDataByPrecinct(
    election,
    getBallotStylesData(election)
  );

  let finalDataString = headers.join(',');
  for (const ballotStyle of ballotStyleList) {
    const filename = getBallotPath({
      ballotStyleId: ballotStyle.ballotStyleId,
      precinctId: ballotStyle.precinctId,
      ballotMode,
      isAbsentee,
      election,
      electionHash,
      locales: ballotLocales,
    });
    const precinctName = getPrecinctById({
      election,
      precinctId: ballotStyle.precinctId,
    })?.name;
    const row = [filename, precinctName, ballotStyle.ballotStyleId].join(',');
    finalDataString += `\n${row}`;
  }

  return finalDataString;
}
