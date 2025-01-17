import { expect, test, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { streamExecFile } from './exec';

vi.mock(import('node:child_process'));

test('streamExecFile wrapper calls execFile', () => {
  streamExecFile('ls', []);
  expect(execFile).toHaveBeenCalled();
});
