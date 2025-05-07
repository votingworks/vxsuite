import { Buffer } from 'node:buffer';
import { describe, expect, test } from 'vitest';
import { arrayBufferFrom } from './buffers';

function assertArrayBuffersEqual(a: ArrayBuffer, b: ArrayBuffer) {
  expect(new Uint8Array(a, 0, a.byteLength)).toEqual(
    new Uint8Array(b, 0, b.byteLength)
  );
}

describe('arrayBufferFrom', () => {
  test('empty array', () => {
    assertArrayBuffersEqual(arrayBufferFrom([]), new ArrayBuffer(0));
  });

  test('one byte', () => {
    const arrayBuffer = new ArrayBuffer(1);
    const view = new DataView(arrayBuffer);
    view.setUint8(0, 1);
    assertArrayBuffersEqual(arrayBufferFrom([1]), arrayBuffer);
  });

  test('multiple bytes', () => {
    const arrayBuffer = new ArrayBuffer(5);
    const view = new DataView(arrayBuffer);
    view.setUint32(0, 0xff_32);
    assertArrayBuffersEqual(
      arrayBufferFrom(Buffer.of(0x00, 0x00, 0xff, 0x32, 0x00)),
      arrayBuffer
    );
  });
});
