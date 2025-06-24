import { Buffer } from 'node:buffer';
import { MockFileTree } from '@votingworks/usb-drive';
import { zipFile } from '@votingworks/test-utils';
import { PollbookPackageFileName } from '../src/pollbook_package';

export async function mockPollbookPackageZip(
  electionData: Buffer,
  votersData: string | Buffer,
  streetNameData: string | Buffer
): Promise<Buffer> {
  const zipContents: Record<string, Buffer | string> = {
    [`${PollbookPackageFileName.ELECTION}.json`]: electionData,
    [`${PollbookPackageFileName.VOTERS}.csv`]: votersData,
    [`${PollbookPackageFileName.STREET_NAMES}.csv`]: streetNameData,
  };
  return await zipFile(zipContents);
}

/**
 * Helper for mocking the file contents of on a USB drive with an election package
 * saved to it.
 */
export async function mockPollbookPackageFileTree(
  electionData: Buffer,
  votersData: string | Buffer,
  streetNameData: string | Buffer
): Promise<MockFileTree> {
  return {
    'pollbook-package.zip': await mockPollbookPackageZip(
      electionData,
      votersData,
      streetNameData
    ),
  };
}
