import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { mockChildProcess, mockReadable, mockWritable } from './child_process';
import { getTestRunner } from './test_runner';

test('mockReadable', async () => {
  const { fn } = await getTestRunner();
  const onReadable = fn();
  const onData = fn();
  const onEnd = fn();
  const readable = (await mockReadable())
    .on('readable', onReadable)
    .on('data', onData)
    .on('end', onEnd);

  expect(onReadable).not.toHaveBeenCalled();
  expect(onData).not.toHaveBeenCalled();
  expect(onEnd).not.toHaveBeenCalled();

  readable.append('abcd');
  expect(onReadable).toHaveBeenCalledTimes(1);
  expect(onData).toHaveBeenNthCalledWith(1, 'abcd');
  expect(onEnd).not.toHaveBeenCalled();
  expect(readable.read(1)).toEqual('a');
  expect(readable.read(1)).toEqual('b');
  expect(readable.read()).toEqual('cd');
  expect(readable.read()).toBeUndefined();

  expect(readable.isPaused()).toEqual(false);
  readable.pause();
  expect(readable.isPaused()).toEqual(true);

  readable.append('efgh');
  expect(onReadable).toHaveBeenCalledTimes(1);
  expect(onData).toHaveBeenCalledTimes(1);
  expect(onEnd).not.toHaveBeenCalled();
  readable.resume();
  expect(onReadable).toHaveBeenCalledTimes(2);
  expect(onData).toHaveBeenNthCalledWith(2, 'efgh');
  expect(onEnd).not.toHaveBeenCalled();
  readable.append('ijkl');
  expect(onData).toHaveBeenNthCalledWith(3, 'ijkl');
  expect(readable.read(5)).toEqual('efghi');
  expect(readable.read(100)).toEqual('jkl');

  readable.end();
  expect(onEnd).toHaveBeenCalledTimes(1);
});

test('mockWritable', async () => {
  const { fn } = await getTestRunner();
  const writable = await mockWritable();
  expect(writable.toBuffer()).toEqual(Buffer.of());
  expect(writable.toString()).toEqual('');

  writable.write(Buffer.of(1, 2, 3));
  expect(writable.toBuffer()).toEqual(Buffer.of(1, 2, 3));
  expect(writable.toString()).toEqual('\x01\x02\x03'); // mirrors `Buffer.of(1, 2, 3)`

  writable.write('hi!', 'ascii');
  expect(writable.toBuffer()).toEqual(Buffer.of(1, 2, 3, 104, 105, 33));
  expect(writable.toString()).toEqual('\x01\x02\x03hi!'); // mirrors `Buffer.of(1, 2, 3, 104, 105, 33)`

  {
    const writeCallback = fn();
    writable.write('', 'utf-8', writeCallback);
    await new Promise((resolve) => {
      process.nextTick(resolve);
    });
    expect(writeCallback).toHaveBeenCalledWith();
  }

  {
    const writeCallback = fn();
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

  const endCallback = fn();
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

test('mockChildProcess', async () => {
  const { fn } = await getTestRunner();
  const child = await mockChildProcess();

  expect(typeof child.pid).toEqual('number');
  child.stdin.write('hello child!\n');

  const onExit = fn();
  child.on('exit', onExit);
  child.emit('exit');
  expect(onExit).toHaveBeenCalled();
});
