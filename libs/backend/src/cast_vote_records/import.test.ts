import set from 'lodash.set';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { assertDefined, err } from '@votingworks/basics';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import {
  CastVoteRecordExportFileName,
  CVR,
  DEV_MACHINE_ID,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getCastVoteRecordExportSubDirectoryNames,
  getFeatureFlagMock,
} from '@votingworks/utils';

import { getImageHash } from './build_cast_vote_record';
import { TEST_OTHER_REPORT_TYPE } from './build_report_metadata';
import { isTestReport, readCastVoteRecordExport } from './import';
import {
  CastVoteRecordExportModifications,
  modifyCastVoteRecordExport,
} from './test_utils';

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

beforeEach(() => {
  process.env['VX_MACHINE_TYPE'] = 'admin';
  mockFeatureFlagger.resetFeatureFlags();
});

const { castVoteRecordExport } =
  electionGridLayoutNewHampshireTestBallotFixtures;

test('successful import', async () => {
  const exportDirectoryPath = castVoteRecordExport.asDirectoryPath();

  const { castVoteRecordExportMetadata, castVoteRecordIterator } = (
    await readCastVoteRecordExport(exportDirectoryPath)
  ).unsafeUnwrap();
  expect(castVoteRecordExportMetadata).toEqual({
    arePollsClosed: true,
    castVoteRecordReportMetadata: expect.any(Object),
    castVoteRecordRootHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    batchManifest: expect.arrayContaining([
      expect.objectContaining({
        id: '9af15b336e',
        label: '9af15b336e',
        scannerId: DEV_MACHINE_ID,
        sheetCount: 184,
        startTime: expect.anything(),
      }),
    ]),
  });

  let encounteredReferencedImageFiles = false;
  let encounteredReferencedLayoutFiles = false;
  for await (const castVoteRecordResult of castVoteRecordIterator) {
    const { castVoteRecord, referencedFiles } =
      castVoteRecordResult.unsafeUnwrap();
    expect(castVoteRecord).toEqual(expect.any(Object));

    if (referencedFiles) {
      encounteredReferencedImageFiles = true;
      for (const i of [0, 1] as const) {
        const image = (
          await referencedFiles.imageFiles[i].read()
        ).unsafeUnwrap();
        expect(image).toEqual(expect.any(Buffer));

        if (referencedFiles.layoutFiles) {
          encounteredReferencedLayoutFiles = true;
          const layout = (
            await referencedFiles.layoutFiles[i].read()
          ).unsafeUnwrap();
          expect(layout).toEqual(expect.any(Object));
        }
      }
    }
  }
  expect(encounteredReferencedImageFiles).toEqual(true);
  expect(encounteredReferencedLayoutFiles).toEqual(true);
});

test('authentication error during import', async () => {
  const exportDirectoryPath = castVoteRecordExport.asDirectoryPath();
  fs.appendFileSync(
    path.join(exportDirectoryPath, CastVoteRecordExportFileName.METADATA),
    '\n'
  );

  expect(await readCastVoteRecordExport(exportDirectoryPath)).toEqual(
    err({
      type: 'authentication-error',
      details: expect.stringContaining('Verification failure'),
    })
  );
});

test('metadata file not found during import', async () => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
  const exportDirectoryPath = castVoteRecordExport.asDirectoryPath();
  fs.rmSync(
    path.join(exportDirectoryPath, CastVoteRecordExportFileName.METADATA)
  );

  expect(await readCastVoteRecordExport(exportDirectoryPath)).toEqual(
    err({ type: 'metadata-file-not-found' })
  );
});

test('metadata file parse error during import', async () => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
  const exportDirectoryPath = castVoteRecordExport.asDirectoryPath();
  fs.appendFileSync(
    path.join(exportDirectoryPath, CastVoteRecordExportFileName.METADATA),
    '}'
  );

  expect(await readCastVoteRecordExport(exportDirectoryPath)).toEqual(
    err({ type: 'metadata-file-parse-error' })
  );
});

