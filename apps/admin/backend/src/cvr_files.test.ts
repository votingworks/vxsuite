import { Buffer } from 'buffer';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { getDisplayElectionHash } from '@votingworks/types';
import { createMockUsb } from '../test/app';
import { listCastVoteRecordFilesOnUsb } from './cvr_files';

const electionDefinition = electionMinimalExhaustiveSampleDefinition;
const file = Buffer.from([]);

describe('list cast vote record files on USB drive', () => {
  test('finds present files meeting criteria', async () => {
    const logger = fakeLogger();
    const { usb, insertUsbDrive } = createMockUsb();
    insertUsbDrive({
      'cast-vote-records': {
        [`sample-county_example-primary-election_${getDisplayElectionHash(
          electionDefinition
        )}`]: {
          'TEST__machine_0000__4_ballots__2022-07-01_11-21-41.jsonl': file, // valid
          'TEST__machine_0000__8_ballots__2022-07-01_11-31-41.jsonl': file, // valid
          'cvr.jsonl': file, // invalid name
          'TEST__machine_0000__8_ballots__2022-07-01_11-41-41.jsonl': {
            file, // invalid as directory
          },
          'TEST__machine_0000__8_ballots__2022-07-01_11-31-41.json': file, // invalid extension
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
          name: 'TEST__machine_0000__8_ballots__2022-07-01_11-31-41.jsonl',
          scannerIds: ['0000'],
        }),
        expect.objectContaining({
          cvrCount: 4,
          exportTimestamp: new Date('2022-07-01T11:21:41.000Z'),
          isTestModeResults: true,
          name: 'TEST__machine_0000__4_ballots__2022-07-01_11-21-41.jsonl',
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
