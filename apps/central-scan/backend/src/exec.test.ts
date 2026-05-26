import { expect, test, vi } from 'vite-plus/test';
import { execFile } from 'node:child_process';
import { streamExecFile } from './exec';

vi.mock(import('node:child_process'));

test('streamExecFile wrapper calls execFile', () => {
  streamExecFile('ls', []);
  expect(execFile).toHaveBeenCalled();
});
