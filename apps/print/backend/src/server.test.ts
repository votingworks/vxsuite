import { expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import { start } from './server';
import { createWorkspace } from './util/workspace';

test('can start server', () => {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const baseLogger = mockBaseLogger({ fn: vi.fn });
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );

  const server = start({
    auth,
    baseLogger,
    workspace,
  });
  expect(server.listening).toBeTruthy();
  server.close();
});