test.each<{
  description: string;
  modifier: (castVoteRecordReportPath: string) => void;
}>([
  {
    description: 'unparsable JSON',
    modifier: (castVoteRecordReportPath) =>
      fs.appendFileSync(castVoteRecordReportPath, '}'),
  },
  {
    description: 'no CVR field',
    modifier: (castVoteRecordReportPath) =>
      fs.writeFileSync(castVoteRecordReportPath, JSON.stringify({})),
  },
  {
    description: 'empty CVR array',
    modifier: (castVoteRecordReportPath) =>
      fs.writeFileSync(castVoteRecordReportPath, JSON.stringify({ CVR: [] })),
  },
])(
  'cast vote record parse error during import - $description',
  async ({ modifier }) => {
    mockFeatureFlagger.enableFeatureFlag(
      BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
    );
    const exportDirectoryPath = await modifyCastVoteRecordExport(
      castVoteRecordExport.asDirectoryPath(),
      { numCastVoteRecordsToKeep: 1 }
    );
    const castVoteRecordExportSubDirectoryNames =
      await getCastVoteRecordExportSubDirectoryNames(exportDirectoryPath);
    expect(castVoteRecordExportSubDirectoryNames).toHaveLength(1);
    const castVoteRecordId = assertDefined(
      castVoteRecordExportSubDirectoryNames[0]
    );
    const castVoteRecordReportPath = path.join(
      exportDirectoryPath,
      castVoteRecordId,
      CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
    );
    modifier(castVoteRecordReportPath);

    const { castVoteRecordIterator } = (
      await readCastVoteRecordExport(exportDirectoryPath)
    ).unsafeUnwrap();
    const castVoteRecordResults = await castVoteRecordIterator.toArray();
    expect(castVoteRecordResults).toEqual([
      err({ type: 'invalid-cast-vote-record', subType: 'parse-error' }),
    ]);
  }
);

