import { dirSync } from 'tmp';
import { mockLogger } from '@votingworks/logging';
import { Importer } from './importer';
import { createWorkspace } from './util/workspace';
import { makeMockScanner } from '../test/util/mocks';

test('no election is configured', async () => {
  const workspace = createWorkspace(dirSync().name);
  const scanner = makeMockScanner();
  const importer = new Importer({
    workspace,
    scanner,
    logger: mockLogger(),
  });

  await expect(importer.startImport()).rejects.toThrowError(
    'no election configuration'
  );

  await expect(
    importer.importSheet('batch-1', '/tmp/front.jpeg', '/tmp/back.jpeg')
  ).rejects.toThrowError('no election configuration');
});
