import fs from 'fs';
import path from 'path';
import { dirSync } from 'tmp';
import { v4 as uuid } from 'uuid';
import { assert, assertDefined, err, ok, sleep } from '@votingworks/basics';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  BatchInfo,
  CastVoteRecordExportFileName,
  CVR,
  PageInterpretation,
  SheetOf,
} from '@votingworks/types';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';

import {
  interpretedBmdBallot,
  interpretedBmdPage,
  interpretedHmpb,
  interpretedHmpbPage1,
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

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

const { electionDefinition } = electionTwoPartyPrimaryFixtures;

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
  mockFeatureFlagger.resetFeatureFlags();

  mockUsbDrive = createMockUsbDrive();
  mockCentralScannerStore = new MockCentralScannerStore();
  mockPrecinctScannerStore = new MockPrecinctScannerStore();
  tempDirectoryPath = dirSync().name;

  mockUsbDrive.insertUsbDrive({});
  mockCentralScannerStore.setElectionDefinition(electionDefinition);
  mockCentralScannerStore.setBatches([batch1]);
  mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
  mockPrecinctScannerStore.setPollsState('polls_open');
  mockPrecinctScannerStore.setBatches([batch1]);
});

afterEach(() => {
  fs.rmSync(tempDirectoryPath, { recursive: true });
  clearDoesUsbDriveRequireCastVoteRecordSyncCachedResult();
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
        vxLayoutFileHash: expect.any(String),
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
        vxLayoutFileHash: expect.any(String),
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
        vxLayoutFileHash: expect.any(String),
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
        vxLayoutFileHash: expect.any(String),
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
        vxLayoutFileHash: expect.any(String),
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
        vxLayoutFileHash: expect.any(String),
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
        vxLayoutFileHash: expect.any(String),
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
        vxLayoutFileHash: expect.any(String),
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
        vxLayoutFileHash: expect.any(String),
      },
      {
        '@type': 'CVR.ImageData',
        Hash: anyCastVoteRecordHash,
        Location: `file:${sheet1Id}-back.jpg`,
        vxLayoutFileHash: expect.any(String),
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

test('CAST_VOTE_RECORD_OPTIMIZATION_EXCLUDE_REDUNDANT_METADATA feature flag', async () => {
  const sheet = newAcceptedSheet(interpretedHmpb, sheet1Id);
  const castVoteRecords: CVR.CVR[] = [];
  for (const isOptimizationEnabled of [true, false] as const) {
    mockUsbDrive.removeUsbDrive();
    mockUsbDrive.insertUsbDrive({});

    if (isOptimizationEnabled) {
      mockFeatureFlagger.enableFeatureFlag(
        BooleanEnvironmentVariableName.CAST_VOTE_RECORD_OPTIMIZATION_EXCLUDE_REDUNDANT_METADATA
      );
    } else {
      mockFeatureFlagger.disableFeatureFlag(
        BooleanEnvironmentVariableName.CAST_VOTE_RECORD_OPTIMIZATION_EXCLUDE_REDUNDANT_METADATA
      );
    }

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
    if (isOptimizationEnabled) {
      expect(numberOfKeysInCastVoteRecordReport).toEqual(1);
    } else {
      expect(numberOfKeysInCastVoteRecordReport).toBeGreaterThan(1);
    }
  }

  // Verify that the parsed cast vote record is unaffected by the optimization
  expect(castVoteRecords).toHaveLength(2);
  expect(castVoteRecords[0]).toBeDefined();
  expect(castVoteRecords[1]).toBeDefined();
  expect(castVoteRecords[0]).toEqual(castVoteRecords[1]);
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
      'ballots cast, previous export operation may have failed midway',
    setupFn: async () => {
      mockUsbDrive.insertUsbDrive({});
      mockPrecinctScannerStore.setElectionDefinition(electionDefinition);
      mockPrecinctScannerStore.setPollsState('polls_open');
      mockPrecinctScannerStore.setBallotsCounted(1);
      const usbDriveStatus = await mockUsbDrive.usbDrive.status();
      assert(usbDriveStatus.status === 'mounted');
      mockPrecinctScannerStore.setIsContinuousExportOperationInProgress(true);
    },
    shouldUsbDriveRequireCastVoteRecordSync: true,
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
  const getElectionDefinitionSpy = jest.spyOn(
    mockPrecinctScannerStore,
    'getElectionDefinition'
  );

  mockUsbDrive.insertUsbDrive({});
  const usbDriveStatus = await mockUsbDrive.usbDrive.status();

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);
  expect(getElectionDefinitionSpy).toHaveBeenCalledTimes(1);
  getElectionDefinitionSpy.mockClear();

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);
  expect(getElectionDefinitionSpy).not.toHaveBeenCalled();
});

test('change in USB drive status clears doesUsbDriveRequireCastVoteRecordSync cache', async () => {
  const getElectionDefinitionSpy = jest.spyOn(
    mockPrecinctScannerStore,
    'getElectionDefinition'
  );

  mockUsbDrive.insertUsbDrive({});
  let usbDriveStatus = await mockUsbDrive.usbDrive.status();

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);
  expect(getElectionDefinitionSpy).toHaveBeenCalledTimes(1);
  getElectionDefinitionSpy.mockClear();

  mockUsbDrive.removeUsbDrive();
  usbDriveStatus = await mockUsbDrive.usbDrive.status();

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);
  expect(getElectionDefinitionSpy).not.toHaveBeenCalled();

  mockUsbDrive.insertUsbDrive({});
  usbDriveStatus = await mockUsbDrive.usbDrive.status();

  expect(
    await doesUsbDriveRequireCastVoteRecordSync(
      mockPrecinctScannerStore,
      usbDriveStatus
    )
  ).toEqual(false);
  expect(getElectionDefinitionSpy).toHaveBeenCalledTimes(1);
});

test('cast vote record export clears doesUsbDriveRequireCastVoteRecordSync cache', async () => {
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
  ).toEqual(false);
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
