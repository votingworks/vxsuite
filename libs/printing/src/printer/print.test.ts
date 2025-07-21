import { beforeEach, expect, test, vi } from 'vitest';
import { ok } from '@votingworks/basics';
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

  await print({ data: Uint8Array.of(0xca, 0xfe) });

  expect(exec).toHaveBeenCalledWith(
    'lpr',
    [
      '-P',
      DEFAULT_MANAGED_PRINTER_NAME,
      '-o',
      'sides=one-sided',
      '-o',
      'media=letter',
    ],
    Uint8Array.of(0xca, 0xfe)
  );
});

test('allows specifying other sided-ness', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await print({
    data: Uint8Array.of(0xf0, 0x0d),
    sides: PrintSides.TwoSidedLongEdge,
  });

  expect(exec).toHaveBeenCalledWith(
    'lpr',
    [
      '-P',
      DEFAULT_MANAGED_PRINTER_NAME,
      '-o',
      'sides=two-sided-long-edge',
      '-o',
      'media=letter',
    ],
    Uint8Array.of(0xf0, 0x0d)
  );
});

test('prints a specified number of copies', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await print({ data: Uint8Array.of(0xca, 0xfe), copies: 3 });

  expect(exec).toHaveBeenCalledWith(
    'lpr',
    [
      '-P',
      DEFAULT_MANAGED_PRINTER_NAME,
      '-o',
      'sides=one-sided',
      '-o',
      'media=letter',
      '-#',
      '3',
    ],
    Uint8Array.of(0xca, 0xfe)
  );
});

test('passes through raw options', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await print({
    data: Uint8Array.of(0xf0, 0x0d),
    raw: { 'fit-to-page': 'true' },
  });

  expect(exec).toHaveBeenCalledWith(
    'lpr',
    [
      '-P',
      DEFAULT_MANAGED_PRINTER_NAME,
      '-o',
      'sides=one-sided',
      '-o',
      'media=letter',
      '-o',
      'fit-to-page=true',
    ],
    Uint8Array.of(0xf0, 0x0d)
  );
});

test('rejects invalid raw options', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await expect(
    print({ data: Uint8Array.of(), raw: { 'fit to page': 'true' } })
  ).rejects.toThrowError();

  expect(exec).not.toHaveBeenCalled();
});

test('supports legal-sized paper option', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await print({ data: Uint8Array.of(0xca, 0xfe), size: 'legal' });

  expect(exec).toHaveBeenCalledWith(
    'lpr',
    [
      '-P',
      DEFAULT_MANAGED_PRINTER_NAME,
      '-o',
      'sides=one-sided',
      '-o',
      'media=legal',
    ],
    Uint8Array.of(0xca, 0xfe)
  );
});
