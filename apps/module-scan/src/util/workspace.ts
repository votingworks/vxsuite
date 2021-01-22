import Store from '../store'
import { ensureDir } from 'fs-extra'
import { join, resolve } from 'path'

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
    path: resolvedRoot,
    ballotImagesPath,
    store: await Store.fileStore(dbPath),
  }
}
