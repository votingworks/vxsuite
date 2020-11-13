import { adjacentFile } from '../../utils/path'

test('adjacentFile with no directory', () => {
  expect(adjacentFile('-rotated', 'an-image.png')).toEqual(
    'an-image-rotated.png'
  )
})

test('adjacentFile with a directory', () => {
  expect(adjacentFile('-rotated', '/path/to/an-image.png')).toEqual(
    '/path/to/an-image-rotated.png'
  )
})

test('adjacentFile with a relative directory', () => {
  expect(adjacentFile('-rotated', 'path/to/an-image.png')).toEqual(
    'path/to/an-image-rotated.png'
  )
})

test('adjacentFile with no suffix', () => {
  expect(adjacentFile('', 'path/to/an-image.png')).toEqual(
    'path/to/an-image.png'
  )
})
