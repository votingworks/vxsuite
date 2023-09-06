import { assert } from '@votingworks/basics';
import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { unsafeParse, CVR } from '@votingworks/types';
import { CAST_VOTE_RECORD_REPORT_FILENAME } from '@votingworks/utils';
import { rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  getCastVoteRecordReportImport,
  isTestReport,
  validateCastVoteRecordReportDirectoryStructure,
} from './cast_vote_record_report_import';
import {
  CVR_BALLOT_IMAGES_SUBDIRECTORY,
  CVR_BALLOT_LAYOUTS_SUBDIRECTORY,
  TEST_OTHER_REPORT_TYPE,
} from './scan';

const cdfCvrReport =
  electionGridLayoutNewHampshireAmherstFixtures.castVoteRecordReport;

describe('getCastVoteRecordReportImport', () => {
  test('imports a valid cast vote record report', async () => {
    const castVoteRecordImportResult = await getCastVoteRecordReportImport(
      join(cdfCvrReport.asDirectoryPath(), CAST_VOTE_RECORD_REPORT_FILENAME)
    );

    expect(castVoteRecordImportResult.isOk()).toBeTruthy();
    const castVoteRecordImport = castVoteRecordImportResult.ok();
    assert(castVoteRecordImport);

    const { CVR: unparsedCastVoteRecords } = castVoteRecordImport;

    let cvrCount = 0;
    for await (const unparsedCastVoteRecord of unparsedCastVoteRecords) {
      unsafeParse(CVR.CVRSchema, unparsedCastVoteRecord);
      cvrCount += 1;
    }
    expect(cvrCount).toEqual(184);
  });

  test('returns a parsing error if report metadata is invalid', async () => {
    const mockReportDirectoryPath = cdfCvrReport.asDirectoryPath();
    writeFileSync(
      join(mockReportDirectoryPath, CAST_VOTE_RECORD_REPORT_FILENAME),
      '{}'
    );
    const castVoteRecordImportResult = await getCastVoteRecordReportImport(
      join(mockReportDirectoryPath, CAST_VOTE_RECORD_REPORT_FILENAME)
    );

    expect(castVoteRecordImportResult.isErr()).toBeTruthy();
    const error = castVoteRecordImportResult.err();
    assert(error);
    expect(error.issues).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_literal',
          expected: 'CVR.CastVoteRecordReport',
          path: ['@type'],
        }),
      ])
    );
  });
});

