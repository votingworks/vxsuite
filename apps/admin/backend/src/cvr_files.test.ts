import { Buffer } from 'buffer';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { CVR, getDisplayElectionHash } from '@votingworks/types';
import { createMockUsb } from '../test/app';
import {
  convertCastVoteRecordToLegacyFormat,
  listCastVoteRecordFilesOnUsb,
  validateCastVoteRecord,
} from './cvr_files';

const electionDefinition = electionMinimalExhaustiveSampleDefinition;
const file = Buffer.from([]);

describe('list cast vote record files on USB drive', () => {
  test('lists cast vote record report directories meeting criteria', async () => {
    const logger = fakeLogger();
    const { usb, insertUsbDrive } = createMockUsb();
    insertUsbDrive({
      'cast-vote-records': {
        [`sample-county_example-primary-election_${getDisplayElectionHash(
          electionDefinition
        )}`]: {
          'TEST__machine_0000__4_ballots__2022-07-01_11-21-41': {}, // valid
          'TEST__machine_0000__8_ballots__2022-07-01_11-31-41': {}, // valid
          'cvr.jsonl': {}, // invalid name
          'TEST__machine_0000__8_ballots__2022-07-01_11-41-41': file, // invalid as file
        },
      },
    });

    const cvrFileMetadata = await listCastVoteRecordFilesOnUsb(
      electionDefinition,
      usb,
      logger
    );

    expect(cvrFileMetadata).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          cvrCount: 8,
          exportTimestamp: new Date('2022-07-01T11:31:41.000Z'),
          isTestModeResults: true,
          name: 'TEST__machine_0000__8_ballots__2022-07-01_11-31-41',
          scannerIds: ['0000'],
        }),
        expect.objectContaining({
          cvrCount: 4,
          exportTimestamp: new Date('2022-07-01T11:21:41.000Z'),
          isTestModeResults: true,
          name: 'TEST__machine_0000__4_ballots__2022-07-01_11-21-41',
          scannerIds: ['0000'],
        }),
      ])
    );

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.CvrFilesReadFromUsb,
      'system',
      {
        disposition: 'success',
        message: 'Found 2 CVR files on USB drive, user shown option to load.',
      }
    );
  });

  test('usb not present or mounted', async () => {
    const logger = fakeLogger();
    const { usb } = createMockUsb();

    expect(
      await listCastVoteRecordFilesOnUsb(electionDefinition, usb, logger)
    ).toEqual([]);

    usb.getUsbDrives.mockResolvedValue([
      {
        deviceName: 'mock-usb-drive',
      },
    ]);

    expect(
      await listCastVoteRecordFilesOnUsb(electionDefinition, usb, logger)
    ).toEqual([]);

    expect(logger.log).not.toHaveBeenCalled();
  });

  test('default directory not found on USB', async () => {
    const logger = fakeLogger();
    const { usb, insertUsbDrive } = createMockUsb();

    insertUsbDrive({
      'cast-vote-records': {
        'other-election-folder': {
          'other-cvr': file,
        },
      },
    });
    expect(
      await listCastVoteRecordFilesOnUsb(electionDefinition, usb, logger)
    ).toEqual([]);
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.CvrFilesReadFromUsb,
      'system',
      {
        disposition: 'success',
        message:
          'No cast vote record files automatically found on USB drive. User is allowed to manually select files.',
      }
    );
  });

  test('unexpected issue accessing directory', async () => {
    const logger = fakeLogger();
    const { usb, insertUsbDrive } = createMockUsb();
    insertUsbDrive({
      'cast-vote-records': {
        [`sample-county_example-primary-election_${getDisplayElectionHash(
          electionDefinition
        )}`]: file,
      },
    });
    expect(
      await listCastVoteRecordFilesOnUsb(electionDefinition, usb, logger)
    ).toEqual([]);
    expect(logger.log).toHaveBeenNthCalledWith(
      1,
      LogEventId.CvrFilesReadFromUsb,
      'system',
      {
        disposition: 'failure',
        message:
          'Error accessing cast vote record files on USB drive, which may be corrupted.',
      }
    );
  });
});

