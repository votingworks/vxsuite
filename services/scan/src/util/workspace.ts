import { ensureDir } from 'fs-extra';
import { join, resolve } from 'path';
import { Store } from '../store';

export interface Workspace {
  readonly path: string;
  readonly ballotImagesPath: string;
  readonly plustekImagesPath?: string;
  readonly store: Store;
}

export async function createWorkspace(
  root: string,
  isPrecinctScanner = false
): Promise<Workspace> {
  const resolvedRoot = resolve(root);
  const ballotImagesPath = join(resolvedRoot, 'ballot-images');
  const dbPath = join(resolvedRoot, 'ballots.db');
  await ensureDir(ballotImagesPath);
  if (isPrecinctScanner) {
    const plustekImagesPath = join(ballotImagesPath, 'plustek-images');
    await ensureDir(plustekImagesPath);
    return {
      path: resolvedRoot,
      ballotImagesPath,
      plustekImagesPath,
      store: Store.fileStore(dbPath),
    };
  }

  return {
    path: resolvedRoot,
    ballotImagesPath,
    store: Store.fileStore(dbPath),
  };
}
