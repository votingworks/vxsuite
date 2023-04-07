import { dirSync } from 'tmp';
import { createWorkspace } from './workspace';

test('workspace.reset rests the store', () => {
  const workspace = createWorkspace(dirSync().name);
  const fn = jest.fn();
  workspace.store.reset = fn;
  workspace.reset();
  expect(fn).toHaveBeenCalledTimes(1);
});
