import { readFileSync, writeFileSync } from 'fs-extra'
import { join } from 'path'
import { fileSync } from 'tmp'
import LoopScanner, { parseBatchesFromEnv } from './LoopScanner'

function readFiles(paths: readonly string[]): string[] {
  return paths.map((path) => readFileSync(path, 'utf8'))
}

test('copies files in pairs', async () => {
  const [f1, f2, f3, f4] = new Array(4).fill(null).map((_, i) => {
    const path = fileSync().name
    writeFileSync(path, i + 1, 'utf8')
    return path
  })
  const scanner = new LoopScanner([[[f1, f2]], [[f3, f4]]])

  expect(readFiles((await scanner.scanSheets().next()).value)).toEqual([
    '1',
    '2',
  ])
  expect(readFiles((await scanner.scanSheets().next()).value)).toEqual([
    '3',
    '4',
  ])
  expect(readFiles((await scanner.scanSheets().next()).value)).toEqual([
    '1',
    '2',
  ])
})

test('parses an inline manifest from an environment variable', () => {
  expect(parseBatchesFromEnv('01.png,02.png,03.png,04.png')).toEqual([
    [
      ['01.png', '02.png'],
      ['03.png', '04.png'],
    ],
  ])
})

test('interprets relative file paths in a manifest file as relative to the file', () => {
  const manifestPath = fileSync().name
  writeFileSync(manifestPath, '01.png\n02.png\n03.png\n04.png', 'utf8')
  expect(parseBatchesFromEnv(`@${manifestPath}`)).toEqual([
    [
      [join(manifestPath, '..', '01.png'), join(manifestPath, '..', '02.png')],
      [join(manifestPath, '..', '03.png'), join(manifestPath, '..', '04.png')],
    ],
  ])
})

test('preserves absolute paths in a manifest file', () => {
  const manifestPath = fileSync().name
  writeFileSync(manifestPath, '/01.png\n/02.png\n/03.png\n/04.png', 'utf8')
  expect(parseBatchesFromEnv(`@${manifestPath}`)).toEqual([
    [
      ['/01.png', '/02.png'],
      ['/03.png', '/04.png'],
    ],
  ])
})

test('interprets multiple path separators in a row as a batch separator', () => {
  expect(parseBatchesFromEnv('01.png,02.png,,,03.png,04.png')).toEqual([
    [['01.png', '02.png']],
    [['03.png', '04.png']],
  ])
})
