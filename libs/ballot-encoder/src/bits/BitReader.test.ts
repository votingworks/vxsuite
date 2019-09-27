import BitReader from './BitReader'

test('reads bits in little-endian order', () => {
  const reader = new BitReader(Uint8Array.of(0b11010000))
  expect(reader.readUint1()).toBe(1)
  expect(reader.readUint1()).toBe(1)
  expect(reader.readUint1()).toBe(0)
  expect(reader.readUint1()).toBe(1)
  expect(reader.readUint1()).toBe(0)
  expect(reader.readUint1()).toBe(0)
  expect(reader.readUint1()).toBe(0)
  expect(reader.readUint1()).toBe(0)
})

test('reads booleans as true iff the bit is set', () => {
  const reader = new BitReader(Uint8Array.of(0b10000000))
  expect(reader.readBoolean()).toBe(true)
  expect(reader.readBoolean()).toBe(false)
})

test('can read as long as there is data to read', () => {
  expect(new BitReader(Uint8Array.of()).canRead()).toBe(false)

  const reader = new BitReader(Uint8Array.of(0))
  expect(reader.canRead()).toBe(true)
  reader.readUint8()
  expect(reader.canRead()).toBe(false)
})

test('cannot read past the end', () => {
  expect(() => {
    new BitReader(Uint8Array.of()).readUint1()
  }).toThrowError(
    'end of buffer reached: byteOffset=0 bitOffset=0 data.length=0'
  )
})

test('can read uints with various options', () => {
  const bits = new BitReader(Uint8Array.of(0xff, 0x0f))

  expect(bits.readUint({ max: 0x0f })).toEqual(0x0f)
  expect(bits.readUint({ size: 8 })).toEqual(0xf0)
  expect(bits.readUint({ size: 4 })).toEqual(0x0f)
})

test('cannot read a uint specifying both `max` and `size` options', () => {
  expect(() => {
    // coerce TypeScript into allowing a bad `options` value
    const options = { max: 1, size: 2 } as { max: number }
    new BitReader(Uint8Array.of()).readUint(options)
  }).toThrowError("cannot specify both 'max' and 'size' options")
})

test('cannot read a uint with both `max` and `size` options undefined', () => {
  expect(() => {
    // coerce TypeScript into allowing a bad `options` value
    const options = {} as { max: number }
    new BitReader(Uint8Array.of()).readUint(options)
  }).toThrowError()
})

test('can skip given bits', () => {
  const bits = new BitReader(Uint8Array.of(0b10101010))

  expect(bits.skipUint1(1, 0)).toBe(true)
  expect(bits.skipUint1(1, 1)).toBe(false)
  expect(bits.skipUint1(1, 0)).toBe(true)
  expect(bits.skipUint1(0, 1)).toBe(false)
  expect(bits.skipUint1(1, 0, 1, 0, 0)).toBe(false)
})

test('can skip given bytes', () => {
  const bits = new BitReader(Uint8Array.of(1, 2, 3))

  expect(bits.skipUint8(1, 2)).toBe(true)
  expect(bits.skipUint8(4)).toBe(false)
  expect(bits.skipUint8(3)).toBe(true)
  expect(bits.canRead()).toBe(false)
})
