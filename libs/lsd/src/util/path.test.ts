import { adjacentFile } from './path'

test('adjacentFile without new extension', () => {
  expect(adjacentFile('/path/to/file.png', '')).toEqual('/path/to/file.png')
})

test('adjacentFile with new extension', () => {
  expect(adjacentFile('/path/to/file.png', '', '.svg')).toEqual(
    '/path/to/file.svg'
  )
})

test('adjacentFile with suffix', () => {
  expect(adjacentFile('/path/to/file.png', '-lineart', '.svg')).toEqual(
    '/path/to/file-lineart.svg'
  )
})
