import { Buffer } from 'node:buffer';
import { mockWritable } from './mock_writable';

test('mockWritable', async () => {
  const writable = mockWritable();
  expect(writable.toBuffer()).toEqual(Buffer.of());
  expect(writable.toString()).toEqual('');

  writable.write(Buffer.of(1, 2, 3));
  expect(writable.toBuffer()).toEqual(Buffer.of(1, 2, 3));
  expect(writable.toString()).toEqual('\x01\x02\x03'); // mirrors `Buffer.of(1, 2, 3)`

  writable.write('hi!', 'ascii');
  expect(writable.toBuffer()).toEqual(Buffer.of(1, 2, 3, 104, 105, 33));
  expect(writable.toString()).toEqual('\x01\x02\x03hi!'); // mirrors `Buffer.of(1, 2, 3, 104, 105, 33)`

  {
    const writeCallback = jest.fn();
    writable.write('', 'utf-8', writeCallback);
    await new Promise((resolve) => {
      process.nextTick(resolve);
    });
    expect(writeCallback).toHaveBeenCalledWith();
  }

  {
    const writeCallback = jest.fn();
    writable.write('', writeCallback);
    await new Promise((resolve) => {
      process.nextTick(resolve);
    });
    expect(writeCallback).toHaveBeenCalledWith();
  }

  // @ts-expect-error - testing invalid argument type
  expect(() => writable.write('', 88)).toThrowError(
    'encoding expected to be a string'
  );

  const endCallback = jest.fn();
  writable.end(endCallback);
  await new Promise((resolve) => {
    process.nextTick(resolve);
  });
  expect(endCallback).toHaveBeenCalledWith();

  expect(writable.writes).toEqual([
    { chunk: Buffer.of(1, 2, 3), encoding: undefined },
    { chunk: 'hi!', encoding: 'ascii' },
    { chunk: '', encoding: 'utf-8' },
    { chunk: '', encoding: undefined },
  ]);
});
