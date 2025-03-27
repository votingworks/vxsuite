import { Buffer } from 'node:buffer';
import { MockFileTree } from '@votingworks/usb-drive';
import { zipFile } from '@votingworks/test-utils';
import { PollbookPackageFileName } from '../src/pollbook_package';

/**
 * Helper for mocking the file contents of on a USB drive with an election package
 * saved to it.
 */
export async function mockPollbookPackageFileTree(
  electionData: Buffer,
  votersData: string | Buffer,
  streetNameData: string | Buffer
): Promise<MockFileTree> {
  const zipContents: Record<string, Buffer | string> = {
    [PollbookPackageFileName.ELECTION]: electionData,
    [PollbookPackageFileName.VOTERS]: votersData,
    [PollbookPackageFileName.STREET_NAMES]: streetNameData,
  };
  return {
    'pollbook-package.zip': await zipFile(zipContents),
  };
}
