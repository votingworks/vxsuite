import { mockBaseLogger } from '@votingworks/logging';
import tmp from 'tmp';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { mockOf } from '@votingworks/test-utils';
import { initializeSystemAudio } from '@votingworks/backend';
import { PORT } from './globals';
import { start } from './server';
import { createWorkspace } from './util/workspace';

jest.mock(
  '@votingworks/backend',
  (): typeof import('@votingworks/backend') => ({
    ...jest.requireActual('@votingworks/backend'),
    initializeSystemAudio: jest.fn(),
  })
);

test('can start server', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const baseLogger = mockBaseLogger({ fn: jest.fn });
  const workspace = createWorkspace(
    tmp.dirSync().name,
    mockBaseLogger({ fn: jest.fn })
  );

  const server = await start({
    auth,
    baseLogger,
    port: PORT,
    workspace,
  });
  expect(server.listening).toBeTruthy();
  expect(mockOf(initializeSystemAudio)).toHaveBeenCalled();
  server.close();
});
