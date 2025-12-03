import { expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { initializeSystemAudio } from '@votingworks/backend';
import { start } from './server';
import { createWorkspace } from './util/workspace';

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  initializeSystemAudio: vi.fn(),
}));

test('can start server', () => {
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const baseLogger = mockBaseLogger({ fn: vi.fn });
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );

  const server = start({
    auth,
    baseLogger,
    // pick an available port
    port: 0,
    workspace,
  });
  expect(server.listening).toBeTruthy();
  expect(vi.mocked(initializeSystemAudio)).toHaveBeenCalled();
  server.close();
});
