import { ensureDir } from 'fs-extra'
import { join, resolve } from 'path'
import Store from '../store'

export interface Workspace {
  readonly path: string
  readonly ballotImagesPath: string
  readonly store: Store
}

export async function createWorkspace(root: string): Promise<Workspace> {
  const resolvedRoot = resolve(root)
  const ballotImagesPath = join(resolvedRoot, 'ballot-images')
  const dbPath = join(resolvedRoot, 'ballots.db')
  await ensureDir(ballotImagesPath)

  return {
    ballotImagesPath,
    path: resolvedRoot,
    store: await Store.fileStore(dbPath),
  }
}
