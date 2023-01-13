import * as tmp from 'tmp';
import { createWorkspace } from './workspace';
import { Store } from '../store';

test('createWorkspace', () => {
  const dir = tmp.dirSync();
  const workspace = createWorkspace(dir.name);
  expect(workspace.path).toEqual(dir.name);
  expect(workspace.store).toBeInstanceOf(Store);
});
