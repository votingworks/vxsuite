import * as fs from 'fs-extra'
import * as path from 'path'
import * as tmp from 'tmp'
import type { Options } from '../importer'

export interface TemporaryBallotImportImageDirectories {
  paths: Pick<Options, 'scannedImagesPath' | 'importedImagesPath'>
  remove(): void
}

export default function makeTemporaryBallotImportImageDirectories(): TemporaryBallotImportImageDirectories {
  const root = tmp.dirSync({ tmpdir: path.join(__dirname, '../../tmp') })
  return {
    paths: {
      scannedImagesPath: path.join(root.name, 'to-import'),
      importedImagesPath: path.join(root.name, 'imported'),
    },
    remove: (): void => fs.removeSync(root.name),
  }
}
