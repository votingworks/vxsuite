import { DateWithoutTime, range } from '@votingworks/basics';
import {
  BallotStyleGroupId,
  BallotStyleId,
  CandidateContest,
  DistrictId,
  Election,
  ElectionId,
} from '@votingworks/types';
import {
  ballotPaperSize,
  footerRowHeight,
  gridColumns,
  gridRows,
  numPages,
} from './config';

export function contestId(page: number): string {
  return `test-contest-page-${page}`;
}

export function candidateId(page: number, row: number, column: number): string {
  return `test-candidate-page-${page}-row-${row}-column-${column}`;
}

export function createElection(): Election {
  const districtId = 'test-district' as DistrictId;
  const precinctId = 'test-precinct';

  const gridPositions = range(1, numPages + 1).flatMap((page) =>
    range(1, gridRows - footerRowHeight - 1).flatMap((row) =>
      range(1, gridColumns - 1).map((column) => ({
        page,
        row,
        column,
      }))
    )
  );
  const ballotStyleId = 'sheet-1' as BallotStyleId;
  const ballotStyleGroupId = 'sheet-1' as BallotStyleGroupId;

  const contests: CandidateContest[] = range(1, 3).map((page) => {
    const pageGridPositions = gridPositions.filter(
      (position) => position.page === page
    );
    return {
      id: contestId(page),
      type: 'candidate',
      title: `Test Contest - Page ${page}`,
      districtId,
      candidates: pageGridPositions.map(({ row, column }) => ({
        id: candidateId(page, row, column),
        name: `Page ${page}, Row ${row}, Column ${column}`,
      })),
      allowWriteIns: false,
      seats: pageGridPositions.length,
    };
  });

  return {
    id: 'all-bubble-ballot-election' as ElectionId,
    ballotLayout: {
      paperSize: ballotPaperSize,
      metadataEncoding: 'qr-code',
    },
    ballotStyles: [
      {
        id: ballotStyleId,
        groupId: ballotStyleGroupId,
        districts: [districtId],
        precincts: [precinctId],
      },
    ],
    contests,
    county: {
      id: 'test-county',
      name: 'Test County',
    },
    date: new DateWithoutTime('2023-05-10'),
    districts: [
      {
        id: districtId,
        name: 'Test District',
      },
    ],
    parties: [],
    precincts: [
      {
        id: precinctId,
        name: 'Test Precinct',
      },
    ],
    state: 'Test State',
    title: 'Test Election - All Bubble Ballot',
    type: 'general',
    seal: '',
    ballotStrings: {},
  };
}
