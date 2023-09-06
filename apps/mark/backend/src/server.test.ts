import { fakeLogger } from '@votingworks/logging';
import tmp from 'tmp';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { PORT } from './globals';
import { start } from './server';
import { createWorkspace } from './util/workspace';

test('can start server', () => {
  const auth = buildMockInsertedSmartCardAuth();
  const logger = fakeLogger();
  const workspace = createWorkspace(tmp.dirSync().name);

  const server = start({
    auth,
    logger,
    port: PORT,
    workspace,
  });
  expect(server.listening).toBeTruthy();
  server.close();
});
