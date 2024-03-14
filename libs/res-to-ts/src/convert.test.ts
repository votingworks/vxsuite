import fs from 'fs';
import { basename } from 'path';
import tmp from 'tmp';
import { convert } from './convert';

test('creating a resource for a directory', async () => {
  fs.mkdirSync('/tmp/data/electionFixture/cvr-files', { recursive: true });
  const tmpDirName = tmp.dirSync({
    template: '/tmp/data/electionFixture/cvr-files/resource-XXXXXX',
  }).name;
  const result = await convert({
    path: tmpDirName,
    tsPath: '/tmp/src/data/electionFixture/cvr-files/resource.ts',
    mimeType: 'application/octet-stream',
  });
  const tmpDirBaseName = basename(tmpDirName);
  expect(result).toContain(tmpDirBaseName);
  expect(result.replace(tmpDirBaseName, 'resource')).toMatchSnapshot();
});
