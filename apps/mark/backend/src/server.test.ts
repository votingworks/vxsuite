import { expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import tmp from 'tmp';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { initializeSystemAudio } from '@votingworks/backend';
import { start } from './server';
import { createWorkspace } from './util/workspace';

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  initializeSystemAudio: vi.fn(),
}));

test('can start server', async () => {
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const baseLogger = mockBaseLogger({ fn: vi.fn });
  const workspace = createWorkspace(
    tmp.dirSync().name,
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
  expect(vi.mocked(initializeSystemAudio)).toHaveBeenCalled();
  server.close();
});
