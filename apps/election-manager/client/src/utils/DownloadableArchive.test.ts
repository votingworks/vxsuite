import fakeKiosk from '../../test/helpers/fakeKiosk'
import DownloadableArchive from './DownloadableArchive'
import fakeFileWriter from '../../test/helpers/fakeFileWriter'

// https://en.wikipedia.org/wiki/List_of_file_signatures
const ZIP_MAGIC_BYTES = Buffer.of(0x50, 0x4b, 0x03, 0x04)
const EMPTY_ZIP_MAGIC_BYTES = Buffer.of(0x50, 0x4b, 0x05, 0x06)

test('file prompt fails', async () => {
  const kiosk = fakeKiosk()
  const archive = new DownloadableArchive(kiosk)

  kiosk.saveAs.mockResolvedValueOnce(undefined)
  await expect(archive.begin()).rejects.toThrowError(
    'could not begin download; no file was chosen'
  )
})

test('empty zip file', async () => {
  const kiosk = fakeKiosk()
  const archive = new DownloadableArchive(kiosk)
  const fileWriter = fakeFileWriter()

  kiosk.saveAs.mockResolvedValueOnce(fileWriter)

  expect(fileWriter.chunks).toHaveLength(0)
  await archive.begin()
  await archive.end()
  expect(fileWriter.chunks).not.toHaveLength(0)

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
  await archive.begin()
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
  await archive.begin({ defaultPath: 'README.md' })
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
