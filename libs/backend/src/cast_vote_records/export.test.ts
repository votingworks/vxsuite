import fs from 'node:fs';
import path from 'node:path';
import { dirSync } from 'tmp';
import { v4 as uuid } from 'uuid';
import { assert, assertDefined, err, ok, sleep } from '@votingworks/basics';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  BatchInfo,
  CastVoteRecordExportFileName,
  CVR,
  DEFAULT_SYSTEM_SETTINGS,
  PageInterpretation,
  SheetOf,
} from '@votingworks/types';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';

import {
  interpretedBmdBallot,
  interpretedBmdBallotWithWriteIn,
  interpretedBmdPage,
  interpretedHmpb,
  interpretedHmpbPage1,
  interpretedHmpbWithUnmarkedWriteIn,
  interpretedHmpbWithWriteIn,
} from '../../test/fixtures/interpretations';
import {
  MockCentralScannerStore,
  MockPrecinctScannerStore,
  summarizeDirectoryContents,
} from '../../test/utils';
import {
  AcceptedSheet,
  clearDoesUsbDriveRequireCastVoteRecordSyncCachedResult,
  doesUsbDriveRequireCastVoteRecordSync,
  exportCastVoteRecordsToUsbDrive,
  ExportOptions,
  RejectedSheet,
  Sheet,
} from './export';
import {
  readCastVoteRecordExport,
  readCastVoteRecordExportMetadata,
} from './import';
import {
  getCastVoteRecordExportDirectoryPaths,
  readCastVoteRecord,
} from './test_utils';

jest.setTimeout(30_000);

const electionDefinition = readElectionTwoPartyPrimaryDefinition();

const batch1Id = uuid();
const batch1: BatchInfo = {
  id: batch1Id,
  batchNumber: 1,
  count: 0,
  label: 'Batch 1',
  startedAt: new Date().toISOString(),
};

let mockCentralScannerStore: MockCentralScannerStore;
let mockPrecinctScannerStore: MockPrecinctScannerStore;
let mockUsbDrive: MockUsbDrive;
let tempDirectoryPath: string;

beforeEach(() => {
  // While this should technically be set to "central-scan" for tests emulating VxCentralScan
  // behavior, always using "scan" is fine for the purposes of these tests.
  process.env['VX_MACHINE_TYPE'] = 'scan';

  mockUsbDrive = createMockUsbDrive();
  mockCentralScannerStore = new MockCentralScannerStore();
  mockPrecinctScannerStore = new MockPrecinctScannerStore();
  tempDirectoryPath = dirSync().name;

  mockUsbDrive.insertUsbDrive({});
  mockUsbDrive.usbDrive.sync.expectOptionalRepeatedCallsWith().resolves();
  mockCentralScannerStore.setElectionDefinition(electionDefinition);
  mockCentralScannerStore.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  mockCentralScannerStore.setBatches([batch1]);
  mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
  mockPrecinctScannerStore.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  mockPrecinctScannerStore.setPollsState('polls_open');
  mockPrecinctScannerStore.setBatches([batch1]);
});

afterEach(() => {
  fs.rmSync(tempDirectoryPath, { recursive: true });
  clearDoesUsbDriveRequireCastVoteRecordSyncCachedResult();
  mockUsbDrive.assertComplete();
});

const sheet1Id = uuid();
const sheet2Id = uuid();
const sheet3Id = uuid();
const sheet4Id = uuid();
const sheet5Id = uuid();

function generateMockImages(sheetId: string): SheetOf<string> {
  const imagePaths: SheetOf<string> = [
    path.join(tempDirectoryPath, `${sheetId}-front.jpg`),
    path.join(tempDirectoryPath, `${sheetId}-back.jpg`),
  ];
  fs.writeFileSync(imagePaths[0], Math.random().toString());
  fs.writeFileSync(imagePaths[1], Math.random().toString());
  return imagePaths;
}

function newAcceptedSheet(
  interpretation: SheetOf<PageInterpretation>,
  sheetId: string = uuid()
): AcceptedSheet {
  const imagePaths = generateMockImages(sheetId);
  return {
    type: 'accepted',
    id: sheetId,
    batchId: batch1Id,
    interpretation,
    frontImagePath: imagePaths[0],
    backImagePath: imagePaths[1],
  };
}

function newRejectedSheet(sheetId: string = uuid()): RejectedSheet {
  const imagePaths = generateMockImages(sheetId);
  return {
    type: 'rejected',
    id: sheetId,
    frontImagePath: imagePaths[0],
    backImagePath: imagePaths[1],
  };
}

const anyCastVoteRecordHash: CVR.Hash = {
  '@type': 'CVR.Hash',
  Type: CVR.HashType.Sha256,
  Value: expect.any(String),
};

