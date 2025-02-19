import { afterEach, expect, test, vi } from 'vitest';
import { LogEventId, mockBaseLogger, mockLogger } from '@votingworks/logging';
import tmp from 'tmp';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { MockPaperHandlerDriver } from '@votingworks/custom-paper-handler';
import { initializeSystemAudio, testDetectDevices } from '@votingworks/backend';
import { resolveDriver, start } from './server';
import { createWorkspace } from './util/workspace';

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  initializeSystemAudio: vi.fn<() => Promise<void>>(),
}));

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('can start server', async () => {
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = mockLogger({ fn: vi.fn });
  const workspace = createWorkspace(
    tmp.dirSync().name,
    mockBaseLogger({ fn: vi.fn })
  );

  const server = await start({
    auth,
    logger,
    // pick an available port
    port: 0,
    workspace,
  });
  expect(server.listening).toBeTruthy();
  expect(vi.mocked(initializeSystemAudio)).toHaveBeenCalled();
  server.close();
  workspace.reset();
});

test('can start without providing auth', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_CARDS
  );

  const logger = mockLogger({ fn: vi.fn });
  const workspace = createWorkspace(
    tmp.dirSync().name,
    mockBaseLogger({ fn: vi.fn })
  );

  const server = await start({
    logger,
    // pick an available port
    port: 0,
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
  const logger = mockLogger({ fn: vi.fn });
  const workspace = createWorkspace(
    tmp.dirSync().name,
    mockBaseLogger({ fn: vi.fn })
  );

  const server = await start({
    logger,
    // pick an available port
    port: 0,
    workspace,
  });

  testDetectDevices(logger, expect);

  server.close();
  workspace.reset();
});

test('resolveDriver returns a mock driver if feature flag is on', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PAPER_HANDLER
  );
  const logger = mockLogger({ fn: vi.fn });

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
