import { toUint8, sizeof, makeMasks } from './utils'

test('can make 0 masks', () => {
  expect(makeMasks(0)).toEqual([])
})

test('can make 1 mask', () => {
  expect(makeMasks(1)).toEqual([0b1])
})

test('can make 2 masks', () => {
  expect(makeMasks(2)).toEqual([0b10, 0b1])
})

test('can make 3 masks', () => {
  expect(makeMasks(3)).toEqual([0b100, 0b010, 0b001])
})

test('can type in-range numbers as uint8', () => {
  expect(toUint8(0)).toBe(0)
  expect(toUint8(1)).toBe(1)
  expect(toUint8(0xff)).toBe(0xff)
})

test('cannot convert out-of-range values to uint8', () => {
  expect(() => toUint8(-1)).toThrowError('cannot convert number to Uint8: -1')
  expect(() => toUint8(256)).toThrowError('cannot convert number to Uint8: 256')
  expect(() => toUint8(1.2)).toThrowError('cannot convert number to Uint8: 1.2')
})

test('can get the size of positive integers', () => {
  expect(sizeof(0b0)).toBe(1)
  expect(sizeof(0b1)).toBe(1)
  expect(sizeof(0b10)).toBe(2)
  expect(sizeof(0b11)).toBe(2)
  expect(sizeof(0b100)).toBe(3)

  expect(sizeof(0xff)).toBe(8)
  expect(sizeof(0x101)).toBe(9)

  expect(sizeof(parseInt('1'.repeat(31), 2))).toBe(31)
})

test('cannot get the size of a negative or non-integer number', () => {
  expect(() => sizeof(-1)).toThrowError(
    'cannot get size of negative or non-integer: -1'
  )
  expect(() => sizeof(1.1)).toThrowError(
    'cannot get size of negative or non-integer: 1.1'
  )
})