test.each<{
  description: string;
  sheetGenerator: () => AcceptedSheet | RejectedSheet;
  exportOptions: ExportOptions;
  expectedDirectoryContents: string[];
  expectedBallotImageField?: SheetOf<CVR.ImageData>;
}>([
  {
    description: 'accepted HMPB on precinct scanner',
    sheetGenerator: () => newAcceptedSheet(interpretedHmpb, sheet1Id),
    exportOptions: { scannerType: 'precinct' },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet1Id}/${sheet1Id}-front.jpg`,
      `${sheet1Id}/${sheet1Id}-back.jpg`,
      `${sheet1Id}/${sheet1Id}-front.layout.json`,
      `${sheet1Id}/${sheet1Id}-back.layout.json`,
    ],
    expectedBallotImageField: [
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-front.jpg`,
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
      },
    ],
  },
  {
    description: 'accepted HMPB on central scanner, non-minimal export',
    sheetGenerator: () => newAcceptedSheet(interpretedHmpb, sheet1Id),
    exportOptions: { scannerType: 'central', isMinimalExport: false },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet1Id}/${sheet1Id}-front.jpg`,
      `${sheet1Id}/${sheet1Id}-back.jpg`,
      `${sheet1Id}/${sheet1Id}-front.layout.json`,
      `${sheet1Id}/${sheet1Id}-back.layout.json`,
    ],
    expectedBallotImageField: [
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-front.jpg`,
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
      },
    ],
  },
  {
    description: 'accepted HMPB on central scanner, minimal export',
    sheetGenerator: () => newAcceptedSheet(interpretedHmpb, sheet1Id),
    exportOptions: { scannerType: 'central', isMinimalExport: true },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
    ],
    expectedBallotImageField: undefined,
  },
  {
    description: 'accepted HMPB with write-in on precinct scanner',
    sheetGenerator: () =>
      newAcceptedSheet(interpretedHmpbWithWriteIn, sheet1Id),
    exportOptions: { scannerType: 'precinct' },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet1Id}/${sheet1Id}-front.jpg`,
      `${sheet1Id}/${sheet1Id}-back.jpg`,
      `${sheet1Id}/${sheet1Id}-front.layout.json`,
      `${sheet1Id}/${sheet1Id}-back.layout.json`,
    ],
    expectedBallotImageField: [
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-front.jpg`,
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
      },
    ],
  },
  {
    description:
      'accepted HMPB with write-in on central scanner, non-minimal export',
    sheetGenerator: () =>
      newAcceptedSheet(interpretedHmpbWithWriteIn, sheet1Id),
    exportOptions: { scannerType: 'central', isMinimalExport: false },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet1Id}/${sheet1Id}-front.jpg`,
      `${sheet1Id}/${sheet1Id}-back.jpg`,
      `${sheet1Id}/${sheet1Id}-front.layout.json`,
      `${sheet1Id}/${sheet1Id}-back.layout.json`,
    ],
    expectedBallotImageField: [
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-front.jpg`,
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
      },
    ],
  },
  {
    description:
      'accepted HMPB with write-in on central scanner, minimal export',
    sheetGenerator: () =>
      newAcceptedSheet(interpretedHmpbWithWriteIn, sheet1Id),
    exportOptions: { scannerType: 'central', isMinimalExport: true },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet1Id}/${sheet1Id}-front.jpg`,
      `${sheet1Id}/${sheet1Id}-back.jpg`,
      `${sheet1Id}/${sheet1Id}-front.layout.json`,
      `${sheet1Id}/${sheet1Id}-back.layout.json`,
    ],
    expectedBallotImageField: [
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-front.jpg`,
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
      },
    ],
  },
  {
    description:
      'accepted HMPB with unmarked write-in on central scanner, minimal export',
    sheetGenerator: () =>
      newAcceptedSheet(interpretedHmpbWithUnmarkedWriteIn, sheet1Id),
    exportOptions: { scannerType: 'central', isMinimalExport: true },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet1Id}/${sheet1Id}-front.jpg`,
      `${sheet1Id}/${sheet1Id}-back.jpg`,
      `${sheet1Id}/${sheet1Id}-front.layout.json`,
      `${sheet1Id}/${sheet1Id}-back.layout.json`,
    ],
    expectedBallotImageField: [
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-front.jpg`,
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
      },
    ],
  },
  {
    description: 'accepted BMD ballot on precinct scanner',
    sheetGenerator: () => newAcceptedSheet(interpretedBmdBallot, sheet1Id),
    exportOptions: { scannerType: 'precinct' },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet1Id}/${sheet1Id}-front.jpg`,
      `${sheet1Id}/${sheet1Id}-back.jpg`,
    ],
    expectedBallotImageField: [
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-front.jpg`,
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
      },
    ],
  },
  {
    description: 'accepted BMD ballot on central scanner, non-minimal export',
    sheetGenerator: () => newAcceptedSheet(interpretedBmdBallot, sheet1Id),
    exportOptions: { scannerType: 'central', isMinimalExport: false },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet1Id}/${sheet1Id}-front.jpg`,
      `${sheet1Id}/${sheet1Id}-back.jpg`,
    ],
    expectedBallotImageField: [
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-front.jpg`,
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
      },
    ],
  },
  {
    description:
      'accepted BMD ballot with write in on central scanner, non-minimal export',
    sheetGenerator: () =>
      newAcceptedSheet(interpretedBmdBallotWithWriteIn, sheet1Id),
    exportOptions: { scannerType: 'central', isMinimalExport: false },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet1Id}/${sheet1Id}-front.jpg`,
      `${sheet1Id}/${sheet1Id}-back.jpg`,
    ],
    expectedBallotImageField: [
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-front.jpg`,
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
      },
    ],
  },
  {
    description: 'accepted BMD ballot on central scanner, minimal export',
    sheetGenerator: () => newAcceptedSheet(interpretedBmdBallot, sheet1Id),
    exportOptions: { scannerType: 'central', isMinimalExport: true },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
    ],
    expectedBallotImageField: undefined,
  },
  {
    description:
      'accepted BMD ballot with write in on central scanner, minimal export',
    sheetGenerator: () =>
      newAcceptedSheet(interpretedBmdBallotWithWriteIn, sheet1Id),
    exportOptions: { scannerType: 'central', isMinimalExport: true },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet1Id}/${sheet1Id}-front.jpg`,
      `${sheet1Id}/${sheet1Id}-back.jpg`,
    ],
    expectedBallotImageField: [
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-front.jpg`,
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
      },
    ],
  },
  {
    description: 'rejected sheet on precinct scanner',
    sheetGenerator: () => newRejectedSheet(sheet1Id),
    exportOptions: { scannerType: 'precinct' },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `rejected-${sheet1Id}/${sheet1Id}-front.jpg`,
      `rejected-${sheet1Id}/${sheet1Id}-back.jpg`,
    ],
  },
  {
    description: 'rejected sheet on central scanner, non-minimal export',
    sheetGenerator: () => newRejectedSheet(sheet1Id),
    exportOptions: { scannerType: 'central', isMinimalExport: false },
    expectedDirectoryContents: [
      CastVoteRecordExportFileName.METADATA,
      `rejected-${sheet1Id}/${sheet1Id}-front.jpg`,
      `rejected-${sheet1Id}/${sheet1Id}-back.jpg`,
    ],
  },
])(
  'one-sheet export - $description',
  async ({
    sheetGenerator,
    exportOptions,
    expectedDirectoryContents,
    expectedBallotImageField,
  }) => {
    const sheet = sheetGenerator();
    expect(
      await exportCastVoteRecordsToUsbDrive(
        exportOptions.scannerType === 'central'
          ? mockCentralScannerStore
          : mockPrecinctScannerStore,
        mockUsbDrive.usbDrive,
        [sheet],
        exportOptions
      )
    ).toEqual(ok());

    const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
      mockUsbDrive.usbDrive
    );
    expect(exportDirectoryPaths).toHaveLength(1);
    const exportDirectoryPath = assertDefined(exportDirectoryPaths[0]);
    const exportDirectoryContents =
      await summarizeDirectoryContents(exportDirectoryPath);
    expect(exportDirectoryContents).toEqual(
      [...expectedDirectoryContents].sort()
    );

    if (sheet.type === 'accepted') {
      const { castVoteRecord } = readCastVoteRecord(
        path.join(exportDirectoryPath, sheet1Id)
      );
      expect(castVoteRecord.BallotImage).toEqual(expectedBallotImageField);
    }
  }
);

