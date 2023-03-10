import { err, ok } from '@votingworks/basics';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
  BallotPageLayout,
  BallotPageMetadata,
  BatchInfo,
  CVR,
  ElectionDefinition,
  InterpretedHmpbPage,
  safeParseJson,
} from '@votingworks/types';
import {
  CAST_VOTE_RECORD_REPORT_FILENAME,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import {
  advanceTo as setDateMock,
  clear as clearDateMock,
} from 'jest-date-mock';
import {
  bestFishContest,
  fishCouncilContest,
  fishingContest,
  interpretedBmdPage,
  interpretedHmpbPage1,
  interpretedHmpbPage2,
  mockBallotMetadata,
} from '../../../test/fixtures/interpretations';
import { ExportDataError } from '../../exporter';
import {
  exportCastVoteRecordReportToUsbDrive,
  getCastVoteRecordReportStream,
  InvalidSheetFoundError,
  ResultSheet,
} from './export';
import { BallotPageLayoutsLookup } from './page_layouts';

const electionDefinition: ElectionDefinition = {
  ...electionMinimalExhaustiveSampleDefinition,
  electionHash: '0000000000', // fixed for resiliency to hash change
};
const definiteMarkThreshold = 0.15;
const ballotPageLayoutsLookup: BallotPageLayoutsLookup = [];
const batchInfo: BatchInfo[] = [];

const mockBallotPageLayout: BallotPageLayout = {
  pageSize: {
    width: 0,
    height: 0,
  },
  metadata: { ...mockBallotMetadata, pageNumber: 1 },
  contests: [],
};

jest.mock('./page_layouts', () => ({
  ...jest.requireActual('./page_layouts'),
  getBallotPageLayout: () => mockBallotPageLayout,
  getContestsForBallotPage: ({
    ballotPageMetadata,
  }: {
    ballotPageMetadata: BallotPageMetadata;
  }) =>
    ballotPageMetadata.pageNumber === 1
      ? [bestFishContest, fishCouncilContest]
      : [fishingContest],
}));

async function streamToString(stream: NodeJS.ReadableStream) {
  const reportChunks: string[] = [];
  for await (const chunk of stream) {
    reportChunks.push(chunk as string);
  }
  return reportChunks.join('');
}

test('getCastVoteRecordReportStream', async () => {
  setDateMock(new Date(2020, 3, 14));
  function* getResultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      indexInBatch: 1,
      frontNormalizedFilename: 'front.jpg',
      backNormalizedFilename: 'back.jpg',
      interpretation: [interpretedHmpbPage1, interpretedHmpbPage2],
    };

    yield {
      id: 'ballot-2',
      batchId: 'batch-1',
      indexInBatch: 2,
      frontNormalizedFilename: 'front.jpg',
      backNormalizedFilename: 'back.jpg',
      interpretation: [interpretedBmdPage, { type: 'BlankPage' }],
    };
  }

  const stream = getCastVoteRecordReportStream({
    electionDefinition,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo,
    reportContext: 'report-only',
    resultSheetGenerator: getResultSheetGenerator(),
  });

  // report is valid cast vote record report
  const parseResult = safeParseJson(
    await streamToString(stream),
    CVR.CastVoteRecordReportSchema
  );
  expect(parseResult.isOk()).toEqual(true);
  const report = parseResult.ok();
  expect(report).toMatchSnapshot();
  expect(report?.CVR).toHaveLength(2);

  clearDateMock();
});

test('getCastVoteRecordReportStream results in error when validation fails', async () => {
  function* getResultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      frontNormalizedFilename: 'front.jpg',
      backNormalizedFilename: 'back.jpg',
      interpretation: [interpretedHmpbPage1, { type: 'BlankPage' }],
    };
  }

  const stream = getCastVoteRecordReportStream({
    electionDefinition,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo,
    reportContext: 'backup',
    resultSheetGenerator: getResultSheetGenerator(),
  });

  try {
    await streamToString(stream);
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidSheetFoundError);
  }
  expect.assertions(1);
});

test('getCastVoteRecordReportStream can include file uris in backup format', async () => {
  function* getResultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      frontNormalizedFilename: 'front.jpg',
      backNormalizedFilename: 'back.jpg',
      interpretation: [
        {
          ...interpretedHmpbPage1,
          votes: {
            [fishCouncilContest.id]: [
              { id: 'write-in-1', name: 'Write In #1', isWriteIn: true },
            ],
          },
        },
        interpretedHmpbPage2,
      ],
    };
  }

  const stream = getCastVoteRecordReportStream({
    electionDefinition,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo,
    reportContext: 'backup',
    resultSheetGenerator: getResultSheetGenerator(),
  });

  const parseResult = safeParseJson(
    await streamToString(stream),
    CVR.CastVoteRecordReportSchema
  );
  expect(parseResult.isOk()).toEqual(true);
  const report = parseResult.ok();
  expect(report?.CVR).toHaveLength(1);

  // check that file URIs appears at the top level of the CVR
  expect(report).toHaveProperty(
    ['CVR', 0, 'BallotImage', 0, 'Location'],
    'file:./front.jpg'
  );
  expect(report).toHaveProperty(
    ['CVR', 0, 'BallotImage', 1, 'Location'],
    'file:./back.jpg'
  );

  // check that relevant file URI appears adjacent to the write-in
  expect(report).toHaveProperty(
    [
      'CVR',
      0,
      'CVRSnapshot',
      0, // modified snapshot has index 0
      'CVRContest',
      1, // write-in contest has index 1
      'CVRContestSelection',
      0,
      'SelectionPosition',
      0,
      'CVRWriteIn',
      'WriteInImage',
      'Location',
    ],
    'file:./front.jpg'
  );
});

