import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { Auth0AuthClient } from './auth.js';
import { DEV_USER_ID } from './auth0_client.js';
import { TestStore } from '../test/test_store.js';
import { supportUser, vxOrganization } from '../test/mocks.js';

const request = {} as unknown as Express.Request;

const testStore = new TestStore(mockBaseLogger({ fn: vi.fn }));
const store = testStore.getStore();

beforeEach(async () => {
  await testStore.init();
});

afterAll(async () => {
  await testStore.cleanUp();
});

test('Auth0AuthClient loads the logged-in user from the database', async () => {
  await store.createOrganization(vxOrganization);
  await store.createUser(supportUser);
  const auth = new Auth0AuthClient(
    { userIdFromRequest: () => supportUser.id },
    store
  );

  expect(await auth.getUser(request)).toEqual(supportUser);
});

test('Auth0AuthClient returns no user when nobody is logged in', async () => {
  const auth = new Auth0AuthClient(
    { userIdFromRequest: () => undefined },
    store
  );

  expect(await auth.getUser(request)).toBeUndefined();
});

test('Auth0AuthClient returns no user for a user missing from the database', async () => {
  const auth = new Auth0AuthClient(
    { userIdFromRequest: () => DEV_USER_ID },
    store
  );

  expect(await auth.getUser(request)).toBeUndefined();
});
