import fs from 'node:fs';
import path from 'node:path';
import { dirSync } from 'tmp';
import { sleep } from '@votingworks/basics';

import { updateCreationTimestampOfDirectoryAndChildrenFiles } from './file_system_utils';

let tempDirectoryPath: string;

beforeEach(() => {
  tempDirectoryPath = dirSync().name;
});

afterEach(() => {
  fs.rmSync(tempDirectoryPath, { recursive: true });
});

test('updateCreationTimestampOfDirectoryAndChildrenFiles', async () => {
  const directoryPath = path.join(tempDirectoryPath, '1');
  const childrenFilePaths = [
    path.join(directoryPath, 'a'),
    path.join(directoryPath, 'b'),
    path.join(directoryPath, 'c'),
  ];
  fs.mkdirSync(directoryPath);
  for (const filePath of childrenFilePaths) {
    fs.writeFileSync(filePath, '');
  }

  function getCreationTimestamps(): number[] {
    return [directoryPath, ...childrenFilePaths].map(
      (directoryOrFilePath) => fs.statSync(directoryOrFilePath).birthtimeMs
    );
  }

  const originalCreationTimestamps = getCreationTimestamps();
  await sleep(100);
  await updateCreationTimestampOfDirectoryAndChildrenFiles(directoryPath);
  const updatedCreationTimestamps = getCreationTimestamps();
  expect(updatedCreationTimestamps).not.toEqual(originalCreationTimestamps);
});
