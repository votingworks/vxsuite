import { readFileSync, writeFileSync } from 'fs-extra'
import { fileSync } from 'tmp'
import LoopScanner from './LoopScanner'

function readFiles(paths: readonly string[]): string[] {
  return paths.map((path) => readFileSync(path, 'utf8'))
}

test('copies files in pairs', async () => {
  const [f1, f2, f3, f4] = new Array(4).fill(null).map((_, i) => {
    const path = fileSync().name
    writeFileSync(path, i + 1, 'utf8')
    return path
  })
  const scanner = new LoopScanner([f1, f2, f3, f4])

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
