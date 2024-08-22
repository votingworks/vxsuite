import { dirSync } from 'tmp';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace } from './workspace';

test('workspace.reset rests the store', () => {
  const workspace = createWorkspace(dirSync().name, mockBaseLogger());
  const fn = jest.fn();
  workspace.store.reset = fn;
  workspace.reset();
  expect(fn).toHaveBeenCalledTimes(1);
});
