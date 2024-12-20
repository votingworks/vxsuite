import { beforeEach, expect, test, vi } from 'vitest';
import { ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { exec } from '../utils/exec';
import { DEFAULT_MANAGED_PRINTER_NAME } from './configure';
import { print } from './print';
import { PrintSides } from './types';

vi.mock('../utils/exec');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(exec).mockImplementation(() => {
    throw new Error('not implemented');
  });
});

test('prints with defaults', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await print({ data: Buffer.of() });

  expect(exec).toHaveBeenCalledWith(
    'lpr',
    ['-P', DEFAULT_MANAGED_PRINTER_NAME, '-o', 'sides=two-sided-long-edge'],
    expect.anything()
  );
});

test('allows specifying other sided-ness', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await print({ data: Buffer.of(), sides: PrintSides.OneSided });

  expect(exec).toHaveBeenCalledWith(
    'lpr',
    ['-P', DEFAULT_MANAGED_PRINTER_NAME, '-o', 'sides=one-sided'],
    expect.anything()
  );
});

test('prints a specified number of copies', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await print({ data: Buffer.of(), copies: 3 });

  expect(exec).toHaveBeenCalledWith(
    'lpr',
    [
      '-P',
      DEFAULT_MANAGED_PRINTER_NAME,
      '-o',
      'sides=two-sided-long-edge',
      '-#',
      '3',
    ],
    expect.anything()
  );
});

test('passes through raw options', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await print({ data: Buffer.of(), raw: { 'fit-to-page': 'true' } });

  expect(exec).toHaveBeenCalledWith(
    'lpr',
    [
      '-P',
      DEFAULT_MANAGED_PRINTER_NAME,
      '-o',
      'sides=two-sided-long-edge',
      '-o',
      'fit-to-page=true',
    ],
    expect.anything()
  );
});

test('rejects invalid raw options', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await expect(
    print({ data: Buffer.of(), raw: { 'fit to page': 'true' } })
  ).rejects.toThrowError();

  expect(exec).not.toHaveBeenCalled();
});
