import { assert, err, ok } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { literal } from './literal_coder';
import { message } from './message_coder';
import { unboundedString } from './unbounded_string_coder';
import { uint8 } from './uint8_coder';
import { Uint8 } from './types';

test('unbounded string', () => {
  const coder = unboundedString();
  expect(coder.default()).toEqual('');
  expect(coder.bitLength('hello')).toEqual(5 * 8);
  expect(coder.encode('hello')).toEqual(ok(Buffer.from('hello')));
  expect(coder.decode(Buffer.from('hello'))).toEqual(ok('hello'));
});

test('unbounded string inside a message', () => {
  const m = message({ header: literal('CDAT'), data: unboundedString() });
  expect(m.default()).toEqual({ data: '' });
  expect(m.bitLength({ data: 'hello' })).toEqual(32 + 5 * 8);
  expect(m.encode({ data: 'hello' })).toEqual(ok(Buffer.from('CDAThello')));
  expect(m.decode(Buffer.from('CDAThello'))).toEqual(ok({ data: 'hello' }));
});

test('unbounded string with too small buffer', () => {
  const coder = unboundedString();
  expect(coder.encodeInto('hello', Buffer.alloc(4), 0)).toEqual(
    err('SmallBuffer')
  );
  expect(coder.decodeFrom(Buffer.alloc(4), 40)).toEqual(err('SmallBuffer'));
});

/**
 * Utilities for printing bits copied from paper-handler
 */
type BinaryStringRepresentation = '0' | '1';
type BinaryArray = [
  BinaryStringRepresentation,
  BinaryStringRepresentation,
  BinaryStringRepresentation,
  BinaryStringRepresentation,
  BinaryStringRepresentation,
  BinaryStringRepresentation,
  BinaryStringRepresentation,
  BinaryStringRepresentation
];
function getZeroBinaryArray(): BinaryArray {
  return ['0', '0', '0', '0', '0', '0', '0', '0'];
}
const Uint8MostSignificantBitMask: Uint8 = 128;
const Uint8Size = 8;

function Uint8ToBinaryArray(value: Uint8): BinaryArray {
  let shiftingValue: number = value;

  const bitArray = getZeroBinaryArray();
  for (let i = 0; i < Uint8Size; i += 1) {
    const booleanValue = shiftingValue & Uint8MostSignificantBitMask;
    bitArray[i] = booleanValue ? '1' : '0';
    shiftingValue <<= 1;
  }
  return bitArray;
}

/*
function printBits(bitString: string) {
  const textEncoder = new TextEncoder();
  const stsData = new DataView(textEncoder.encode(bitString).buffer);
  for (let i = 0; i < stsData.byteLength; i += 1) {
    const byte: Uint8 = stsData.getUint8(i);
    const bits = Uint8ToBinaryArray(byte);
    console.log(`Byte ${i} = ${bits}`);
  }
}
*/

const RealTimeExchangeResponse = message({
  stringData: unboundedString(),
});

test('unbounded string decodes 0x7f', () => {
  // Decode from buffer to JS object
  const buf = Buffer.from([0x7f]);
  const result = RealTimeExchangeResponse.decode(buf);

  assert(result.isOk());
  const data = result.ok();

  // Data is a string but we want a DataView to later apply a bitmask
  const textEncoder = new TextEncoder();
  const bits = new DataView(textEncoder.encode(data.stringData).buffer);
  const firstByteOfDecodedData = bits.getUint8(0);
  expect(firstByteOfDecodedData).toEqual(0x7f);
  expect(bits.byteLength).toEqual(1);
});

test('unbounded string decodes 0x80', () => {
  const buf = Buffer.from([0x80]);
  const result = RealTimeExchangeResponse.decode(buf);

  assert(result.isOk());
  const data = result.ok();

  const textEncoder = new TextEncoder();
  const bits = new DataView(textEncoder.encode(data.stringData).buffer);
  const firstByteOfDecodedData = bits.getUint8(0);
  expect(firstByteOfDecodedData).toEqual(0x80);
  // Comment out the above `expect` to observe `bits` is 3 bytes long
  expect(bits.byteLength).toEqual(1);
});