describe('validateCastVoteRecordReportDirectoryStructure', () => {
  test('returns ballot images on success validation', async () => {
    const validationResult =
      await validateCastVoteRecordReportDirectoryStructure(
        cdfCvrReport.asDirectoryPath()
      );
    expect(validationResult.isOk()).toBeTruthy();
    expect(validationResult.ok()).toMatchInlineSnapshot(`
      [
        "9822c71014/card-number-3__town-id-00701-precinct-id-__1.jpg",
        "9822c71014/card-number-3__town-id-00701-precinct-id-__2.jpg",
      ]
    `);
  });

  test('success with no ballot images', async () => {
    const directoryPath = cdfCvrReport.asDirectoryPath();
    rmSync(join(directoryPath, CVR_BALLOT_IMAGES_SUBDIRECTORY), {
      recursive: true,
      force: true,
    });
    const validationResult =
      await validateCastVoteRecordReportDirectoryStructure(directoryPath);
    expect(validationResult.isOk()).toBeTruthy();
    expect(validationResult.ok()).toEqual([]);
  });

  test('fails if missing a ballot layout', async () => {
    const directoryPath = cdfCvrReport.asDirectoryPath();
    rmSync(
      join(
        directoryPath,
        CVR_BALLOT_LAYOUTS_SUBDIRECTORY,
        '9822c71014',
        'card-number-3__town-id-00701-precinct-id-__1.layout.json'
      )
    );
    const validationResult =
      await validateCastVoteRecordReportDirectoryStructure(directoryPath);
    expect(validationResult.isErr()).toBeTruthy();
    expect(validationResult.err()).toMatchObject({
      type: 'missing-layouts',
    });
  });

  test('fails if missing all ballot layouts', async () => {
    const directoryPath = cdfCvrReport.asDirectoryPath();
    rmSync(join(directoryPath, CVR_BALLOT_LAYOUTS_SUBDIRECTORY), {
      recursive: true,
      force: true,
    });
    const validationResult =
      await validateCastVoteRecordReportDirectoryStructure(directoryPath);
    expect(validationResult.isErr()).toBeTruthy();
    expect(validationResult.err()).toMatchObject({ type: 'missing-layouts' });
  });

  test('fails if no report', async () => {
    const directoryPath = cdfCvrReport.asDirectoryPath();
    rmSync(join(directoryPath, CAST_VOTE_RECORD_REPORT_FILENAME));
    const validationResult =
      await validateCastVoteRecordReportDirectoryStructure(directoryPath);
    expect(validationResult.isErr()).toBeTruthy();
    expect(validationResult.err()).toMatchObject({ type: 'missing-report' });
  });

  test('fails if invalid root', async () => {
    const validationResult =
      await validateCastVoteRecordReportDirectoryStructure('/tmp/no-entity');
    expect(validationResult.isErr()).toBeTruthy();
    expect(validationResult.err()).toMatchObject({ type: 'invalid-directory' });
  });

  test('fails if ballot layout directory is somehow invalid', async () => {
    const directoryPath = cdfCvrReport.asDirectoryPath();
    rmSync(join(directoryPath, CVR_BALLOT_LAYOUTS_SUBDIRECTORY), {
      recursive: true,
      force: true,
    });
    writeFileSync(join(directoryPath, CVR_BALLOT_LAYOUTS_SUBDIRECTORY), '');
    const validationResult =
      await validateCastVoteRecordReportDirectoryStructure(directoryPath);
    expect(validationResult.isErr()).toBeTruthy();
    expect(validationResult.err()).toMatchObject({ type: 'invalid-directory' });
  });

  test('fails if ballot images directory is somehow invalid', async () => {
    const directoryPath = cdfCvrReport.asDirectoryPath();
    rmSync(join(directoryPath, CVR_BALLOT_IMAGES_SUBDIRECTORY), {
      recursive: true,
      force: true,
    });
    writeFileSync(join(directoryPath, CVR_BALLOT_IMAGES_SUBDIRECTORY), '');
    const validationResult =
      await validateCastVoteRecordReportDirectoryStructure(directoryPath);
    expect(validationResult.isErr()).toBeTruthy();
    expect(validationResult.err()).toMatchObject({ type: 'invalid-directory' });
  });
});

describe('isTestReport', () => {
  test('when test', () => {
    expect(
      isTestReport({
        '@type': 'CVR.CastVoteRecordReport',
        ReportType: [
          CVR.ReportType.OriginatingDeviceExport,
          CVR.ReportType.Other,
        ],
        OtherReportType: TEST_OTHER_REPORT_TYPE,
        GeneratedDate: Date.now().toString(),
        GpUnit: [],
        Election: [],
        ReportGeneratingDeviceIds: [],
        ReportingDevice: [],
        Version: CVR.CastVoteRecordVersion.v1_0_0,
        vxBatch: [],
      })
    ).toBeTruthy();
  });

  test('when not test', () => {
    expect(
      isTestReport({
        '@type': 'CVR.CastVoteRecordReport',
        ReportType: [CVR.ReportType.OriginatingDeviceExport],
        GeneratedDate: Date.now().toString(),
        GpUnit: [],
        Election: [],
        ReportGeneratingDeviceIds: [],
        ReportingDevice: [],
        Version: CVR.CastVoteRecordVersion.v1_0_0,
        vxBatch: [],
      })
    ).toBeFalsy();
  });
});