test.each<{
  description: string;
  modifications: CastVoteRecordExportModifications;
  expectedErrorSubType: string;
}>([
  {
    description: 'non-existent batch ID',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) => ({
        ...castVoteRecord,
        BatchId: 'non-existent-batch-id',
      }),
      numCastVoteRecordsToKeep: 1,
    },
    expectedErrorSubType: 'batch-id-not-found',
  },
  {
    description: 'invalid ballot sheet ID',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) => ({
        ...castVoteRecord,
        BallotSheetId: 'not-a-number',
      }),
      numCastVoteRecordsToKeep: 1,
    },
    expectedErrorSubType: 'invalid-ballot-sheet-id',
  },
  {
    description: 'no current snapshot',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) => ({
        ...castVoteRecord,
        CurrentSnapshotId: 'non-existent-snapshot-id',
      }),
      numCastVoteRecordsToKeep: 1,
    },
    expectedErrorSubType: 'no-current-snapshot',
  },
  {
    description: 'invalid write-in field',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        castVoteRecord.BallotImage
          ? set(
              castVoteRecord,
              'BallotImage[0].Location',
              'file:reference-that-write-in-field-will-not-match.jpg'
            )
          : castVoteRecord,
      numCastVoteRecordsToKeep: 10,
    },
    expectedErrorSubType: 'invalid-write-in-field',
  },
  {
    description: 'invalid ballot image field, extra ballot image',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        castVoteRecord.BallotImage
          ? set(castVoteRecord, 'BallotImage[2]', castVoteRecord.BallotImage[0])
          : castVoteRecord,
      numCastVoteRecordsToKeep: 10,
    },
    expectedErrorSubType: 'invalid-ballot-image-field',
  },
  {
    description: 'invalid ballot image field, undefined first hash',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        castVoteRecord.BallotImage
          ? set(castVoteRecord, 'BallotImage[0].Hash', undefined)
          : castVoteRecord,
      numCastVoteRecordsToKeep: 10,
    },
    expectedErrorSubType: 'invalid-ballot-image-field',
  },
  {
    description: 'invalid ballot image field, undefined second hash',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        castVoteRecord.BallotImage
          ? set(castVoteRecord, 'BallotImage[1].Hash', undefined)
          : castVoteRecord,
      numCastVoteRecordsToKeep: 10,
    },
    expectedErrorSubType: 'invalid-ballot-image-field',
  },
  {
    description: 'invalid ballot image field, undefined first hash value',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        castVoteRecord.BallotImage
          ? set(castVoteRecord, 'BallotImage[0].Hash.Value', '')
          : castVoteRecord,
      numCastVoteRecordsToKeep: 10,
    },
    expectedErrorSubType: 'invalid-ballot-image-field',
  },
  {
    description: 'invalid ballot image field, undefined second hash value',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        castVoteRecord.BallotImage
          ? set(castVoteRecord, 'BallotImage[1].Hash.Value', '')
          : castVoteRecord,
      numCastVoteRecordsToKeep: 10,
    },
    expectedErrorSubType: 'invalid-ballot-image-field',
  },
  {
    description:
      'invalid ballot image field, first hash value does not include layout hash',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        castVoteRecord.BallotImage
          ? set(
              castVoteRecord,
              'BallotImage[0].Hash.Value',
              getImageHash(castVoteRecord.BallotImage[0]!)
            )
          : castVoteRecord,
      numCastVoteRecordsToKeep: 10,
    },
    expectedErrorSubType: 'invalid-ballot-image-field',
  },
  {
    description:
      'invalid ballot image field, second hash value does not include layout hash',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        castVoteRecord.BallotImage
          ? set(
              castVoteRecord,
              'BallotImage[1].Hash.Value',
              getImageHash(castVoteRecord.BallotImage[1]!)
            )
          : castVoteRecord,
      numCastVoteRecordsToKeep: 10,
    },
    expectedErrorSubType: 'invalid-ballot-image-field',
  },
])(
  'cast vote record parse error during import - $description',
  async ({ modifications, expectedErrorSubType }) => {
    mockFeatureFlagger.enableFeatureFlag(
      BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
    );
    const exportDirectoryPath = await modifyCastVoteRecordExport(
      castVoteRecordExport.asDirectoryPath(),
      modifications
    );

    const { castVoteRecordIterator } = (
      await readCastVoteRecordExport(exportDirectoryPath)
    ).unsafeUnwrap();
    const castVoteRecordResults = await castVoteRecordIterator.toArray();
    expect(castVoteRecordResults).toContainEqual(
      err({ type: 'invalid-cast-vote-record', subType: expectedErrorSubType })
    );
  }
);

test.each<{
  description: string;
  report: CVR.CastVoteRecordReport;
  expectedResult: boolean;
}>([
  {
    description: 'ReportType includes "other" and OtherReportType is "test"',
    report: {
      '@type': 'CVR.CastVoteRecordReport',
      Election: [],
      GeneratedDate: new Date().toISOString(),
      GpUnit: [],
      OtherReportType: TEST_OTHER_REPORT_TYPE,
      ReportGeneratingDeviceIds: [],
      ReportingDevice: [],
      ReportType: [
        CVR.ReportType.OriginatingDeviceExport,
        CVR.ReportType.Other,
      ],
      Version: CVR.CastVoteRecordVersion.v1_0_0,
    },
    expectedResult: true,
  },
  {
    description: 'ReportType does not include "other"',
    report: {
      '@type': 'CVR.CastVoteRecordReport',
      Election: [],
      GeneratedDate: new Date().toISOString(),
      GpUnit: [],
      ReportGeneratingDeviceIds: [],
      ReportingDevice: [],
      ReportType: [CVR.ReportType.OriginatingDeviceExport],
      Version: CVR.CastVoteRecordVersion.v1_0_0,
    },
    expectedResult: false,
  },
  {
    description: 'ReportType is not specified at all',
    report: {
      '@type': 'CVR.CastVoteRecordReport',
      Election: [],
      GeneratedDate: new Date().toISOString(),
      GpUnit: [],
      ReportGeneratingDeviceIds: [],
      ReportingDevice: [],
      Version: CVR.CastVoteRecordVersion.v1_0_0,
    },
    expectedResult: false,
  },
])('isTestReport - $description', ({ report, expectedResult }) => {
  expect(isTestReport(report)).toEqual(expectedResult);
});
