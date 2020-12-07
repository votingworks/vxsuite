import Store from '../store'
import { ensureDir } from 'fs-extra'
import { join } from 'path'

export interface Workspace {
  readonly path: string
  readonly ballotImagesPath: string
  readonly store: Store
}

export async function createWorkspace(root: string): Promise<Workspace> {
  const ballotImagesPath = join(root, 'ballot-images')
  const dbPath = join(root, 'ballots.db')
  await ensureDir(ballotImagesPath)

  return {
    path: root,
    ballotImagesPath,
    store: await Store.fileStore(dbPath),
  }
}
