import { afterEach, expect, test, vi } from 'vitest';
import { mockWritable } from '@votingworks/test-utils';
import { StyledPrinter } from './styled_printer.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

test('println writes the joined parts and a newline', () => {
  const stream = mockWritable();
  const printer = new StyledPrinter(stream);
  printer.println('a', 'b', 'c');
  printer.println();
  expect(stream.toString()).toEqual('abc\n\n');
});

test('style returns plain text when the stream is not a TTY', () => {
  const printer = new StyledPrinter(mockWritable());
  expect(printer.style('cyan', 'text')).toEqual('text');
  expect(printer.style(['bold', 'cyan'], 'text')).toEqual('text');
});

test('style applies ANSI codes when FORCE_COLOR is set', () => {
  vi.stubEnv('FORCE_COLOR', '1');
  const printer = new StyledPrinter(mockWritable());
  expect(printer.style('cyan', 'text')).toEqual(
    // \u001b is ESC; [36m and [39m set and reset the cyan foreground
    '\u001b[36mtext\u001b[39m'
  );
});

test('style applies every format in an array', () => {
  vi.stubEnv('FORCE_COLOR', '1');
  const printer = new StyledPrinter(mockWritable());
  expect(printer.style(['bold', 'cyan'], 'text')).toEqual(
    // \u001b is ESC; [1m/[22m toggle bold, [36m/[39m toggle cyan
    '\u001b[1m\u001b[36mtext\u001b[39m\u001b[22m'
  );
});
