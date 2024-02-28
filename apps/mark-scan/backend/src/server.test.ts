import { LogEventId, fakeLogger } from '@votingworks/logging';
import tmp from 'tmp';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { MockPaperHandlerDriver } from '@votingworks/custom-paper-handler';
import { PORT } from './globals';
import { resolveDriver, start } from './server';
import { createWorkspace } from './util/workspace';

const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

afterEach(() => {
  jest.resetAllMocks();
});

test('can start server', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const logger = fakeLogger();
  const workspace = createWorkspace(tmp.dirSync().name);

  const server = await start({
    auth,
    logger,
    port: PORT,
    workspace,
  });
  expect(server.listening).toBeTruthy();
  server.close();
  workspace.reset();
});

test('resolveDriver returns a mock driver if feature flag is on', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_PAPER_HANDLER_HARDWARE_CHECK
  );
  const logger = fakeLogger();

  const driver = await resolveDriver(logger);
  expect(driver).toBeInstanceOf(MockPaperHandlerDriver);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PaperHandlerConnection,
    'system',
    {
      disposition: 'failure',
    }
  );
});

// Something about the feature flag mock (?) makes these tests not terminate cleanly

// test('can start without providing auth', async () => {
//   const logger = fakeLogger();
//   const workspace = createWorkspace(tmp.dirSync().name);

//   const server = await start({
//     logger,
//     port: PORT,
//     workspace,
//   });
//   expect(server.listening).toBeTruthy();
//   server.close();
//   workspace.reset();
// });

// test('can start with a mock driver', async () => {
//   featureFlagMock.enableFeatureFlag(
//     BooleanEnvironmentVariableName.SKIP_PAPER_HANDLER_HARDWARE_CHECK
//   );

//   const auth = buildMockInsertedSmartCardAuth();
//   const logger = fakeLogger();
//   const workspace = createWorkspace(tmp.dirSync().name);

//   const server = await start({
//     auth,
//     logger,
//     port: PORT,
//     workspace,
//   });
//   expect(server.listening).toBeTruthy();
//   server.close((err) => {
//     assert(!err);
//   });
//   workspace.reset();
//   // Promises in flight won't complete without this sleep and the test will error with
//   // "ReferenceError: You are trying to `import` a file after the Jest environment has been torn down."
//   // Other methods of flushing promises don't seem to work.
//   // await sleep(0);
// });
