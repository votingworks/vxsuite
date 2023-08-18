import { err, ok } from '@votingworks/basics';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
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
  ArtifactAuthenticatorApi,
  buildMockArtifactAuthenticator,
} from '@votingworks/auth';
import {
  bestFishContest,
  fishCouncilContest,
  fishingContest,
  interpretedBmdPage,
  interpretedHmpbPage1,
  interpretedHmpbPage2,
} from '../../../test/fixtures/interpretations';
import { ExportDataError } from '../../exporter';
import {
  exportCastVoteRecordReportToUsbDrive,
  getCastVoteRecordReportStream,
  InvalidSheetFoundError,
  ResultSheet,
} from './legacy_export';

const electionDefinition: ElectionDefinition = {
  ...electionMinimalExhaustiveSampleDefinition,
  electionHash: '0000000000', // fixed for resiliency to hash change
};
const definiteMarkThreshold = 0.15;
const batchInfo: BatchInfo[] = [];

jest.mock('./page_layouts', () => ({
  ...jest.requireActual('./page_layouts'),
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

let mockArtifactAuthenticator: ArtifactAuthenticatorApi;

beforeEach(() => {
  mockArtifactAuthenticator = buildMockArtifactAuthenticator();
});

test('getCastVoteRecordReportStream', async () => {
  jest.useFakeTimers().setSystemTime(new Date(2020, 3, 14));
  function* getResultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      indexInBatch: 1,
      frontImagePath: 'front.jpg',
      backImagePath: 'back.jpg',
      interpretation: [interpretedHmpbPage1, interpretedHmpbPage2],
    };
    yield {
      id: 'ballot-2',
      batchId: 'batch-1',
      indexInBatch: 2,
      frontImagePath: 'front.jpg',
      backImagePath: 'back.jpg',
      interpretation: [interpretedBmdPage, { type: 'BlankPage' }],
    };
  }

  const stream = getCastVoteRecordReportStream({
    electionDefinition,
    definiteMarkThreshold,
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

  jest.useRealTimers();
});

test('getCastVoteRecordReportStream results in error when validation fails', async () => {
  function* getResultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      frontImagePath: 'front.jpg',
      backImagePath: 'back.jpg',
      interpretation: [interpretedHmpbPage1, { type: 'BlankPage' }],
    };
  }

  const stream = getCastVoteRecordReportStream({
    electionDefinition,
    definiteMarkThreshold,
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
      frontImagePath: 'front.jpg',
      backImagePath: 'back.jpg',
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
    'file:front.jpg'
  );
  expect(report).toHaveProperty(
    ['CVR', 0, 'BallotImage', 1, 'Location'],
    'file:back.jpg'
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
    'file:front.jpg'
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
  jest.useFakeTimers().setSystemTime(new Date(2020, 3, 14));
  function* getResultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      frontImagePath: 'front.jpg',
      backImagePath: 'back.jpg',
      interpretation: [interpretedHmpbPage1WithWriteIn, interpretedHmpbPage2],
    };
    yield {
      id: 'ballot-2',
      batchId: 'batch-1',
      frontImagePath: 'front.jpg',
      backImagePath: 'back.jpg',
      interpretation: [interpretedBmdPage, { type: 'BlankPage' }],
    };
  }
  const mockGetUsbDrives = jest.fn().mockResolvedValue([{ mountPoint: '/' }]);

  const exportResult = await exportCastVoteRecordReportToUsbDrive(
    {
      electionDefinition,
      definiteMarkThreshold,
      isTestMode: false,
      batchInfo: [],
      ballotsCounted: 1,
      getResultSheetGenerator,
      artifactAuthenticator: mockArtifactAuthenticator,
    },
    mockGetUsbDrives
  );

  expect(exportResult.isOk()).toEqual(true);
  expect(exportDataToUsbDriveMock).toHaveBeenCalledTimes(3);
  expect(exportDataToUsbDriveMock).toHaveBeenNthCalledWith(
    1,
    expectedReportPath,
    CAST_VOTE_RECORD_REPORT_FILENAME,
    expect.anything(),
    { machineDirectoryToWriteToFirst: expect.stringContaining('/tmp/') }
  );
  expect(exportDataToUsbDriveMock).toHaveBeenNthCalledWith(
    2,
    expectedReportPath,
    'ballot-images/batch-1/front.jpg',
    'mock-image-data',
    { machineDirectoryToWriteToFirst: expect.stringContaining('/tmp/') }
  );
  expect(exportDataToUsbDriveMock).toHaveBeenNthCalledWith(
    3,
    expectedReportPath,
    'ballot-layouts/batch-1/front.layout.json',
    JSON.stringify(interpretedHmpbPage1WithWriteIn.layout, undefined, 2),
    { machineDirectoryToWriteToFirst: expect.stringContaining('/tmp/') }
  );
  expect(mockArtifactAuthenticator.writeSignatureFile).toHaveBeenCalledTimes(1);

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
    'file:ballot-images/batch-1/front.jpg'
  );

  // check that file URI does not appear at top-level of CVR for back page
  expect(report).not.toHaveProperty(['CVR', 0, 'BallotImage', 1, 'Location']);

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
    'file:ballot-images/batch-1/front.jpg'
  );
});

test('exportCastVoteRecordReportToUsbDrive bubbles up export errors', async () => {
  function* getResultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      frontImagePath: 'front.jpg',
      backImagePath: 'back.jpg',
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
    isTestMode: false,
    batchInfo: [],
    ballotsCounted: 1,
    getResultSheetGenerator,
    artifactAuthenticator: mockArtifactAuthenticator,
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
    isTestMode: false,
    batchInfo: [],
    ballotsCounted: 1,
    getResultSheetGenerator,
    artifactAuthenticator: mockArtifactAuthenticator,
  });

  expect(exportResult2.isErr()).toEqual(true);
  expect(exportResult2.err()).toEqual(exportDataError);
});

test('exportCastVoteRecordReportToUsbDrive errs if no USB drive found when writing signature file', async () => {
  function* getResultSheetGenerator(): Generator<ResultSheet> {
    yield {
      id: 'ballot-1',
      batchId: 'batch-1',
      frontImagePath: 'front.jpg',
      backImagePath: 'back.jpg',
      interpretation: [interpretedHmpbPage1, interpretedHmpbPage2],
    };
  }
  const mockGetUsbDrives = jest.fn().mockResolvedValueOnce([]);

  const exportResult = await exportCastVoteRecordReportToUsbDrive(
    {
      artifactAuthenticator: mockArtifactAuthenticator,
      ballotsCounted: 1,
      batchInfo: [],
      definiteMarkThreshold,
      electionDefinition,
      getResultSheetGenerator,
      isTestMode: false,
    },
    mockGetUsbDrives
  );

  expect(exportResult).toEqual(
    err({ type: 'missing-usb-drive', message: 'No USB drive found' })
  );
});
