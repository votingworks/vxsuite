import { promises as fs } from 'fs'
import * as tmp from 'tmp'

import { MemoryBlobs, FileSystemBlobs } from './blobs'

test('memory blobs just store data in memory', async () => {
  const blobs = new MemoryBlobs()

  expect(await blobs.get('thing')).toBeUndefined()

  await blobs.set('thing', Buffer.of(1, 2, 3))
  expect(await blobs.get('thing')).toEqual(Buffer.of(1, 2, 3))

  await blobs.delete('thing')
  expect(await blobs.get('thing')).toBeUndefined()
})

test('file system blobs store data in files on disk', async () => {
  const root = tmp.dirSync().name
  const blobs = new FileSystemBlobs(root)

  expect(await fs.readdir(root)).toEqual([])
  expect(await blobs.get('thing')).toBeUndefined()

  await blobs.set('thing', Buffer.of(1, 2, 3))
  expect(await fs.readdir(root)).toEqual(['thing'])
  expect(await blobs.get('thing')).toEqual(Buffer.of(1, 2, 3))

  await blobs.delete('thing')
  expect(await fs.readdir(root)).toEqual([])
  expect(await blobs.get('thing')).toBeUndefined()
})