test('precinct scanner continuous export', async () => {
  for (const sheet of [
    newAcceptedSheet(interpretedHmpb, sheet1Id),
    newAcceptedSheet(interpretedHmpbWithWriteIn, sheet2Id),
    newAcceptedSheet(interpretedBmdBallot, sheet3Id),
    newRejectedSheet(sheet4Id),
  ]) {
    expect(
      await exportCastVoteRecordsToUsbDrive(
        mockPrecinctScannerStore,
        mockUsbDrive.usbDrive,
        [sheet],
        { scannerType: 'precinct' }
      )
    ).toEqual(ok());
  }

  const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
    mockUsbDrive.usbDrive
  );
  expect(exportDirectoryPaths).toHaveLength(1);
  const exportDirectoryPath = assertDefined(exportDirectoryPaths[0]);
  const exportDirectoryContents =
    await summarizeDirectoryContents(exportDirectoryPath);
  const expectedExportDirectoryContents = [
    CastVoteRecordExportFileName.METADATA,
    `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
    `${sheet1Id}/${sheet1Id}-front.jpg`,
    `${sheet1Id}/${sheet1Id}-back.jpg`,
    `${sheet1Id}/${sheet1Id}-front.layout.json`,
    `${sheet1Id}/${sheet1Id}-back.layout.json`,
    `${sheet2Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
    `${sheet2Id}/${sheet2Id}-front.jpg`,
    `${sheet2Id}/${sheet2Id}-back.jpg`,
    `${sheet2Id}/${sheet2Id}-front.layout.json`,
    `${sheet2Id}/${sheet2Id}-back.layout.json`,
    `${sheet3Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
    `${sheet3Id}/${sheet3Id}-front.jpg`,
    `${sheet3Id}/${sheet3Id}-back.jpg`,
    `rejected-${sheet4Id}/${sheet4Id}-front.jpg`,
    `rejected-${sheet4Id}/${sheet4Id}-back.jpg`,
  ].sort();
  expect(exportDirectoryContents).toEqual(expectedExportDirectoryContents);
  let metadata = (
    await readCastVoteRecordExportMetadata(exportDirectoryPath)
  ).unsafeUnwrap();
  expect(metadata.arePollsClosed).toEqual(false);

  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [],
      { scannerType: 'precinct', arePollsClosing: true }
    )
  ).toEqual(ok());

  expect(exportDirectoryContents).toEqual(expectedExportDirectoryContents);
  metadata = (
    await readCastVoteRecordExportMetadata(exportDirectoryPath)
  ).unsafeUnwrap();
  expect(metadata.arePollsClosed).toEqual(true);

  expect(metadata.batchManifest).toHaveLength(1);
  expect(metadata.batchManifest[0]).toMatchObject({
    id: batch1.id,
    label: batch1.label,
    startTime: batch1.startedAt,
  });
});

test('precinct scanner full export', async () => {
  // Perform two full exports and verify that a separate directory is created for each
  for (let i = 0; i < 2; i += 1) {
    const sheets = [
      newAcceptedSheet(interpretedHmpb, sheet1Id),
      newAcceptedSheet(interpretedHmpbWithWriteIn, sheet2Id),
      newAcceptedSheet(interpretedBmdBallot, sheet3Id),
      newRejectedSheet(sheet4Id),
    ];
    expect(
      await exportCastVoteRecordsToUsbDrive(
        mockPrecinctScannerStore,
        mockUsbDrive.usbDrive,
        sheets,
        { scannerType: 'precinct', isFullExport: true }
      )
    ).toEqual(ok());

    const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
      mockUsbDrive.usbDrive
    );
    expect(exportDirectoryPaths).toHaveLength(i + 1);
    const exportDirectoryPath = assertDefined(exportDirectoryPaths[i]);
    let exportDirectoryContents =
      await summarizeDirectoryContents(exportDirectoryPath);
    let expectedExportDirectoryContents = [
      CastVoteRecordExportFileName.METADATA,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet1Id}/${sheet1Id}-front.jpg`,
      `${sheet1Id}/${sheet1Id}-back.jpg`,
      `${sheet1Id}/${sheet1Id}-front.layout.json`,
      `${sheet1Id}/${sheet1Id}-back.layout.json`,
      `${sheet2Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet2Id}/${sheet2Id}-front.jpg`,
      `${sheet2Id}/${sheet2Id}-back.jpg`,
      `${sheet2Id}/${sheet2Id}-front.layout.json`,
      `${sheet2Id}/${sheet2Id}-back.layout.json`,
      `${sheet3Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
      `${sheet3Id}/${sheet3Id}-front.jpg`,
      `${sheet3Id}/${sheet3Id}-back.jpg`,
      `rejected-${sheet4Id}/${sheet4Id}-front.jpg`,
      `rejected-${sheet4Id}/${sheet4Id}-back.jpg`,
    ].sort();
    expect(exportDirectoryContents).toEqual(expectedExportDirectoryContents);

    // Sleep 1 second after the first export to guarantee that the second export directory has a
    // different name than the first
    if (i === 0) {
      await sleep(1000);
    }

    // Export one more record after the second export and verify that it's added to the second
    // export directory
    if (i === 1) {
      expect(
        await exportCastVoteRecordsToUsbDrive(
          mockPrecinctScannerStore,
          mockUsbDrive.usbDrive,
          [newAcceptedSheet(interpretedHmpb, sheet5Id)],
          { scannerType: 'precinct', isFullExport: false }
        )
      ).toEqual(ok());

      exportDirectoryContents =
        await summarizeDirectoryContents(exportDirectoryPath);
      expectedExportDirectoryContents = [
        ...expectedExportDirectoryContents,
        `${sheet5Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
        `${sheet5Id}/${sheet5Id}-front.jpg`,
        `${sheet5Id}/${sheet5Id}-back.jpg`,
        `${sheet5Id}/${sheet5Id}-front.layout.json`,
        `${sheet5Id}/${sheet5Id}-back.layout.json`,
      ].sort();
      expect(exportDirectoryContents).toEqual(expectedExportDirectoryContents);
    }
  }
});

