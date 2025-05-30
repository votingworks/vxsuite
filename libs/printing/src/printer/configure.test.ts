import { beforeEach, expect, test, vi } from 'vitest';
import { ok } from '@votingworks/basics';
import { BROTHER_THERMAL_PRINTER_CONFIG, getPpdPath } from '.';
import { exec } from '../utils/exec';
import { DEFAULT_MANAGED_PRINTER_NAME, configurePrinter } from './configure';

vi.mock('../utils/exec');

const execMock = vi.mocked(exec);

beforeEach(() => {
  execMock.mockImplementation(() => {
    throw new Error('not implemented');
  });
});

test('calls lpadmin with expected args', async () => {
  execMock.mockResolvedValueOnce(
    ok({
      stdout: '',
      stderr: '',
    })
  );

  const uri = 'usb://Make/Model';
  const config = BROTHER_THERMAL_PRINTER_CONFIG;
  await configurePrinter({
    uri,
    config,
  });
  expect(execMock).toHaveBeenCalledWith('lpadmin', [
    '-p',
    DEFAULT_MANAGED_PRINTER_NAME,
    '-v',
    uri,
    '-P',
    getPpdPath(config),
    '-E',
  ]);
});
