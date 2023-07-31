import { fakeLogger } from '@votingworks/logging';
import tmp from 'tmp';
import {
  buildMockArtifactAuthenticator,
  buildMockInsertedSmartCardAuth,
} from '@votingworks/auth';
import { PORT } from './globals';
import { start } from './server';
import { createWorkspace } from './util/workspace';
import { getMockStateMachine } from '../test/app_helpers';

test('can start server', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const artifactAuthenticator = buildMockArtifactAuthenticator();
  const logger = fakeLogger();
  const workspace = createWorkspace(tmp.dirSync().name);
  const stateMachine = await getMockStateMachine(workspace);

  const server = start({
    auth,
    artifactAuthenticator,
    logger,
    port: PORT,
    workspace,
    stateMachine,
  });
  expect(server.listening).toBeTruthy();
  server.close();
  stateMachine.stopMachineService();
});
