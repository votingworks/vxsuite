import { assert, ok } from '@votingworks/basics';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
  BallotPageLayout,
  BallotPageMetadata,
  BatchInfo,
  CVR,
  getDisplayElectionHash,
  safeParseJson,
} from '@votingworks/types';
import { SCANNER_RESULTS_FOLDER } from '@votingworks/utils';
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
import {
  exportCastVoteRecordReportToUsbDrive,
  buildCastVoteRecordReport,
  ResultSheet,
} from './export';
import { BallotPageLayoutsLookup } from './page_layouts';

const electionDefinition = electionMinimalExhaustiveSampleDefinition;
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

test('buildCastVoteRecordReport', async () => {
  setDateMock(new Date(2020, 3, 14));
  function* resultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      frontNormalizedFilename: 'front.jpg',
      backNormalizedFilename: 'back.jpg',
      interpretation: [interpretedHmpbPage1, interpretedHmpbPage2],
    };

    yield {
      id: 'ballot-2',
      batchId: 'batch-1',
      frontNormalizedFilename: 'front.jpg',
      backNormalizedFilename: 'back.jpg',
      interpretation: [interpretedBmdPage, { type: 'BlankPage' }],
    };
  }

  const buildCastVoteRecordReportResult = await buildCastVoteRecordReport({
    electionDefinition,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo,
    imageOptions: {
      directory: 'ballot-images',
      which: 'write-ins',
    },
    resultSheetGenerator: resultSheetGenerator(),
  });

  expect(buildCastVoteRecordReportResult.isOk()).toBeTruthy();
  const stream = buildCastVoteRecordReportResult.unsafeUnwrap();

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

test('buildCastVoteRecordReport results in error when validation fails', async () => {
  function* resultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      frontNormalizedFilename: 'front.jpg',
      backNormalizedFilename: 'back.jpg',
      interpretation: [interpretedHmpbPage1, { type: 'BlankPage' }],
    };
  }

  const buildCastVoteRecordReportResult = await buildCastVoteRecordReport({
    electionDefinition,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo,
    imageOptions: {
      directory: 'ballot-images',
      which: 'write-ins',
    },
    resultSheetGenerator: resultSheetGenerator(),
  });

  expect(buildCastVoteRecordReportResult.isErr()).toBeTruthy();
});

test('buildCastVoteRecordReport can include file uris according to setting', async () => {
  function* resultSheetGenerator(): Generator<ResultSheet> {
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

  const testCases = [
    {
      which: 'write-ins',
      expectedBallotImages: [
        {
          '@type': 'CVR.ImageData',
          Location: 'file:./ballot-images/front.jpg',
        },
        {
          '@type': 'CVR.ImageData',
        },
      ],
      expectedWriteInImage: {
        '@type': 'CVR.ImageData',
        Location: 'file:./ballot-images/front.jpg',
      },
    },
    {
      which: 'all',
      expectedBallotImages: [
        {
          '@type': 'CVR.ImageData',
          Location: 'file:./ballot-images/front.jpg',
        },
        {
          '@type': 'CVR.ImageData',
          Location: 'file:./ballot-images/back.jpg',
        },
      ],
      expectedWriteInImage: {
        '@type': 'CVR.ImageData',
        Location: 'file:./ballot-images/front.jpg',
      },
    },
    {
      which: 'none',
      expectedBallotImages: undefined,
      expectedWriteInImage: undefined,
    },
  ] as const;

  for (const testCase of testCases) {
    const buildCastVoteRecordReportResult = await buildCastVoteRecordReport({
      electionDefinition,
      definiteMarkThreshold,
      ballotPageLayoutsLookup,
      isTestMode: false,
      batchInfo,
      imageOptions: {
        directory: 'ballot-images',
        which: testCase.which,
      },
      resultSheetGenerator: resultSheetGenerator(),
    });

    expect(buildCastVoteRecordReportResult.isOk()).toBeTruthy();
    const stream = buildCastVoteRecordReportResult.unsafeUnwrap();

    const parseResult = safeParseJson(
      await streamToString(stream),
      CVR.CastVoteRecordReportSchema
    );
    expect(parseResult.isOk()).toEqual(true);
    const result = parseResult.ok();
    expect(result?.CVR).toHaveLength(1);

    // Check that file URI appears at the top level of the CVR
    expect(result?.CVR?.[0]?.BallotImage).toEqual(
      testCase.expectedBallotImages
    );

    // Check that file URI appears adjacent to the write-in
    const modifiedSnapshot = result?.CVR?.[0]?.CVRSnapshot?.find(
      (snapshot) => snapshot.Type === CVR.CVRType.Modified
    );
    assert(modifiedSnapshot);
    const contestWithWriteIn = modifiedSnapshot.CVRContest?.find(
      (contest) => contest.ContestId === fishCouncilContest.id
    );
    assert(contestWithWriteIn);
    expect(
      contestWithWriteIn.CVRContestSelection?.[0]?.SelectionPosition?.[0]
        ?.CVRWriteIn?.WriteInImage
    ).toEqual(testCase.expectedWriteInImage);
  }
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

const expectedReportPath = `${SCANNER_RESULTS_FOLDER}/sample-county_example-primary-election_${getDisplayElectionHash(
  electionMinimalExhaustiveSampleDefinition
)}/machine_000__1_ballot__2020-04-14_00-00-00`;

test('exportCastVoteRecordReportToUsbDrive, no images', async () => {
  setDateMock(new Date(2020, 3, 14));
  function* resultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      frontNormalizedFilename: 'front.jpg',
      backNormalizedFilename: 'back.jpg',
      interpretation: [interpretedHmpbPage1, interpretedHmpbPage2],
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
    whichImages: 'none',
    resultSheetGenerator: resultSheetGenerator(),
  });

  expect(exportResult.isOk()).toEqual(true);
  expect(exportDataToUsbDriveMock).toHaveBeenCalledTimes(1);
  expect(exportDataToUsbDriveMock).toHaveBeenCalledWith(
    expectedReportPath,
    'report.json',
    expect.anything()
  );

  const exportStream = exportDataToUsbDriveMock.mock.calls[0][2];

  const parseResult = safeParseJson(
    await streamToString(exportStream),
    CVR.CastVoteRecordReportSchema
  );
  expect(parseResult.isOk()).toEqual(true);
  clearDateMock();
});

test('exportCastVoteRecordReportToUsbDrive, with write-in image', async () => {
  setDateMock(new Date(2020, 3, 14));
  function* resultSheetGenerator(): Generator<ResultSheet> {
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
    whichImages: 'write-ins',
    resultSheetGenerator: resultSheetGenerator(),
  });

  expect(exportResult.isOk()).toEqual(true);
  expect(exportDataToUsbDriveMock).toHaveBeenCalledTimes(3);
  expect(exportDataToUsbDriveMock).toHaveBeenNthCalledWith(
    1,
    expectedReportPath,
    'ballot-images/front.jpg',
    'mock-image-data'
  );
  expect(exportDataToUsbDriveMock).toHaveBeenNthCalledWith(
    2,
    expectedReportPath,
    'ballot-layouts/front.layout.json',
    JSON.stringify(mockBallotPageLayout, undefined, 2)
  );
  expect(exportDataToUsbDriveMock).toHaveBeenNthCalledWith(
    3,
    expectedReportPath,
    'report.json',
    expect.anything()
  );

  const exportStream = exportDataToUsbDriveMock.mock.calls[2][2];

  const parseResult = safeParseJson(
    await streamToString(exportStream),
    CVR.CastVoteRecordReportSchema
  );
  expect(parseResult.isOk()).toEqual(true);
});
