import { beforeEach, expect, test, vi } from 'vitest';
import { ok } from '@votingworks/basics';
import { exec } from '../utils/exec';
import { DEFAULT_MANAGED_PRINTER_NAME } from './configure';
import { print } from './print';
import { PrintSides } from './types';

vi.mock('../utils/exec');

const LP_STDOUT = 'request id is VxPrinter-42 (1 file(s))\n';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(exec).mockImplementation(() => {
    throw new Error('not implemented');
  });
});

test('prints with defaults', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: LP_STDOUT, stderr: '' }));

  expect(await print({ data: Uint8Array.of(0xca, 0xfe) })).toEqual(42);

  expect(exec).toHaveBeenCalledWith(
    'lp',
    [
      '-d',
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
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: LP_STDOUT, stderr: '' }));

  await print({
    data: Uint8Array.of(0xf0, 0x0d),
    sides: PrintSides.TwoSidedLongEdge,
  });

  expect(exec).toHaveBeenCalledWith(
    'lp',
    [
      '-d',
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
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: LP_STDOUT, stderr: '' }));

  await print({ data: Uint8Array.of(0xca, 0xfe), copies: 3 });

  expect(exec).toHaveBeenCalledWith(
    'lp',
    [
      '-d',
      DEFAULT_MANAGED_PRINTER_NAME,
      '-o',
      'sides=one-sided',
      '-o',
      'media=letter',
      '-n',
      '3',
    ],
    Uint8Array.of(0xca, 0xfe)
  );
});

test('passes through raw options', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: LP_STDOUT, stderr: '' }));

  await print({
    data: Uint8Array.of(0xf0, 0x0d),
    raw: { 'fit-to-page': 'true' },
  });

  expect(exec).toHaveBeenCalledWith(
    'lp',
    [
      '-d',
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
  await expect(
    print({ data: Uint8Array.of(), raw: { 'fit to page': 'true' } })
  ).rejects.toThrowError();

  expect(exec).not.toHaveBeenCalled();
});

test('supports legal-sized paper option', async () => {
  vi.mocked(exec).mockResolvedValueOnce(ok({ stdout: LP_STDOUT, stderr: '' }));

  await print({ data: Uint8Array.of(0xca, 0xfe), size: 'legal' });

  expect(exec).toHaveBeenCalledWith(
    'lp',
    [
      '-d',
      DEFAULT_MANAGED_PRINTER_NAME,
      '-o',
      'sides=one-sided',
      '-o',
      'media=legal',
    ],
    Uint8Array.of(0xca, 0xfe)
  );
});

test('returns the job id assigned by CUPS', async () => {
  vi.mocked(exec).mockResolvedValueOnce(
    ok({ stdout: 'request id is VxPrinter-107 (1 file(s))\n', stderr: '' })
  );

  expect(await print({ data: Uint8Array.of(0xca, 0xfe) })).toEqual(107);
});

test('parses the job id independent of the localized sentence around it', async () => {
  vi.mocked(exec).mockResolvedValueOnce(
    ok({ stdout: 'Anfrage-ID ist VxPrinter-55 (1 Datei(en))\n', stderr: '' })
  );

  expect(await print({ data: Uint8Array.of(0xca, 0xfe) })).toEqual(55);
});

test('fails fast if the job id cannot be parsed from lp output', async () => {
  vi.mocked(exec).mockResolvedValueOnce(
    ok({ stdout: 'something unexpected', stderr: '' })
  );

  await expect(print({ data: Uint8Array.of(0xca, 0xfe) })).rejects.toThrow(
    'unable to parse job id from lp output: something unexpected'
  );
});
