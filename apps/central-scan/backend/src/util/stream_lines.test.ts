import EventEmitter from 'node:events';
import { Readable } from 'node:stream';
import { StreamLines } from './stream_lines';

test('streams lines from an input stream', () => {
  const onLine = jest.fn();
  const read = jest.fn();
  const input = new EventEmitter() as Readable;
  input.read = read;

  new StreamLines(input).on('line', onLine);
  expect(onLine).not.toHaveBeenCalled();

  read.mockReturnValueOnce('abc');
  input.emit('readable');
  expect(onLine).not.toHaveBeenCalled();

  read.mockReturnValueOnce('def\n');
  input.emit('readable');
  expect(onLine).toHaveBeenNthCalledWith(1, 'abcdef\n');

  read.mockReturnValueOnce('Hello World!\nWelcome');
  input.emit('readable');
  expect(onLine).toHaveBeenNthCalledWith(2, 'Hello World!\n');

  read.mockReturnValueOnce(undefined);
  input.emit('readable');

  input.emit('close');
  expect(onLine).toHaveBeenNthCalledWith(3, 'Welcome');
});
