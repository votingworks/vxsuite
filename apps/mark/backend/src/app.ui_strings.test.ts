import tmp from 'tmp';

import { createMockUsb, runUiStringApiTests } from '@votingworks/backend';
import { fakeLogger } from '@votingworks/logging';

import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { Store } from './store';
import { createWorkspace } from './util/workspace';
import { buildApi } from './app';

const store = Store.memoryStore();
const workspace = createWorkspace(tmp.dirSync().name, { store });

runUiStringApiTests({
  api: buildApi(
    buildMockInsertedSmartCardAuth(),
    createMockUsb().mock,
    fakeLogger(),
    workspace
  ),
  store: store.getUiStringsStore(),
});
