import { parseOptions } from './options'

test('returns defaults given no arguments', () => {
  expect(parseOptions([])).toEqual({ imagePaths: [], scale: 1 })
})

test('--min-length N', () => {
  expect(parseOptions(['--min-length', '100'])).toEqual(
    expect.objectContaining({ minLength: 100 })
  )
})

test('--min-length N%w', () => {
  expect(parseOptions(['--min-length', '10%w'])).toEqual(
    expect.objectContaining({ minLength: { width: 10 } })
  )
})

test('--min-length N%h', () => {
  expect(parseOptions(['--min-length', '10%h'])).toEqual(
    expect.objectContaining({ minLength: { height: 10 } })
  )
})

test('--min-length error', () => {
  expect(() => parseOptions(['--min-length', 'gibberish'])).toThrowError(
    'invalid format for --min-length: gibberish'
  )
})

test('--scale N', () => {
  expect(parseOptions(['--scale', '0.8'])).toEqual(
    expect.objectContaining({ scale: 0.8 })
  )
})

test('--scale N%', () => {
  expect(parseOptions(['--scale', '80%'])).toEqual(
    expect.objectContaining({ scale: 0.8 })
  )
})

test('--scale error', () => {
  expect(() => parseOptions(['--scale', 'gibberish'])).toThrowError(
    'invalid format for --scale: gibberish'
  )
})

test('--size WxH', () => {
  expect(parseOptions(['--size', '100x200'])).toEqual(
    expect.objectContaining({ size: { width: 100, height: 200 } })
  )
})

test('--size error', () => {
  expect(() => parseOptions(['--size', 'gibberish'])).toThrowError(
    `invalid size 'gibberish', expected 'WxH'`
  )
})

test('--bad-option', () => {
  expect(() => parseOptions(['--bad-option'])).toThrowError(
    `unexpected option '--bad-option'`
  )
})

test('collects non-options as image paths', () => {
  expect(parseOptions(['a', 'b', 'c'])).toEqual(
    expect.objectContaining({
      imagePaths: ['a', 'b', 'c'],
    })
  )
})
