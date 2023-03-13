import {
  listDirectoryOnUsbDrive,
  FileSystemEntry,
  FileSystemEntryType,
} from '@votingworks/backend';
import { err, ok } from '@votingworks/basics';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { mockOf } from '@votingworks/test-utils';
import { getDisplayElectionHash } from '@votingworks/types';
import { listCastVoteRecordFilesOnUsb } from './cvr_files';

jest.mock('@votingworks/backend');

const mockListDirectoryOnUsbDrive = mockOf(listDirectoryOnUsbDrive);
const mockFileSystemEntry: FileSystemEntry = {
  name: 'TEST__machine_0000__4_ballots__2022-07-01_11-21-41.jsonl',
  path: '/tmp/TEST__machine_0000__4_ballots__2022-07-01_11-21-41.jsonl',
  type: FileSystemEntryType.File,
  size: 1024,
  mtime: new Date(),
  atime: new Date(),
  ctime: new Date(),
};

const electionDefinition = electionMinimalExhaustiveSampleDefinition;

beforeEach(() => {
  mockListDirectoryOnUsbDrive.mockReset();
});

describe('list cast vote record files on USB drive', () => {
  test('files present', async () => {
    const logger = fakeLogger();
    mockListDirectoryOnUsbDrive.mockResolvedValueOnce(
      ok([
        mockFileSystemEntry, // valid
        {
          ...mockFileSystemEntry, // valid
          name: 'TEST__machine_0000__8_ballots__2022-07-01_11-31-41.jsonl',
          path: '/tmp/TEST__machine_0000__8_ballots__2022-07-01_11-31-41.jsonl',
        },
        {
          ...mockFileSystemEntry, // invalid because file name
          name: 'cvr.jsonl',
          path: '/tmp/cvr.jsonl',
        },
        { ...mockFileSystemEntry, type: FileSystemEntryType.Directory }, // invalid because directory
        {
          ...mockFileSystemEntry,
          name: 'TEST__machine_0000__4_ballots__2022-07-01_11-21-41.json', // invalid because extension
          path: '/tmp/TEST__machine_0000__4_ballots__2022-07-01_11-21-41.json',
        },
      ])
    );

    const cvrFileMetadata = await listCastVoteRecordFilesOnUsb(
      electionDefinition,
      logger
    );

    expect(mockListDirectoryOnUsbDrive).toHaveBeenCalledWith(
      `cast-vote-records/sample-county_example-primary-election_${getDisplayElectionHash(
        electionDefinition
      )}`
    );
    expect(cvrFileMetadata).toMatchInlineSnapshot(`
      Array [
        Object {
          "cvrCount": 8,
          "exportTimestamp": 2022-07-01T11:31:41.000Z,
          "isTestModeResults": true,
          "name": "TEST__machine_0000__8_ballots__2022-07-01_11-31-41.jsonl",
          "path": "/tmp/TEST__machine_0000__8_ballots__2022-07-01_11-31-41.jsonl",
          "scannerIds": Array [
            "0000",
          ],
        },
        Object {
          "cvrCount": 4,
          "exportTimestamp": 2022-07-01T11:21:41.000Z,
          "isTestModeResults": true,
          "name": "TEST__machine_0000__4_ballots__2022-07-01_11-21-41.jsonl",
          "path": "/tmp/TEST__machine_0000__4_ballots__2022-07-01_11-21-41.jsonl",
          "scannerIds": Array [
            "0000",
          ],
        },
      ]
    `);

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

    mockListDirectoryOnUsbDrive.mockResolvedValueOnce(
      err({ type: 'usb-drive-not-mounted' })
    );
    expect(
      await listCastVoteRecordFilesOnUsb(electionDefinition, logger)
    ).toEqual([]);

    mockListDirectoryOnUsbDrive.mockResolvedValueOnce(
      err({ type: 'no-usb-drive' })
    );
    expect(
      await listCastVoteRecordFilesOnUsb(electionDefinition, logger)
    ).toEqual([]);

    expect(logger.log).not.toHaveBeenCalled();
  });

  test('default directory not found on USB', async () => {
    const logger = fakeLogger();

    mockListDirectoryOnUsbDrive.mockResolvedValueOnce(
      err({ type: 'no-entity', message: 'any' })
    );
    expect(
      await listCastVoteRecordFilesOnUsb(electionDefinition, logger)
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

    mockListDirectoryOnUsbDrive.mockResolvedValueOnce(
      err({ type: 'not-directory', message: 'any' })
    );
    expect(
      await listCastVoteRecordFilesOnUsb(electionDefinition, logger)
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

    mockListDirectoryOnUsbDrive.mockResolvedValueOnce(
      err({ type: 'permission-denied', message: 'any' })
    );
    expect(
      await listCastVoteRecordFilesOnUsb(electionDefinition, logger)
    ).toEqual([]);
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
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
