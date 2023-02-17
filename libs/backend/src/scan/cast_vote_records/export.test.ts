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
import { CastVoteRecordReportSchema } from '@votingworks/types/src/cdf_cast_vote_records';
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
  getCastVoteRecordReportStream,
  ResultSheet,
} from './export';
import { BallotPageLayoutsLookup } from './page_layouts';

const { election, electionHash } = electionMinimalExhaustiveSampleDefinition;
const electionId = getDisplayElectionHash(
  electionMinimalExhaustiveSampleDefinition
);
const scannerId = 'SC-00-000';
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

jest.mock('./get_inline_ballot_image', () => ({
  getInlineBallotImage: (imageFilename: string) => ({
    normalized: imageFilename,
  }),
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

  const stream = getCastVoteRecordReportStream({
    election,
    electionId,
    scannerId,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo,
    imageOptions: {
      imagesDirectory: 'ballot-images',
      includedImageFileUris: 'none',
      includeInlineBallotImages: false,
    },
    resultSheetGenerator: resultSheetGenerator(),
    ballotsCounted: 2,
  });

  // report is valid cast vote record report
  const parseResult = safeParseJson(
    await streamToString(stream),
    CastVoteRecordReportSchema
  );
  expect(parseResult.isOk()).toEqual(true);
  const report = parseResult.ok();
  expect(report).toMatchSnapshot();
  expect(report?.CVR).toHaveLength(2);

  clearDateMock();
});

test('getCastVoteRecordReportStream throws error when validation fails', async () => {
  function* resultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      frontNormalizedFilename: 'front.jpg',
      backNormalizedFilename: 'back.jpg',
      interpretation: [interpretedHmpbPage1, { type: 'BlankPage' }],
    };
  }

  const stream = getCastVoteRecordReportStream({
    election,
    electionId,
    scannerId,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo,
    imageOptions: {
      imagesDirectory: 'ballot-images',
      includedImageFileUris: 'write-ins',
      includeInlineBallotImages: false,
    },
    resultSheetGenerator: resultSheetGenerator(),
    ballotsCounted: 1,
  });

  // the error is not thrown until the stream is read from
  try {
    await streamToString(stream);
  } catch (error) {
    expect(error).toBeDefined();
  }
  expect.assertions(1);
});

test('getCastVoteRecordReportStream can include inline ballot images and layouts', async () => {
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

  const stream = getCastVoteRecordReportStream({
    election,
    electionId,
    scannerId,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo,
    imageOptions: {
      imagesDirectory: 'ballot-images',
      includedImageFileUris: 'none',
      includeInlineBallotImages: true,
    },
    resultSheetGenerator: resultSheetGenerator(),
    ballotsCounted: 1,
  });

  const parseResult = safeParseJson(
    await streamToString(stream),
    CastVoteRecordReportSchema
  );
  expect(parseResult.isOk()).toEqual(true);
  const result = parseResult.ok();
  expect(result?.CVR).toHaveLength(1);
  expect(result?.CVR?.[0]?.BallotImage).toMatchInlineSnapshot(`
    Array [
      Object {
        "@type": "CVR.ImageData",
        "Image": Object {
          "@type": "CVR.Image",
          "Data": "front.jpg",
        },
      },
      Object {
        "@type": "CVR.ImageData",
      },
    ]
  `);

  expect(result?.CVR?.[0]?.vxLayouts).toMatchObject([
    mockBallotPageLayout,
    null,
  ]);
});

test('getCastVoteRecordReportStream can include file uris', async () => {
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

  const stream = getCastVoteRecordReportStream({
    election,
    electionId,
    scannerId,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo,
    imageOptions: {
      imagesDirectory: 'ballot-images',
      includedImageFileUris: 'all',
      includeInlineBallotImages: false,
    },
    resultSheetGenerator: resultSheetGenerator(),
    ballotsCounted: 1,
  });

  const parseResult = safeParseJson(
    await streamToString(stream),
    CastVoteRecordReportSchema
  );
  expect(parseResult.isOk()).toEqual(true);
  const result = parseResult.ok();
  expect(result?.CVR).toHaveLength(1);

  // Check that file URI appears at the top level of the CVR
  expect(result?.CVR?.[0]?.vxLayouts).toBeUndefined();
  expect(result?.CVR?.[0]?.BallotImage).toMatchInlineSnapshot(`
    Array [
      Object {
        "@type": "CVR.ImageData",
        "Location": "file:./ballot-images/front.jpg",
      },
      Object {
        "@type": "CVR.ImageData",
        "Location": "file:./ballot-images/back.jpg",
      },
    ]
  `);

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
  ).toMatchObject({ Location: 'file:./ballot-images/front.jpg' });
});

const exportDataToUsbDriveMock = jest.fn().mockImplementation(() => ok());

jest.mock('../../exporter', () => ({
  ...jest.requireActual('../../exporter'),
  Exporter: jest.fn().mockImplementation(() => ({
    exportDataToUsbDrive: exportDataToUsbDriveMock,
  })),
}));

test('exportCastVoteRecordReportToUsbDrive', async () => {
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
    election,
    electionHash,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    isTestMode: false,
    batchInfo: [],
    ballotsCounted: 1,
    imageOptions: {
      imagesDirectory: 'ballot-images',
      includedImageFileUris: 'none',
      includeInlineBallotImages: false,
    },
    resultSheetGenerator: resultSheetGenerator(),
  });

  expect(exportResult.isOk()).toEqual(true);
  expect(exportDataToUsbDriveMock).toHaveBeenCalledTimes(1);
  expect(exportDataToUsbDriveMock).toHaveBeenCalledWith(
    SCANNER_RESULTS_FOLDER,
    `sample-county_example-primary-election_${getDisplayElectionHash(
      electionMinimalExhaustiveSampleDefinition
    )}/machine_000__1_ballots__2020-04-14_00-00-00.json`,
    expect.anything()
  );

  const exportStream = exportDataToUsbDriveMock.mock.calls[0][2];

  const parseResult = safeParseJson(
    await streamToString(exportStream),
    CastVoteRecordReportSchema
  );
  expect(parseResult.isOk()).toEqual(true);

  clearDateMock();
});
