import { fakeLogger } from '@votingworks/logging';
import tmp from 'tmp';
import { PORT } from './globals';
import { start } from './server';
import { createWorkspace } from './util/workspace';

test('can start server', () => {
  const logger = fakeLogger();
  const workspace = createWorkspace(tmp.dirSync().name);

  const server = start({
    port: PORT,
    logger,
    workspace,
  });
  expect(server.listening).toBeTruthy();
  server.close();
});