test('central scanner multiple-sheet export, minimal and non-minimal', async () => {
  // Perform a minimal export
  const sheets: Sheet[] = [
    newAcceptedSheet(interpretedHmpb, sheet1Id),
    newAcceptedSheet(interpretedHmpbWithWriteIn, sheet2Id),
    newAcceptedSheet(interpretedBmdBallot, sheet3Id),
  ];
  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockCentralScannerStore,
      mockUsbDrive.usbDrive,
      sheets,
      { scannerType: 'central', isMinimalExport: true }
    )
  ).toEqual(ok());

  let exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
    mockUsbDrive.usbDrive
  );
  expect(exportDirectoryPaths).toHaveLength(1);
  let exportDirectoryPath = assertDefined(exportDirectoryPaths[0]);
  let exportDirectoryContents =
    await summarizeDirectoryContents(exportDirectoryPath);
  let expectedExportDirectoryContents = [
    CastVoteRecordExportFileName.METADATA,
    `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
    `${sheet2Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
    `${sheet2Id}/${sheet2Id}-front.jpg`,
    `${sheet2Id}/${sheet2Id}-back.jpg`,
    `${sheet2Id}/${sheet2Id}-front.layout.json`,
    `${sheet2Id}/${sheet2Id}-back.layout.json`,
    `${sheet3Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
  ].sort();
  expect(exportDirectoryContents).toEqual(expectedExportDirectoryContents);

  // Sleep 1 second to guarantee that the second export directory has a different name than the
  // first
  await sleep(1000);

  // Perform a non-minimal export
  sheets.push(newRejectedSheet(sheet4Id));
  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockCentralScannerStore,
      mockUsbDrive.usbDrive,
      sheets,
      { scannerType: 'central', isMinimalExport: false }
    )
  ).toEqual(ok());

  exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
    mockUsbDrive.usbDrive
  );
  expect(exportDirectoryPaths).toHaveLength(2);
  exportDirectoryPath = assertDefined(exportDirectoryPaths[1]);
  exportDirectoryContents =
    await summarizeDirectoryContents(exportDirectoryPath);
  expectedExportDirectoryContents = [
    ...expectedExportDirectoryContents,
    `${sheet1Id}/${sheet1Id}-front.jpg`,
    `${sheet1Id}/${sheet1Id}-back.jpg`,
    `${sheet1Id}/${sheet1Id}-front.layout.json`,
    `${sheet1Id}/${sheet1Id}-back.layout.json`,
    `${sheet3Id}/${sheet3Id}-front.jpg`,
    `${sheet3Id}/${sheet3Id}-back.jpg`,
    `rejected-${sheet4Id}/${sheet4Id}-front.jpg`,
    `rejected-${sheet4Id}/${sheet4Id}-back.jpg`,
  ].sort();
  expect(exportDirectoryContents).toEqual(expectedExportDirectoryContents);
});

test('detecting invalid sheet with incompatible interpretation types', async () => {
  const invalidSheet = newAcceptedSheet([
    interpretedHmpbPage1,
    interpretedBmdPage,
  ]);
  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [invalidSheet],
      { scannerType: 'precinct' }
    )
  ).toEqual(
    err({
      type: 'invalid-sheet',
      subType: 'incompatible-interpretation-types',
      interpretationTypes: ['InterpretedHmpbPage', 'InterpretedBmdPage'],
    })
  );
});

test('central scanner minimal export does not allow rejected sheets', async () => {
  await expect(
    exportCastVoteRecordsToUsbDrive(
      mockCentralScannerStore,
      mockUsbDrive.usbDrive,
      [newRejectedSheet()],
      { scannerType: 'central', isMinimalExport: true }
    )
  ).rejects.toThrow(
    'Encountered an unexpected rejected sheet while performing a minimal export. ' +
      'Minimal exports should only include accepted sheets.'
  );
});

test('exporting when no USB drive', async () => {
  mockUsbDrive.removeUsbDrive();

  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [newAcceptedSheet(interpretedHmpb)],
      { scannerType: 'precinct' }
    )
  ).toEqual(err({ type: 'missing-usb-drive' }));
});

test('castVoteRecordsIncludeRedundantMetadata system setting', async () => {
  const sheet = newAcceptedSheet(interpretedHmpb, sheet1Id);
  const castVoteRecords: CVR.CVR[] = [];
  for (const includeRedundantMetadata of [true, false] as const) {
    mockUsbDrive.removeUsbDrive();
    mockUsbDrive.insertUsbDrive({});

    mockPrecinctScannerStore.setSystemSettings({
      ...assertDefined(mockPrecinctScannerStore.getSystemSettings()),
      castVoteRecordsIncludeRedundantMetadata: includeRedundantMetadata,
    });

    expect(
      await exportCastVoteRecordsToUsbDrive(
        mockPrecinctScannerStore,
        mockUsbDrive.usbDrive,
        [sheet],
        { scannerType: 'precinct' }
      )
    ).toEqual(ok());

    const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
      mockUsbDrive.usbDrive
    );
    expect(exportDirectoryPaths).toHaveLength(1);
    const exportDirectoryPath = assertDefined(exportDirectoryPaths[0]);
    const { castVoteRecord, castVoteRecordReportContents } = readCastVoteRecord(
      path.join(exportDirectoryPath, sheet1Id)
    );

    castVoteRecords.push(castVoteRecord);
    const numberOfKeysInCastVoteRecordReport = Object.keys(
      JSON.parse(castVoteRecordReportContents)
    ).length;
    if (includeRedundantMetadata) {
      expect(numberOfKeysInCastVoteRecordReport).toBeGreaterThan(1);
    } else {
      expect(numberOfKeysInCastVoteRecordReport).toEqual(1);
    }
  }

  // Verify that the parsed cast vote record is unaffected by the optimization
  expect(castVoteRecords).toHaveLength(2);
  expect(castVoteRecords[0]).toBeDefined();
  expect(castVoteRecords[1]).toBeDefined();
  expect(castVoteRecords[0]).toEqual(castVoteRecords[1]);
});

test('castVoteRecordsIncludeOriginalSnapshots system setting', async () => {
  const sheet = newAcceptedSheet(interpretedHmpb, sheet1Id);
  const castVoteRecords: CVR.CVR[] = [];
  for (const includeOriginalSnapshots of [true, false] as const) {
    mockUsbDrive.removeUsbDrive();
    mockUsbDrive.insertUsbDrive({});

    mockPrecinctScannerStore.setSystemSettings({
      ...assertDefined(mockPrecinctScannerStore.getSystemSettings()),
      castVoteRecordsIncludeOriginalSnapshots: includeOriginalSnapshots,
    });

    expect(
      await exportCastVoteRecordsToUsbDrive(
        mockPrecinctScannerStore,
        mockUsbDrive.usbDrive,
        [sheet],
        { scannerType: 'precinct' }
      )
    ).toEqual(ok());

    const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
      mockUsbDrive.usbDrive
    );
    expect(exportDirectoryPaths).toHaveLength(1);
    const exportDirectoryPath = assertDefined(exportDirectoryPaths[0]);
    const { castVoteRecord } = readCastVoteRecord(
      path.join(exportDirectoryPath, sheet1Id)
    );

    castVoteRecords.push(castVoteRecord);
    const modifiedSnapshot = castVoteRecord.CVRSnapshot.find(
      (snapshot) => snapshot.Type === CVR.CVRType.Modified
    );
    expect(modifiedSnapshot).toBeDefined();
    const originalSnapshot = castVoteRecord.CVRSnapshot.find(
      (snapshot) => snapshot.Type === CVR.CVRType.Original
    );
    if (includeOriginalSnapshots) {
      expect(originalSnapshot).toBeDefined();
    } else {
      expect(originalSnapshot).toBeUndefined();
    }
  }
});

test.each<{
  description: string;
  setupFn: () => void | Promise<void>;
  shouldUsbDriveRequireCastVoteRecordSync: boolean;
}>([
  {
    description: 'no USB drive, unconfigured machine',
    setupFn: () => {
      mockUsbDrive.removeUsbDrive();
      mockPrecinctScannerStore.setElectionDefinition(undefined);
      mockPrecinctScannerStore.setPollsState('polls_closed_initial');
    },
    shouldUsbDriveRequireCastVoteRecordSync: false,
  },
  {
    description: 'unconfigured machine',
    setupFn: () => {
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setElectionDefinition(undefined);
      mockPrecinctScannerStore.setPollsState('polls_closed_initial');
    },
    shouldUsbDriveRequireCastVoteRecordSync: false,
  },
  {
    description: 'configured machine, polls closed',
    setupFn: () => {
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
      mockPrecinctScannerStore.setPollsState('polls_closed_initial');
    },
    shouldUsbDriveRequireCastVoteRecordSync: false,
  },
  {
    description: 'polls open, no ballots cast',
    setupFn: () => {
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
      mockPrecinctScannerStore.setPollsState('polls_open');
    },
    shouldUsbDriveRequireCastVoteRecordSync: false,
  },
  {
    description: 'ballots cast, nothing on USB drive',
    setupFn: () => {
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
      mockPrecinctScannerStore.setPollsState('polls_open');
      mockPrecinctScannerStore.setBallotsCounted(1);
    },
    shouldUsbDriveRequireCastVoteRecordSync: true,
  },
  {
    description:
      'ballots cast, nothing on USB drive, continuous export disabled',
    setupFn: () => {
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
      mockPrecinctScannerStore.setPollsState('polls_open');
      mockPrecinctScannerStore.setBallotsCounted(1);
      mockPrecinctScannerStore.setIsContinuousExportEnabled(false);
    },
    shouldUsbDriveRequireCastVoteRecordSync: false,
  },
  {
    description:
      'ballots cast, previous export operation may have failed midway',
    setupFn: async () => {
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
      mockPrecinctScannerStore.setPollsState('polls_open');
      mockPrecinctScannerStore.setBallotsCounted(1);
      const usbDriveStatus = await mockUsbDrive.usbDrive.status();
      assert(usbDriveStatus.status === 'mounted');
      mockPrecinctScannerStore.addPendingContinuousExportOperation(
        'abcd1234-0000-0000-0000-000000000000'
      );
    },
    shouldUsbDriveRequireCastVoteRecordSync: true,
  },
  {
    description:
      'ballots cast, previous export operation may have failed midway, continuous export disabled',
    setupFn: async () => {
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
      mockPrecinctScannerStore.setPollsState('polls_open');
      mockPrecinctScannerStore.setBallotsCounted(1);
      const usbDriveStatus = await mockUsbDrive.usbDrive.status();
      assert(usbDriveStatus.status === 'mounted');
      mockPrecinctScannerStore.addPendingContinuousExportOperation(
        'abcd1234-0000-0000-0000-000000000000'
      );
      mockPrecinctScannerStore.setIsContinuousExportEnabled(false);
    },
    shouldUsbDriveRequireCastVoteRecordSync: false,
  },
  {
    description: 'ballots cast and exported to USB drive',
    setupFn: async () => {
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
      mockPrecinctScannerStore.setPollsState('polls_open');
      mockPrecinctScannerStore.setBallotsCounted(1);
      (
        await exportCastVoteRecordsToUsbDrive(
          mockPrecinctScannerStore,
          mockUsbDrive.usbDrive,
          [newAcceptedSheet(interpretedHmpb)],
          { scannerType: 'precinct' }
        )
      ).unsafeUnwrap();
    },
    shouldUsbDriveRequireCastVoteRecordSync: false,
  },
  {
    description:
      'ballots cast and exported to USB drive, but USB drive replaced',
    setupFn: async () => {
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
      mockPrecinctScannerStore.setPollsState('polls_open');
      mockPrecinctScannerStore.setBallotsCounted(1);
      (
        await exportCastVoteRecordsToUsbDrive(
          mockPrecinctScannerStore,
          mockUsbDrive.usbDrive,
          [newAcceptedSheet(interpretedHmpb)],
          { scannerType: 'precinct' }
        )
      ).unsafeUnwrap();
      mockUsbDrive.removeUsbDrive();
      mockUsbDrive.insertUsbDrive({});
    },
    shouldUsbDriveRequireCastVoteRecordSync: true,
  },
  {
    description:
      'ballots cast and exported to USB drive, but USB drive replaced, continuous export disabled',
    setupFn: async () => {
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
      mockPrecinctScannerStore.setPollsState('polls_open');
      mockPrecinctScannerStore.setBallotsCounted(1);
      (
        await exportCastVoteRecordsToUsbDrive(
          mockPrecinctScannerStore,
          mockUsbDrive.usbDrive,
          [newAcceptedSheet(interpretedHmpb)],
          { scannerType: 'precinct' }
        )
      ).unsafeUnwrap();
      mockUsbDrive.removeUsbDrive();
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setIsContinuousExportEnabled(false);
    },
    shouldUsbDriveRequireCastVoteRecordSync: false,
  },
  {
    description:
      'cast vote record root hash in metadata file does not match that on machine',
    setupFn: async () => {
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
      mockPrecinctScannerStore.setPollsState('polls_open');
      mockPrecinctScannerStore.setBallotsCounted(1);
      (
        await exportCastVoteRecordsToUsbDrive(
          mockPrecinctScannerStore,
          mockUsbDrive.usbDrive,
          [newAcceptedSheet(interpretedHmpb)],
          { scannerType: 'precinct' }
        )
      ).unsafeUnwrap();
      const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
        mockUsbDrive.usbDrive
      );
      expect(exportDirectoryPaths).toHaveLength(1);
      const exportDirectoryPath = assertDefined(exportDirectoryPaths[0]);
      const metadataFilePath = path.join(
        exportDirectoryPath,
        CastVoteRecordExportFileName.METADATA
      );
      const metadata = JSON.parse(fs.readFileSync(metadataFilePath, 'utf-8'));
      fs.writeFileSync(
        metadataFilePath,
        JSON.stringify({
          ...metadata,
          castVoteRecordRootHash: 'incorrect-hash',
        })
      );
    },
    shouldUsbDriveRequireCastVoteRecordSync: true,
  },
])(
  'doesUsbDriveRequireCastVoteRecordSync - $description',
  async ({ setupFn, shouldUsbDriveRequireCastVoteRecordSync }) => {
    await setupFn();
    const usbDriveStatus = await mockUsbDrive.usbDrive.status();

    expect(
      await doesUsbDriveRequireCastVoteRecordSync(
        mockPrecinctScannerStore,
        usbDriveStatus
      )
    ).toEqual(shouldUsbDriveRequireCastVoteRecordSync);
  }
);

test('doesUsbDriveRequireCastVoteRecordSync caching works', async () => {
  const getElectionRecordSpy = jest.spyOn(
    mockPrecinctScannerStore,
    'getElectionRecord'
  );

  mockUsbDrive.insertUsbDrive({});
  const usbDriveStatus = await mockUsbDrive.usbDrive.status();

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);
  expect(getElectionRecordSpy).toHaveBeenCalledTimes(1);
  getElectionRecordSpy.mockClear();

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);
  expect(getElectionRecordSpy).not.toHaveBeenCalled();
});

test('change in USB drive status clears doesUsbDriveRequireCastVoteRecordSync cache', async () => {
  const getElectionRecordSpy = jest.spyOn(
    mockPrecinctScannerStore,
    'getElectionRecord'
  );

  mockUsbDrive.insertUsbDrive({});
  let usbDriveStatus = await mockUsbDrive.usbDrive.status();

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);
  expect(getElectionRecordSpy).toHaveBeenCalledTimes(1);
  getElectionRecordSpy.mockClear();

  mockUsbDrive.removeUsbDrive();
  usbDriveStatus = await mockUsbDrive.usbDrive.status();

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);
  expect(getElectionRecordSpy).not.toHaveBeenCalled();

  mockUsbDrive.insertUsbDrive({});
  usbDriveStatus = await mockUsbDrive.usbDrive.status();

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);
  expect(getElectionRecordSpy).toHaveBeenCalledTimes(1);
});

test('full cast vote record export on precinct scanner clears doesUsbDriveRequireCastVoteRecordSync cache', async () => {
  mockUsbDrive.insertUsbDrive({});
  let usbDriveStatus = await mockUsbDrive.usbDrive.status();
  mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
  mockPrecinctScannerStore.setPollsState('polls_open');
  mockPrecinctScannerStore.setBallotsCounted(1);

  const sheet = newAcceptedSheet(interpretedHmpb, sheet1Id);
  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [sheet],
      { scannerType: 'precinct' }
    )
  ).toEqual(ok());

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);

  mockUsbDrive.removeUsbDrive();
  usbDriveStatus = await mockUsbDrive.usbDrive.status();

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);

  mockUsbDrive.insertUsbDrive({});
  usbDriveStatus = await mockUsbDrive.usbDrive.status();

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(true);

  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [sheet],
      { scannerType: 'precinct' }
    )
  ).toEqual(ok());

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(true);

  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [sheet],
      { scannerType: 'precinct', isFullExport: true }
    )
  ).toEqual(ok());

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);
});

test('tracking pending continuous export operations', async () => {
  mockUsbDrive.insertUsbDrive({});
  mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
  mockPrecinctScannerStore.setPollsState('polls_open');

  const sheet1 = newAcceptedSheet(interpretedHmpb, sheet1Id);
  const sheet2 = newAcceptedSheet(interpretedHmpb, sheet2Id);
  const sheet3 = newAcceptedSheet(interpretedHmpb, sheet3Id);
  const sheet4 = newAcceptedSheet(interpretedHmpb, sheet3Id);
  const sheet5 = newAcceptedSheet(interpretedHmpb, sheet3Id);
  mockPrecinctScannerStore.addPendingContinuousExportOperation(sheet1Id);
  mockPrecinctScannerStore.addPendingContinuousExportOperation(sheet2Id);
  mockPrecinctScannerStore.addPendingContinuousExportOperation(sheet3Id);
  mockPrecinctScannerStore.addPendingContinuousExportOperation(sheet4Id);
  mockPrecinctScannerStore.addPendingContinuousExportOperation(sheet5Id);
  expect(
    mockPrecinctScannerStore.getPendingContinuousExportOperations()
  ).toEqual([sheet1Id, sheet2Id, sheet3Id, sheet4Id, sheet5Id]);

  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [sheet1],
      { scannerType: 'precinct' }
    )
  ).toEqual(ok());
  expect(
    mockPrecinctScannerStore.getPendingContinuousExportOperations()
  ).toEqual([sheet2Id, sheet3Id, sheet4Id, sheet5Id]);

  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [sheet2, sheet3],
      { scannerType: 'precinct' }
    )
  ).toEqual(ok());
  expect(
    mockPrecinctScannerStore.getPendingContinuousExportOperations()
  ).toEqual([sheet4Id, sheet5Id]);

  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [sheet1, sheet2, sheet3, sheet4, sheet5],
      { scannerType: 'precinct', isFullExport: true }
    )
  ).toEqual(ok());
  expect(
    mockPrecinctScannerStore.getPendingContinuousExportOperations()
  ).toEqual([]);
});

test('export and subsequent import of that export', async () => {
  // Export
  process.env['VX_MACHINE_TYPE'] = 'scan';
  for (const sheet of [
    newAcceptedSheet(interpretedHmpb, sheet1Id),
    newAcceptedSheet(interpretedHmpbWithWriteIn, sheet2Id),
    newAcceptedSheet(interpretedBmdBallot, sheet3Id),
    newRejectedSheet(sheet4Id),
  ]) {
    expect(
      await exportCastVoteRecordsToUsbDrive(
        mockPrecinctScannerStore,
        mockUsbDrive.usbDrive,
        [sheet],
        { scannerType: 'precinct' }
      )
    ).toEqual(ok());
  }
  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [],
      { scannerType: 'precinct', arePollsClosing: true }
    )
  ).toEqual(ok());

  // Import
  process.env['VX_MACHINE_TYPE'] = 'admin';
  const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
    mockUsbDrive.usbDrive
  );
  expect(exportDirectoryPaths).toHaveLength(1);
  const exportDirectoryPath = assertDefined(exportDirectoryPaths[0]);
  const readResult = await readCastVoteRecordExport(exportDirectoryPath);
  expect(readResult.isOk()).toEqual(true);
  assert(readResult.isOk());
  const { castVoteRecordIterator } = readResult.ok();
  const castVoteRecordResults = await castVoteRecordIterator.toArray();
  expect(castVoteRecordResults).toHaveLength(3);
  expect(
    castVoteRecordResults.every((castVoteRecordResult) =>
      castVoteRecordResult.isOk()
    )
  ).toEqual(true);
});

test('recovery export', async () => {
  const sheet1 = newAcceptedSheet(interpretedHmpb, sheet1Id);
  const sheet2 = newAcceptedSheet(interpretedHmpb, sheet2Id);
  const sheet3 = newAcceptedSheet(interpretedHmpb, sheet3Id);
  const sheet4 = newAcceptedSheet(interpretedHmpb, sheet4Id);

  for (const sheet of [sheet1, sheet2, sheet3]) {
    expect(
      await exportCastVoteRecordsToUsbDrive(
        mockPrecinctScannerStore,
        mockUsbDrive.usbDrive,
        [sheet],
        { scannerType: 'precinct' }
      )
    ).toEqual(ok());
  }

  const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
    mockUsbDrive.usbDrive
  );
  expect(exportDirectoryPaths).toHaveLength(1);
  const exportDirectoryPath = assertDefined(exportDirectoryPaths[0]);

  // Simulate an interrupted export operation
  fs.rmSync(
    path.join(
      exportDirectoryPath,
      `${sheet3Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`
    )
  );

  // Simulate an interrupted creation timestamp update
  fs.cpSync(
    path.join(exportDirectoryPath, sheet1Id),
    path.join(exportDirectoryPath, `${sheet1Id}-temp`),
    { recursive: true }
  );

  // Simulate an interrupted creation timestamp update
  fs.cpSync(
    path.join(exportDirectoryPath, sheet2Id),
    path.join(exportDirectoryPath, `${sheet2Id}-temp`),
    { recursive: true }
  );
  fs.renameSync(
    path.join(exportDirectoryPath, `${sheet2Id}-temp`),
    path.join(exportDirectoryPath, `${sheet2Id}-temp-complete`)
  );

  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [sheet3, sheet4],
      { scannerType: 'precinct', isRecoveryExport: true }
    )
  ).toEqual(ok());

  const exportDirectoryContents =
    await summarizeDirectoryContents(exportDirectoryPath);
  const expectedExportDirectoryContents = [
    CastVoteRecordExportFileName.METADATA,
    `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
    `${sheet1Id}/${sheet1Id}-front.jpg`,
    `${sheet1Id}/${sheet1Id}-back.jpg`,
    `${sheet1Id}/${sheet1Id}-front.layout.json`,
    `${sheet1Id}/${sheet1Id}-back.layout.json`,
    `${sheet2Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
    `${sheet2Id}/${sheet2Id}-front.jpg`,
    `${sheet2Id}/${sheet2Id}-back.jpg`,
    `${sheet2Id}/${sheet2Id}-front.layout.json`,
    `${sheet2Id}/${sheet2Id}-back.layout.json`,
    `${sheet3Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
    `${sheet3Id}/${sheet3Id}-front.jpg`,
    `${sheet3Id}/${sheet3Id}-back.jpg`,
    `${sheet3Id}/${sheet3Id}-front.layout.json`,
    `${sheet3Id}/${sheet3Id}-back.layout.json`,
    `${sheet4Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`,
    `${sheet4Id}/${sheet4Id}-front.jpg`,
    `${sheet4Id}/${sheet4Id}-back.jpg`,
    `${sheet4Id}/${sheet4Id}-front.layout.json`,
    `${sheet4Id}/${sheet4Id}-back.layout.json`,
  ].sort();
  expect(exportDirectoryContents).toEqual(expectedExportDirectoryContents);
});

test('recovery export expectedly errors if USB drive has been swapped', async () => {
  const sheet1 = newAcceptedSheet(interpretedHmpb, sheet1Id);
  const sheet2 = newAcceptedSheet(interpretedHmpb, sheet2Id);

  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [sheet1],
      { scannerType: 'precinct' }
    )
  ).toEqual(ok());

  // Swap USB drive
  mockUsbDrive.removeUsbDrive();
  mockUsbDrive.insertUsbDrive({});

  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [sheet2],
      { scannerType: 'precinct', isRecoveryExport: true }
    )
  ).toEqual(
    err({
      type: 'recovery-export-error',
      subType: 'expected-export-directory-does-not-exist',
    })
  );
});

test('recovery export expectedly errors if hash check fails', async () => {
  const sheet1 = newAcceptedSheet(interpretedHmpb, sheet1Id);
  const sheet2 = newAcceptedSheet(interpretedHmpb, sheet2Id);

  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [sheet1],
      { scannerType: 'precinct' }
    )
  ).toEqual(ok());

  const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
    mockUsbDrive.usbDrive
  );
  expect(exportDirectoryPaths).toHaveLength(1);
  const exportDirectoryPath = assertDefined(exportDirectoryPaths[0]);

  fs.appendFileSync(
    path.join(
      exportDirectoryPath,
      `${sheet1Id}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}`
    ),
    'CORRUPTED'
  );

  expect(
    await exportCastVoteRecordsToUsbDrive(
      mockPrecinctScannerStore,
      mockUsbDrive.usbDrive,
      [sheet2],
      { scannerType: 'precinct', isRecoveryExport: true }
    )
  ).toEqual(
    err({
      type: 'recovery-export-error',
      subType: 'hash-mismatch-after-recovery-export',
    })
  );
});