const exportDataToUsbDriveMock = jest.fn().mockImplementation(() => ok());

jest.mock('../../exporter', () => ({
  ...jest.requireActual('../../exporter'),
  Exporter: jest.fn().mockImplementation(() => ({
    exportDataToUsbDrive: exportDataToUsbDriveMock,
  })),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createReadStream: () => 'mock-image-data',
}));

const expectedReportPath = `${SCANNER_RESULTS_FOLDER}/sample-county_example-primary-election_0000000000/machine_000__1_ballot__2020-04-14_00-00-00`;

const interpretedHmpbPage1WithWriteIn: InterpretedHmpbPage = {
  ...interpretedHmpbPage1,
  votes: {
    [fishCouncilContest.id]: [
      { id: 'write-in-1', name: 'Write In #1', isWriteIn: true },
    ],
  },
};

test('exportCastVoteRecordReportToUsbDrive, with write-in image', async () => {
  setDateMock(new Date(2020, 3, 14));
  function* getResultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      frontNormalizedFilename: 'front.jpg',
      backNormalizedFilename: 'back.jpg',
      interpretation: [interpretedHmpbPage1WithWriteIn, interpretedHmpbPage2],
    };

    yield {
      id: 'ballot-2',
      batchId: 'batch-1',
      frontNormalizedFilename: 'front.jpg',
      backNormalizedFilename: 'back.jpg',
      interpretation: [interpretedBmdPage, { type: 'BlankPage' }],
    };
  }

  const exportResult = await exportCastVoteRecordReportToUsbDrive({
    electionDefinition,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo: [],
    ballotsCounted: 1,
    getResultSheetGenerator,
  });

  expect(exportResult.isOk()).toEqual(true);
  expect(exportDataToUsbDriveMock).toHaveBeenCalledTimes(3);
  expect(exportDataToUsbDriveMock).toHaveBeenNthCalledWith(
    1,
    expectedReportPath,
    CAST_VOTE_RECORD_REPORT_FILENAME,
    expect.anything()
  );
  expect(exportDataToUsbDriveMock).toHaveBeenNthCalledWith(
    2,
    expectedReportPath,
    'ballot-images/batch-1/front.jpg',
    'mock-image-data'
  );
  expect(exportDataToUsbDriveMock).toHaveBeenNthCalledWith(
    3,
    expectedReportPath,
    'ballot-layouts/batch-1/front.layout.json',
    JSON.stringify(mockBallotPageLayout, undefined, 2)
  );

  const exportStream = exportDataToUsbDriveMock.mock.calls[0][2];

  const parseResult = safeParseJson(
    await streamToString(exportStream),
    CVR.CastVoteRecordReportSchema
  );
  expect(parseResult.isOk()).toEqual(true);

  const report = parseResult.ok();
  // check that file URI appears at top-level of CVR for front page
  expect(report).toHaveProperty(
    ['CVR', 0, 'BallotImage', 0, 'Location'],
    'file:./ballot-images/batch-1/front.jpg'
  );

  // check that file URI does not appear at top-level of CVR for back page
  expect(report).toHaveProperty(
    ['CVR', 0, 'BallotImage', 1, 'Location'],
    undefined
  );

  // check that file URI appears adjacent to the write-in
  expect(report).toHaveProperty(
    [
      'CVR',
      0,
      'CVRSnapshot',
      0, // modified snapshot has index 0
      'CVRContest',
      1, // write-in contest has index 1
      'CVRContestSelection',
      0,
      'SelectionPosition',
      0,
      'CVRWriteIn',
      'WriteInImage',
      'Location',
    ],
    'file:./ballot-images/batch-1/front.jpg'
  );
});

test('exportCastVoteRecordReportToUsbDrive bubbles up export errors', async () => {
  function* getResultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      frontNormalizedFilename: 'front.jpg',
      backNormalizedFilename: 'back.jpg',
      interpretation: [interpretedHmpbPage1WithWriteIn, interpretedHmpbPage2],
    };
  }

  const exportDataError: ExportDataError = {
    type: 'permission-denied',
    message: 'unable to access filesystem',
  };

  // mock cast vote record report export failing
  exportDataToUsbDriveMock.mockResolvedValueOnce(err(exportDataError));

  const exportResult = await exportCastVoteRecordReportToUsbDrive({
    electionDefinition,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo: [],
    ballotsCounted: 1,
    getResultSheetGenerator,
  });

  expect(exportResult.isErr()).toEqual(true);
  expect(exportResult.err()).toEqual(exportDataError);

  // mock image export failing. possible but unlikely for this to happen since
  // at this point report has already exported successfully
  exportDataToUsbDriveMock.mockResolvedValueOnce(ok());
  exportDataToUsbDriveMock.mockResolvedValueOnce(err(exportDataError));

  const exportResult2 = await exportCastVoteRecordReportToUsbDrive({
    electionDefinition,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo: [],
    ballotsCounted: 1,
    getResultSheetGenerator,
  });

  expect(exportResult2.isErr()).toEqual(true);
  expect(exportResult2.err()).toEqual(exportDataError);
});
