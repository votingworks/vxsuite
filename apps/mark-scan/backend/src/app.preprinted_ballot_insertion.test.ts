import tmp from 'tmp';

import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import { typedAs } from '@votingworks/basics';
import { createSimpleRenderer } from '@votingworks/printing';

import { mockBaseLogger } from '@votingworks/logging';
import { Store } from './store';
import { createWorkspace } from './util/workspace';
import { buildApi } from './app';
import { buildMockLogger } from '../test/app_helpers';
import { PaperHandlerStateMachine } from './custom-paper-handler';

function getMockStateMachine() {
  return typedAs<Partial<PaperHandlerStateMachine>>({
    startSessionWithPreprintedBallot: jest.fn(),
    returnPreprintedBallot: jest.fn(),
  }) as unknown as jest.Mocked<PaperHandlerStateMachine>;
}

async function buildTestApi() {
  const store = Store.memoryStore();
  const workspace = createWorkspace(tmp.dirSync().name, mockBaseLogger(), {
    store,
  });
  const mockAuth = buildMockInsertedSmartCardAuth();
  const mockStateMachine = getMockStateMachine();
  const renderer = await createSimpleRenderer();

  const api = buildApi(
    mockAuth,
    createMockUsbDrive().usbDrive,
    buildMockLogger(mockAuth, workspace),
    workspace,
    renderer,
    mockStateMachine
  );

  return { api, mockStateMachine };
}

test('startSessionWithPreprintedBallot', async () => {
  const { api, mockStateMachine } = await buildTestApi();

  api.startSessionWithPreprintedBallot();
  expect(mockStateMachine.startSessionWithPreprintedBallot).toHaveBeenCalled();
});

test('returnPreprintedBallot', async () => {
  const { api, mockStateMachine } = await buildTestApi();

  api.returnPreprintedBallot();
  expect(mockStateMachine.returnPreprintedBallot).toHaveBeenCalled();
});
