import tmp from 'tmp';

import { runUiStringApiTests } from '@votingworks/backend';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { fakeLogger } from '@votingworks/logging';
import { createMockUsbDrive } from '@votingworks/usb-drive';

import { Store } from './store';
import { buildApi } from './app';
import { createWorkspace } from './util/workspace';

const store = Store.memoryStore();
const workspace = createWorkspace(tmp.dirSync().name, { store });
const mockUsbDrive = createMockUsbDrive();

afterAll(() => {
  workspace.reset();
});

runUiStringApiTests({
  api: buildApi(
    buildMockInsertedSmartCardAuth(),
    {
      accept: jest.fn(),
      return: jest.fn(),
      scan: jest.fn(),
      status: jest.fn(),
      supportsUltrasonic: jest.fn(),
    },
    workspace,
    mockUsbDrive.usbDrive,
    fakeLogger()
  ),
  store: store.getUiStringsStore(),
});