const ballotImageLocation = 'file:./ballot-images/batch-1/test';
const validCastVoteRecord: CVR.CVR = {
  '@type': 'CVR.CVR',
  BallotStyleId: '1M',
  BallotStyleUnitId: 'precinct-1',
  PartyIds: ['0'],
  CreatingDeviceId: 'scanner',
  ElectionId:
    'e38b66442647f4bc87a08e3e4f0986db3c354a58b0790096b88c2e208e18cd08',
  BatchId: 'batch-1',
  vxBallotType: CVR.vxBallotType.Absentee,
  BallotSheetId: '1',
  CurrentSnapshotId: '0-modified',
  UniqueId: '0',
  BallotImage: [
    {
      '@type': 'CVR.ImageData',
      Location: ballotImageLocation,
    },
    {
      '@type': 'CVR.ImageData',
    },
  ],
  CVRSnapshot: [
    {
      '@type': 'CVR.CVRSnapshot',
      '@id': '0-modified',
      Type: CVR.CVRType.Modified,
      CVRContest: [
        {
          '@type': 'CVR.CVRContest',
          ContestId: 'best-animal-mammal',
          Overvotes: 0,
          Undervotes: 1,
          WriteIns: 0,
          Status: [
            CVR.ContestStatus.NotIndicated,
            CVR.ContestStatus.Undervoted,
          ],
          CVRContestSelection: [],
        },
        {
          '@type': 'CVR.CVRContest',
          ContestId: 'zoo-council-mammal',
          Overvotes: 0,
          Undervotes: 3,
          WriteIns: 0,
          Status: [
            CVR.ContestStatus.NotIndicated,
            CVR.ContestStatus.Undervoted,
          ],
          CVRContestSelection: [],
        },
        {
          '@type': 'CVR.CVRContest',
          ContestId: 'new-zoo-either',
          Overvotes: 0,
          Undervotes: 0,
          CVRContestSelection: [
            {
              '@type': 'CVR.CVRContestSelection',
              ContestSelectionId: 'yes',
              OptionPosition: 0,
              SelectionPosition: [
                {
                  '@type': 'CVR.SelectionPosition',
                  HasIndication: CVR.IndicationStatus.Yes,
                  NumberVotes: 1,
                  IsAllocable: CVR.AllocationStatus.Yes,
                },
              ],
            },
          ],
        },
        {
          '@type': 'CVR.CVRContest',
          ContestId: 'new-zoo-pick',
          Overvotes: 0,
          Undervotes: 0,
          CVRContestSelection: [
            {
              '@type': 'CVR.CVRContestSelection',
              ContestSelectionId: 'yes',
              OptionPosition: 0,
              SelectionPosition: [
                {
                  '@type': 'CVR.SelectionPosition',
                  HasIndication: CVR.IndicationStatus.Yes,
                  NumberVotes: 1,
                  IsAllocable: CVR.AllocationStatus.Yes,
                },
              ],
            },
          ],
        },
        {
          '@type': 'CVR.CVRContest',
          ContestId: 'fishing',
          Overvotes: 0,
          Undervotes: 0,
          CVRContestSelection: [
            {
              '@type': 'CVR.CVRContestSelection',
              ContestSelectionId: 'yes',
              OptionPosition: 0,
              SelectionPosition: [
                {
                  '@type': 'CVR.SelectionPosition',
                  HasIndication: CVR.IndicationStatus.Yes,
                  NumberVotes: 1,
                  IsAllocable: CVR.AllocationStatus.Yes,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('validateCastVoteRecord', () => {
  test('handles valid CVR', () => {
    const result = validateCastVoteRecord({
      cvr: validCastVoteRecord,
      electionDefinition,
      reportBallotImageLocations: [ballotImageLocation],
      reportBatchIds: ['batch-1'],
    });

    expect(result.isOk()).toBeTruthy();
  });

  test('error on invalid election', () => {
    const result = validateCastVoteRecord({
      cvr: {
        ...validCastVoteRecord,
        ElectionId: 'wrong',
      },
      electionDefinition,
      reportBallotImageLocations: [ballotImageLocation],
      reportBatchIds: ['batch-1'],
    });

    expect(result.err()).toEqual('invalid-election');
  });

  test('error on invalid ballot style', () => {
    const result = validateCastVoteRecord({
      cvr: {
        ...validCastVoteRecord,
        BallotStyleId: 'wrong',
      },
      electionDefinition,
      reportBallotImageLocations: [ballotImageLocation],
      reportBatchIds: ['batch-1'],
    });

    expect(result.err()).toEqual('invalid-ballot-style');
  });

  test('error on invalid precinct', () => {
    const result = validateCastVoteRecord({
      cvr: {
        ...validCastVoteRecord,
        BallotStyleUnitId: 'wrong',
      },
      electionDefinition,
      reportBallotImageLocations: [ballotImageLocation],
      reportBatchIds: ['batch-1'],
    });

    expect(result.err()).toEqual('invalid-precinct');
  });

  test('error on invalid batch', () => {
    const result = validateCastVoteRecord({
      cvr: {
        ...validCastVoteRecord,
        BatchId: 'wrong',
      },
      electionDefinition,
      reportBallotImageLocations: [ballotImageLocation],
      reportBatchIds: ['batch-1'],
    });

    expect(result.err()).toEqual('invalid-batch');
  });

  test('error on invalid sheet number', () => {
    const result = validateCastVoteRecord({
      cvr: {
        ...validCastVoteRecord,
        BallotSheetId: 'wrong',
      },
      electionDefinition,
      reportBallotImageLocations: [ballotImageLocation],
      reportBatchIds: ['batch-1'],
    });

    expect(result.err()).toEqual('invalid-sheet-number');
  });

  const validCastVoteRecordSnapshot = validCastVoteRecord.CVRSnapshot[0]!;

  test('error on invalid contest id', () => {
    const result = validateCastVoteRecord({
      cvr: {
        ...validCastVoteRecord,
        CVRSnapshot: [
          {
            ...validCastVoteRecordSnapshot,
            CVRContest: [
              {
                '@type': 'CVR.CVRContest',
                ContestId: 'wrong',
                CVRContestSelection: [],
              },
            ],
          },
        ],
      },
      electionDefinition,
      reportBallotImageLocations: [ballotImageLocation],
      reportBatchIds: ['batch-1'],
    });

    expect(result.err()).toEqual('invalid-contest');
  });

  test('error on invalid contest option id', () => {
    const result = validateCastVoteRecord({
      cvr: {
        ...validCastVoteRecord,
        CVRSnapshot: [
          {
            ...validCastVoteRecordSnapshot,
            CVRContest: [
              {
                '@type': 'CVR.CVRContest',
                ContestId: 'best-animal-mammal',
                CVRContestSelection: [
                  {
                    '@type': 'CVR.CVRContestSelection',
                    ContestSelectionId: 'wrong',
                    SelectionPosition: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      electionDefinition,
      reportBallotImageLocations: [ballotImageLocation],
      reportBatchIds: ['batch-1'],
    });

    expect(result.err()).toEqual('invalid-contest-option');
  });

  test('error on unknown ballot image', () => {
    const result = validateCastVoteRecord({
      cvr: {
        ...validCastVoteRecord,
        BallotImage: [
          {
            '@type': 'CVR.ImageData',
            Location: 'wrong',
          },
          {
            '@type': 'CVR.ImageData',
          },
        ],
      },
      electionDefinition,
      reportBallotImageLocations: [ballotImageLocation],
      reportBatchIds: ['batch-1'],
    });

    expect(result.err()).toEqual('invalid-ballot-image-location');
  });

  test('error on mismatched write-in image', () => {
    const result = validateCastVoteRecord({
      cvr: {
        ...validCastVoteRecord,
        CVRSnapshot: [
          {
            ...validCastVoteRecordSnapshot,
            CVRContest: [
              {
                '@type': 'CVR.CVRContest',
                ContestId: 'best-animal-mammal',
                CVRContestSelection: [
                  {
                    '@type': 'CVR.CVRContestSelection',
                    ContestSelectionId: 'write-in-0',
                    SelectionPosition: [
                      {
                        '@type': 'CVR.SelectionPosition',
                        HasIndication: CVR.IndicationStatus.Yes,
                        NumberVotes: 1,
                        CVRWriteIn: {
                          '@type': 'CVR.CVRWriteIn',
                          WriteInImage: {
                            '@type': 'CVR.ImageData',
                            Location: 'wrong',
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      electionDefinition,
      reportBallotImageLocations: [ballotImageLocation],
      reportBatchIds: ['batch-1'],
    });

    expect(result.err()).toEqual('invalid-write-in-image-location');
  });

  test('error on missing current snapshot', () => {
    const result = validateCastVoteRecord({
      cvr: {
        ...validCastVoteRecord,
        CVRSnapshot: [],
      },
      electionDefinition,
      reportBallotImageLocations: [ballotImageLocation],
      reportBatchIds: ['batch-1'],
    });

    expect(result.err()).toEqual('no-current-snapshot');
  });
});

describe('convertCastVoteRecordToLegacyFormat', () => {
  test('general conversion ', () => {
    expect(
      convertCastVoteRecordToLegacyFormat({
        cvr: validCastVoteRecord,
        isTest: true,
        batchLabel: 'Batch 1',
      })
    ).toMatchObject({
      _ballotId: '0',
      _ballotStyleId: '1M',
      _ballotType: CVR.vxBallotType.Absentee,
      _batchId: 'batch-1',
      _batchLabel: 'Batch 1',
      _precinctId: 'precinct-1',
      _scannerId: 'scanner',
      _testBallot: true,
      'best-animal-mammal': [],
      fishing: ['yes'],
      'new-zoo-either': ['yes'],
      'new-zoo-pick': ['yes'],
      'zoo-council-mammal': [],
    });
  });

  test('precinct ballot type', () => {
    expect(
      convertCastVoteRecordToLegacyFormat({
        cvr: {
          ...validCastVoteRecord,
          vxBallotType: CVR.vxBallotType.Precinct,
        },
        isTest: true,
        batchLabel: 'Batch 1',
      })
    ).toMatchObject({
      _ballotType: 'standard',
    });
  });
});
