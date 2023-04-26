import { fakeKiosk, zipFile } from '@votingworks/test-utils';
import { Buffer } from 'buffer';
import {
  readBallotPackageFromFile,
  readBallotPackageFromFilePointer,
} from './ballot_package';

test('readBallotPackageFromFile throws when an election.json is not present', async () => {
  const pkg = await zipFile({});
  await expect(
    readBallotPackageFromFile(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    "ballot package does not have a file called 'election.json'"
  );
});

test('readBallotPackageFromFile throws when given an invalid zip file', async () => {
  await expect(
    readBallotPackageFromFile(
      new File(['not-a-zip'], 'election-ballot-package.zip')
    )
  ).rejects.toThrowError();
});

test('readBallotPackageFromFilePointer throws when given an invalid zip file', async () => {
  const mockKiosk = fakeKiosk();
  mockKiosk.readFile = jest.fn().mockResolvedValue(Buffer.of(0, 1, 2));
  window.kiosk = mockKiosk;

  await expect(
    readBallotPackageFromFilePointer({
      name: 'file-name',
      path: 'path',
      size: 0,
    } as unknown as KioskBrowser.FileSystemEntry)
  ).rejects.toThrowError();
});

test('readBallotPackageFromFile throws when the file cannot be read', async () => {
  await expect(
    readBallotPackageFromFile({} as unknown as File)
  ).rejects.toThrowError();
});

test('readBallotPackageFromFilePointer throws when the file cannot be read', async () => {
  await expect(
    readBallotPackageFromFilePointer(
      {} as unknown as KioskBrowser.FileSystemEntry
    )
  ).rejects.toThrowError();
});
