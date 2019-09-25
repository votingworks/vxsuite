import { BitReader, BitWriter, CustomEncoding } from '.'

test('can round-trip a bit', () => {
  expect(
    new BitReader(new BitWriter().writeUint1(1).toUint8Array()).readUint1()
  ).toEqual(1)
})

test('can round-trip a byte', () => {
  expect(
    new BitReader(new BitWriter().writeUint8(127).toUint8Array()).readUint8()
  ).toEqual(127)
})

test('can round-trip a utf-8 string', () => {
  expect(
    new BitReader(
      new BitWriter().writeString('abcdé').toUint8Array()
    ).readString()
  ).toEqual('abcdé')
})

test('can round-trip a utf-8 emoji string', () => {
  expect(
    new BitReader(
      new BitWriter().writeString('✓ 😊').toUint8Array()
    ).readString()
  ).toEqual('✓ 😊')
})

test('can round-trip a non-aligned utf-8 emoji string', () => {
  const reader = new BitReader(
    new BitWriter()
      .writeUint1(0)
      .writeString('🌈')
      .toUint8Array()
  )

  expect(reader.readUint1()).toEqual(0)
  expect(reader.readString()).toEqual('🌈')
})

test('can round-trip a string with a custom encoding', () => {
  const encoding = new CustomEncoding('0123456789')
  const reader = new BitReader(
    new BitWriter().writeString('19', { encoding }).toUint8Array()
  )

  expect(reader.readString({ encoding })).toEqual('19')
})

test('can round-trip a string with a custom maximum length', () => {
  expect(
    new BitReader(
      new BitWriter().writeString('a', { maxLength: 2 }).toUint8Array()
    ).readString({ maxLength: 2 })
  ).toEqual('a')
})
