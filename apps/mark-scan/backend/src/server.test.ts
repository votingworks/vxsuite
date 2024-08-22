import { LogEventId, mockBaseLogger, mockLogger } from '@votingworks/logging';
import tmp from 'tmp';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { MockPaperHandlerDriver } from '@votingworks/custom-paper-handler';
import { initializeSystemAudio, testDetectDevices } from '@votingworks/backend';
import { mockOf } from '@votingworks/test-utils';
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

jest.mock('@votingworks/backend', (): typeof import('@votingworks/backend') => {
  return {
    ...jest.requireActual('@votingworks/backend'),
    initializeSystemAudio: jest.fn(),
  };
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('can start server', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const logger = mockLogger();
  const workspace = createWorkspace(tmp.dirSync().name, mockBaseLogger());

  const server = await start({
    auth,
    logger,
    port: PORT,
    workspace,
  });
  expect(server.listening).toBeTruthy();
  expect(mockOf(initializeSystemAudio)).toHaveBeenCalled();
  server.close();
  workspace.reset();
});

test('can start without providing auth', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_CARDS
  );

  const logger = mockLogger();
  const workspace = createWorkspace(tmp.dirSync().name, mockBaseLogger());

  const server = await start({
    logger,
    port: PORT,
    workspace,
  });
  expect(server.listening).toBeTruthy();
  server.close();
  workspace.reset();
});

test('logs device attach/un-attach events', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_CARDS
  );
  const logger = mockLogger();
  const workspace = createWorkspace(tmp.dirSync().name, mockBaseLogger());

  const server = await start({
    logger,
    port: PORT,
    workspace,
  });

  testDetectDevices(logger);

  server.close();
  workspace.reset();
});

test('resolveDriver returns a mock driver if feature flag is on', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PAPER_HANDLER
  );
  const logger = mockLogger();

  const driver = await resolveDriver(logger);
  expect(driver).toBeInstanceOf(MockPaperHandlerDriver);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PaperHandlerConnection,
    'system',
    {
      message: 'Starting server with mock paper handler',
    }
  );
});
