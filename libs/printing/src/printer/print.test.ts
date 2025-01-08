import { ok } from '@votingworks/basics';
import { mockOf } from '@votingworks/test-utils';
import { Buffer } from 'node:buffer';
import { exec } from '../utils/exec';
import { DEFAULT_MANAGED_PRINTER_NAME } from './configure';
import { print } from './print';
import { PrintSides } from './types';

jest.mock('../utils/exec');

const execMock = mockOf(exec);

beforeEach(() => {
  execMock.mockImplementation(() => {
    throw new Error('not implemented');
  });
});

test('prints with defaults', async () => {
  execMock.mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await print({ data: Buffer.of() });

  expect(execMock).toHaveBeenCalledWith(
    'lpr',
    ['-P', DEFAULT_MANAGED_PRINTER_NAME, '-o', 'sides=two-sided-long-edge'],
    expect.anything()
  );
});

test('allows specifying other sided-ness', async () => {
  execMock.mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await print({ data: Buffer.of(), sides: PrintSides.OneSided });

  expect(execMock).toHaveBeenCalledWith(
    'lpr',
    ['-P', DEFAULT_MANAGED_PRINTER_NAME, '-o', 'sides=one-sided'],
    expect.anything()
  );
});

test('prints a specified number of copies', async () => {
  execMock.mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await print({ data: Buffer.of(), copies: 3 });

  expect(execMock).toHaveBeenCalledWith(
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
  execMock.mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await print({ data: Buffer.of(), raw: { 'fit-to-page': 'true' } });

  expect(execMock).toHaveBeenCalledWith(
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
  execMock.mockResolvedValueOnce(ok({ stdout: '', stderr: '' }));

  await expect(
    print({ data: Buffer.of(), raw: { 'fit to page': 'true' } })
  ).rejects.toThrowError();

  expect(execMock).not.toHaveBeenCalled();
});
