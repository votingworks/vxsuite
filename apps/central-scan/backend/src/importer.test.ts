import { expect, test, vi } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger, mockLogger } from '@votingworks/logging';
import { createImageData } from 'canvas';
import { Importer } from './importer';
import { createWorkspace } from './util/workspace';
import { makeMockScanner } from '../test/util/mocks';

test('no election is configured', async () => {
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const scanner = makeMockScanner();
  const importer = new Importer({
    workspace,
    scanner,
    logger: mockLogger({ fn: vi.fn }),
  });

  await expect(importer.startImport()).rejects.toThrowError(
    'no election configuration'
  );

  await expect(
    importer.importSheet(
      'batch-1',
      createImageData(1, 1),
      createImageData(1, 1)
    )
  ).rejects.toThrowError('no election configuration');
});
