import { Buffer } from 'buffer';
import fs from 'fs';
import set from 'lodash.set';
import path from 'path';
import { assert, assertDefined, err } from '@votingworks/basics';
import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { CastVoteRecordExportFileName, CVR } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getCastVoteRecordExportSubDirectoryNames,
  getFeatureFlagMock,
} from '@votingworks/utils';

import { TEST_OTHER_REPORT_TYPE } from './build_report_metadata';
import { isTestReport, readCastVoteRecordExport } from './import';
import {
  CastVoteRecordExportModifications,
  modifyCastVoteRecordExport,
} from './test_utils';

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

beforeEach(() => {
  process.env['VX_MACHINE_TYPE'] = 'admin';
  mockFeatureFlagger.resetFeatureFlags();
});

const { castVoteRecordExport } = electionGridLayoutNewHampshireAmherstFixtures;

test('successful import', async () => {
  const exportDirectoryPath = castVoteRecordExport.asDirectoryPath();

  const readResult = await readCastVoteRecordExport(exportDirectoryPath);
  expect(readResult.isOk()).toEqual(true);
  assert(readResult.isOk());
  const { castVoteRecordExportMetadata, castVoteRecordIterator } =
    readResult.ok();
  expect(castVoteRecordExportMetadata).toEqual({
    arePollsClosed: true,
    castVoteRecordReportMetadata: expect.any(Object),
    castVoteRecordRootHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });

  let encounteredReferencedImageFiles = false;
  let encounteredReferencedLayoutFiles = false;
  for await (const castVoteRecordResult of castVoteRecordIterator) {
    expect(castVoteRecordResult.isOk()).toEqual(true);
    assert(castVoteRecordResult.isOk());
    const { castVoteRecord, referencedFiles } = castVoteRecordResult.ok();
    expect(castVoteRecord).toEqual(expect.any(Object));

    if (referencedFiles) {
      encounteredReferencedImageFiles = true;
      for (const i of [0, 1] as const) {
        const imageFileReadResult = await referencedFiles.imageFiles[i].read();
        expect(imageFileReadResult.isOk()).toEqual(true);
        assert(imageFileReadResult.isOk());
        const image = imageFileReadResult.ok();
        expect(image).toEqual(expect.any(Buffer));

        if (referencedFiles.layoutFiles) {
          encounteredReferencedLayoutFiles = true;
          const layoutFileReadResult =
            await referencedFiles.layoutFiles[i].read();
          expect(layoutFileReadResult.isOk()).toEqual(true);
          assert(layoutFileReadResult.isOk());
          const layout = layoutFileReadResult.ok();
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
    err({ type: 'authentication-error' })
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

test.each<{ modifier: (castVoteRecordReportPath: string) => void }>([
  {
    modifier: (castVoteRecordReportPath) =>
      fs.appendFileSync(castVoteRecordReportPath, '}'),
  },
  {
    modifier: (castVoteRecordReportPath) =>
      fs.writeFileSync(castVoteRecordReportPath, JSON.stringify({})),
  },
  {
    modifier: (castVoteRecordReportPath) =>
      fs.writeFileSync(castVoteRecordReportPath, JSON.stringify({ CVR: [] })),
  },
])('cast vote record parse error during import', async ({ modifier }) => {
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
  expect(castVoteRecordResults).toHaveLength(1);
  const castVoteRecordResult = assertDefined(castVoteRecordResults[0]);
  expect(castVoteRecordResult).toEqual(
    err({ type: 'invalid-cast-vote-record', subType: 'parse-error' })
  );
});

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
    description: 'invalid ballot image field',
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
    description: 'invalid ballot image field',
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
    description: 'invalid ballot image field',
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
    description: 'invalid ballot image field',
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
    description: 'invalid ballot image field',
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
    description: 'invalid ballot image field',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        castVoteRecord.BallotImage
          ? set(castVoteRecord, 'BallotImage[0].vxLayoutFileHash', '')
          : castVoteRecord,
      numCastVoteRecordsToKeep: 10,
    },
    expectedErrorSubType: 'invalid-ballot-image-field',
  },
  {
    description: 'invalid ballot image field',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        castVoteRecord.BallotImage
          ? set(castVoteRecord, 'BallotImage[1].vxLayoutFileHash', '')
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
    const castVoteRecordErrorResult = castVoteRecordResults.find(
      (castVoteRecordResult) => castVoteRecordResult.isErr()
    );
    expect(castVoteRecordErrorResult).toEqual(
      err({ type: 'invalid-cast-vote-record', subType: expectedErrorSubType })
    );
  }
);

test.each<{ report: CVR.CastVoteRecordReport; expectedResult: boolean }>([
  {
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
      vxBatch: [],
    },
    expectedResult: true,
  },
  {
    report: {
      '@type': 'CVR.CastVoteRecordReport',
      Election: [],
      GeneratedDate: new Date().toISOString(),
      GpUnit: [],
      ReportGeneratingDeviceIds: [],
      ReportingDevice: [],
      ReportType: [CVR.ReportType.OriginatingDeviceExport],
      Version: CVR.CastVoteRecordVersion.v1_0_0,
      vxBatch: [],
    },
    expectedResult: false,
  },
  {
    report: {
      '@type': 'CVR.CastVoteRecordReport',
      Election: [],
      GeneratedDate: new Date().toISOString(),
      GpUnit: [],
      ReportGeneratingDeviceIds: [],
      ReportingDevice: [],
      Version: CVR.CastVoteRecordVersion.v1_0_0,
      vxBatch: [],
    },
    expectedResult: false,
  },
])('isTestReport', ({ report, expectedResult }) => {
  expect(isTestReport(report)).toEqual(expectedResult);
});
