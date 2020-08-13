import { promises as fs } from 'fs'
import LoopScanner from './LoopScanner'

jest.mock('fs', () => ({
  promises: { copyFile: jest.fn() },
}))

test('copies files in turn to the destination directory', async () => {
  const scanner = new LoopScanner(['file1.jpg', 'file2.jpg'])

  await scanner.scanInto({ directory: '/tmp' })
  expect(fs.copyFile).toHaveBeenNthCalledWith(1, 'file1.jpg', '/tmp/1.jpg')
  await scanner.scanInto({ directory: '/tmp' })
  expect(fs.copyFile).toHaveBeenNthCalledWith(2, 'file2.jpg', '/tmp/2.jpg')
})

test('copies files with a named prefix if desired', async () => {
  const scanner = new LoopScanner(['file1.jpg', 'file2.jpg'])

  await scanner.scanInto({ directory: '/tmp', prefix: 'batch' })
  expect(fs.copyFile).toHaveBeenCalledWith('file1.jpg', '/tmp/batch-1.jpg')
})
