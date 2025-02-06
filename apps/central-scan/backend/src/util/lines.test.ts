import { expect, test, vi } from 'vitest';
import { Lines } from './lines';

test('emits nothing with no input', () => {
  const onLine = vi.fn();
  new Lines().on('line', onLine);
  expect(onLine).not.toHaveBeenCalled();
});

test('emits nothing with a partial line with no end', () => {
  const onLine = vi.fn();
  const lines = new Lines().on('line', onLine);
  lines.add('abc');
  expect(onLine).not.toHaveBeenCalled();
});

test('emits a line terminated by a newline', () => {
  const onLine = vi.fn();
  const lines = new Lines().on('line', onLine);
  lines.add('abc\n');
  expect(onLine).toHaveBeenNthCalledWith(1, 'abc\n');
});

test('emits multiple times given multiple lines', () => {
  const onLine = vi.fn();
  const lines = new Lines().on('line', onLine);
  lines.add('abc\ndef\n');
  expect(onLine).toHaveBeenNthCalledWith(1, 'abc\n');
  expect(onLine).toHaveBeenNthCalledWith(2, 'def\n');
});

test('joins previous chunks with a later newline', () => {
  const onLine = vi.fn();
  const lines = new Lines().on('line', onLine);
  lines.add('abc');
  lines.add('def');
  lines.add('g\nh');
  expect(onLine).toHaveBeenNthCalledWith(1, 'abcdefg\n');
});

test('emits whatever remains on end', () => {
  const onLine = vi.fn();
  const lines = new Lines().on('line', onLine);
  lines.add('abc');
  lines.end();
  expect(onLine).toHaveBeenNthCalledWith(1, 'abc');
});

test('emits on end only when there is something to emit', () => {
  const onLine = vi.fn();
  const lines = new Lines().on('line', onLine);
  lines.add('abc');
  expect(onLine).not.toHaveBeenCalled();
  lines.end();
  expect(onLine).toHaveBeenCalledTimes(1);
  lines.end();
  expect(onLine).toHaveBeenCalledTimes(1);
});
