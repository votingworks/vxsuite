import BitWriter from './BitWriter'
import { CustomEncoding } from './encoding'

test('can write a bit', () => {
  expect(new BitWriter().writeUint1(1).toUint8Array()).toEqual(
    Uint8Array.of(0b10000000)
  )
})

test('can write a byte', () => {
  expect(new BitWriter().writeUint8(0b10101010).toUint8Array()).toEqual(
    Uint8Array.of(0b10101010)
  )
})

test('can write multiple bits', () => {
  expect(
    new BitWriter()
      .writeUint1(1)
      .writeUint1(0)
      .writeUint1(1)
      .toUint8Array()
  ).toEqual(Uint8Array.of(0b10100000))
})

test('can write multiple bytes', () => {
  expect(
    new BitWriter()
      .writeUint8(0b00010110)
      .writeUint8(0b11110000)
      .toUint8Array()
  ).toEqual(Uint8Array.of(0b00010110, 0b11110000))
})

test('writes a boolean by writing a bit', () => {
  expect(
    new BitWriter()
      .writeBoolean(true)
      .writeBoolean(false)
      .writeBoolean(true)
      .toUint8Array()
  ).toEqual(Uint8Array.of(0b10100000))
})

test('can write a non-aligned byte after writing a bit', () => {
  expect(
    new BitWriter()
      .writeUint1(1)
      .writeUint8(0b00001110)
      .toUint8Array()
  ).toEqual(Uint8Array.of(0b10000111, 0b00000000))
})

test('can write a utf-8 string', () => {
  expect(new BitWriter().writeString('abcdé').toUint8Array()).toEqual(
    Uint8Array.of(
      6,
      0b01100001,
      0b01100010,
      0b01100011,
      0b01100100,
      0b11000011,
      0b10101001
    )
  )
})

test('can write a utf-8 string without a preceding length', () => {
  expect(
    new BitWriter()
      .writeString('abcdé', { includeLength: false })
      .toUint8Array()
  ).toEqual(
    Uint8Array.of(
      0b01100001,
      0b01100010,
      0b01100011,
      0b01100100,
      0b11000011,
      0b10101001
    )
  )
})

test('can write a non-aligned utf-8 string after writing a bit', () => {
  expect(
    new BitWriter()
      .writeUint1(1)
      .writeString('abc')
      .toUint8Array()
  ).toEqual(
    Uint8Array.of(0b10000001, 0b10110000, 0b10110001, 0b00110001, 0b10000000)
  )
})

test('cannot write a uint with both `max` and `size` options', () => {
  expect(() => {
    const options = { max: 1, size: 2 } as { max: number }
    new BitWriter().writeUint(0, options)
  }).toThrowError("cannot specify both 'max' and 'size' options")
})

test('cannot write a uint greater than the `max` option', () => {
  expect(() => {
    new BitWriter().writeUint(1, { max: 0 })
  }).toThrowError('overflow: 1 must be less than 0')
})

test('cannot write a uint without `max` or `size`', () => {
  expect(() => {
    const options = {} as { max: number }
    new BitWriter().writeUint(1, options)
  }).toThrowError()
})

test('cannot write a uint that requires more bits than `size` option', () => {
  expect(() => {
    new BitWriter().writeUint(4, { size: 2 })
  }).toThrowError('overflow: 4 cannot fit in 2 bits')
})

test('can write a string with a custom character set', () => {
  const encoding = new CustomEncoding('abcdefghijklmnopqrstuvwxyz')
  expect(
    new BitWriter().writeString('abc', { encoding }).toUint8Array()
  ).toEqual(Uint8Array.of(0b00000011, 0b00000000, 0b01000100))
})

test('fails to write a string that is longer than the maximum length', () => {
  expect(() => new BitWriter().writeString('a', { maxLength: 0 })).toThrowError(
    'overflow: cannot write a string longer than max length: 1 > 0'
  )
})

test('has a debug method to help understanding the contents', () => {
  jest.spyOn(console, 'log').mockImplementation()

  new BitWriter()
    .writeBoolean(true)
    .debug('wrote true')
    .writeBoolean(false)
    .debug('wrote false')
    .writeUint8(1, 2, 3)
    .debug()

  /* eslint-disable no-console */
  expect(console.log).toHaveBeenNthCalledWith(1, 'wrote true')
  expect(console.log).toHaveBeenNthCalledWith(2, '1')
  expect(console.log).toHaveBeenNthCalledWith(3, 'wrote false')
  expect(console.log).toHaveBeenNthCalledWith(4, '10')
  expect(console.log).toHaveBeenNthCalledWith(
    5,
    '10000000 01000000 10000000 11'
  )
  /* eslint-enable no-console */
})
