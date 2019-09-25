import { CustomEncoding } from './encoding'

test('cannot create a custom encoding with more characters than would allow an 8-bit index', () => {
  expect(() => {
    new CustomEncoding('a'.repeat(257))
  }).toThrowError('character set too large, has 257 but only 256 are allowed')
})

test('cannot create a custom encoding with duplicate characters', () => {
  expect(() => {
    new CustomEncoding('aba')
  }).toThrowError(
    'duplicate character found in character set:\n- set: "aba"\n- duplicates: 0 & 2'
  )
})

test('cannot encode a string containing characters not in a custom encoding', () => {
  const encoding = new CustomEncoding('abc')
  expect(() => encoding.encode('d')).toThrowError(
    'cannot encode unrepresentable character: "d" (allowed: "abc")'
  )
})

test('cannot decode a string when the character codes are out of bounds', () => {
  const encoding = new CustomEncoding('abc')
  expect(() => encoding.decode(Uint8Array.of(3))).toThrowError(
    'character code out of bounds at index 0: 3'
  )
})
