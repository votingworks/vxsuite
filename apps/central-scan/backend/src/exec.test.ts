import { execFile } from 'node:child_process';
import { streamExecFile } from './exec';

jest.mock('node:child_process');

test('streamExecFile wrapper calls execFile', () => {
  streamExecFile('ls', []);
  expect(execFile).toHaveBeenCalled();
});
