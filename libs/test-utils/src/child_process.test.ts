import { Buffer } from 'buffer';
import { fakeChildProcess, fakeReadable, fakeWritable } from './child_process';

test('fakeReadable', () => {
  const onReadable = jest.fn();
  const onData = jest.fn();
  const onEnd = jest.fn();
  const readable = fakeReadable()
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

  expect(readable.isPaused()).toBe(false);
  readable.pause();
  expect(readable.isPaused()).toBe(true);

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

test('fakeWritable', async () => {
  const writable = fakeWritable();
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

test('fakeChildProcess', () => {
  const child = fakeChildProcess();

  expect(typeof child.pid).toBe('number');
  child.stdin.write('hello child!\n');

  const onExit = jest.fn();
  child.on('exit', onExit);
  child.emit('exit');
  expect(onExit).toHaveBeenCalled();
});
