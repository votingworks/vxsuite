import { assert, DateWithoutTime, range } from '@votingworks/basics';
import {
  BallotStyleGroupId,
  BallotStyleId,
  CandidateContest,
  DistrictId,
  Election,
  ElectionId,
} from '@votingworks/types';
import { AllBubbleBallotConfig } from './config';

export function contestId(page: number): string {
  return `test-contest-${page}`;
}

export function candidateId(
  page: number,
  row: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _column: number
): string {
  return `test-candidate-${page}-${row}`;
}

export function createElection({
  ballotPaperSize,
  gridColumns,
  gridRows,
  seats,
  // footerRowHeight,
  numPages,
}: AllBubbleBallotConfig): Election {
  const districtId = 'test-district' as DistrictId;
  const precinctId = 'test-precinct';

  const gridPositions = range(1, numPages + 1).flatMap((page) =>
    range(1, gridRows[page - 1] + 1).flatMap((row) =>
      range(1, gridColumns[page - 1] + 1).map((column) => ({
        page,
        row,
        column,
      }))
    )
  );
  const ballotStyleId = 'test-ballot-style' as BallotStyleId;
  const ballotStyleGroupId = 'test-ballot-style' as BallotStyleGroupId;

  assert(
    numPages === gridRows.length &&
      numPages === gridColumns.length &&
      numPages === seats.length
  );

  const contests: CandidateContest[] = range(1, numPages + 1).map((page) => {
    const pageGridPositions = gridPositions.filter(
      (position) => position.page === page
    );
    return {
      id: contestId(page),
      type: 'candidate',
      title: `Contest ${page}: ${seats[page - 1]}/${pageGridPositions.length}`,
      districtId,
      candidates: pageGridPositions.map(({ row, column }) => ({
        id: candidateId(page, row, column),
        name: `Candidate ${page}-${row}`,
      })),
      allowWriteIns: true,
      seats: seats[page - 1],
    };
  });

  return {
    id: 'test-election-75-135' as ElectionId,
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
        districtIds: [districtId],
      },
    ],
    state: 'Test State',
    title: 'Test Election: 75/135',
    type: 'general',
    seal: '',
    ballotStrings: {},
  };
}
