import { fakeKiosk } from '@votingworks/test-utils'
import DownloadableArchive from './DownloadableArchive'
import fakeFileWriter from '../../test/helpers/fakeFileWriter'

// https://en.wikipedia.org/wiki/List_of_file_signatures
const ZIP_MAGIC_BYTES = Buffer.of(0x50, 0x4b, 0x03, 0x04)
const EMPTY_ZIP_MAGIC_BYTES = Buffer.of(0x50, 0x4b, 0x05, 0x06)

test('file prompt fails', async () => {
  const kiosk = fakeKiosk()
  const archive = new DownloadableArchive(kiosk)

  kiosk.saveAs.mockResolvedValueOnce(undefined)
  await expect(archive.beginWithDialog()).rejects.toThrowError(
    'could not begin download; no file was chosen'
  )
})

test('direct file save fails', async () => {
  const kiosk = fakeKiosk()
  const archive = new DownloadableArchive(kiosk)
  kiosk.makeDirectory.mockResolvedValueOnce()

  await expect(
    archive.beginWithDirectSave('/path/to/folder', 'file.zip')
  ).rejects.toThrowError('could not begin download; an error occurred')
})

test('empty zip file when user is prompted for file location', async () => {
  const kiosk = fakeKiosk()
  const archive = new DownloadableArchive(kiosk)
  const fileWriter = fakeFileWriter()

  kiosk.saveAs.mockResolvedValueOnce(fileWriter)

  expect(fileWriter.chunks).toHaveLength(0)
  await archive.beginWithDialog()
  await archive.end()
  expect(fileWriter.chunks).not.toHaveLength(0)

  const firstChunk = fileWriter.chunks[0] as Buffer
  expect(firstChunk).toBeInstanceOf(Buffer)
  expect(firstChunk.slice(0, EMPTY_ZIP_MAGIC_BYTES.length)).toEqual(
    EMPTY_ZIP_MAGIC_BYTES
  )
})

test('empty zip file when file is saved directly and passes path to kiosk properly', async () => {
  const kiosk = fakeKiosk()
  const archive = new DownloadableArchive(kiosk)
  const fileWriter = fakeFileWriter()

  kiosk.makeDirectory.mockResolvedValueOnce()
  kiosk.writeFile = jest.fn().mockResolvedValueOnce(fileWriter)

  expect(fileWriter.chunks).toHaveLength(0)
  await archive.beginWithDirectSave('/path/to/folder', 'file.zip')
  await archive.end()
  expect(fileWriter.chunks).not.toHaveLength(0)
  expect(kiosk.makeDirectory).toHaveBeenCalledWith('/path/to/folder', {
    recursive: true,
  })
  expect(kiosk.writeFile).toHaveBeenCalledWith('/path/to/folder/file.zip')

  const firstChunk = fileWriter.chunks[0] as Buffer
  expect(firstChunk).toBeInstanceOf(Buffer)
  expect(firstChunk.slice(0, EMPTY_ZIP_MAGIC_BYTES.length)).toEqual(
    EMPTY_ZIP_MAGIC_BYTES
  )
})

test('zip file containing a file', async () => {
  const kiosk = fakeKiosk()
  const archive = new DownloadableArchive(kiosk)
  const fileWriter = fakeFileWriter()

  kiosk.saveAs.mockResolvedValueOnce(fileWriter)

  expect(fileWriter.chunks).toHaveLength(0)
  await archive.beginWithDialog()
  await archive.file('README', '# election-manager\n')
  await archive.end()
  expect(fileWriter.chunks).not.toHaveLength(0)

  const firstChunk = fileWriter.chunks[0] as Buffer
  expect(firstChunk).toBeInstanceOf(Buffer)
  expect(firstChunk.slice(0, ZIP_MAGIC_BYTES.length)).toEqual(ZIP_MAGIC_BYTES)
})

test('passes options to kiosk.saveAs', async () => {
  const kiosk = fakeKiosk()
  const archive = new DownloadableArchive(kiosk)
  const fileWriter = fakeFileWriter()

  kiosk.saveAs.mockResolvedValueOnce(fileWriter)

  expect(fileWriter.chunks).toHaveLength(0)
  await archive.beginWithDialog({ defaultPath: 'README.md' })
  expect(kiosk.saveAs).toHaveBeenCalledWith({ defaultPath: 'README.md' })
})

test('end() before begin()', async () => {
  const archive = new DownloadableArchive(fakeKiosk())
  await expect(archive.end()).rejects.toThrowError(
    'cannot call end() before begin()'
  )
})

test('file() before begin()', async () => {
  const archive = new DownloadableArchive(fakeKiosk())
  await expect(archive.file('file.txt', 'hi!')).rejects.toThrowError(
    'cannot call file() before begin()'
  )
})
