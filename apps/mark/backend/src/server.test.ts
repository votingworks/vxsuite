import { expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { start } from './server';
import { createWorkspace } from './util/workspace';

test('can start server', async () => {
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const baseLogger = mockBaseLogger({ fn: vi.fn });
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );

  const server = await start({
    auth,
    baseLogger,
    // pick an available port
    port: 0,
    workspace,
  });
  expect(server.listening).toBeTruthy();
  server.close();
});
