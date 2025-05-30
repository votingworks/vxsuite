import { beforeEach, expect, test, vi } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { exec } from '../utils/exec';
import { getConnectedDeviceUris, LPINFO_ARGS } from './device_uri';

vi.mock('../utils/exec');

const execMock = vi.mocked(exec);

beforeEach(() => {
  execMock.mockImplementation(() => {
    throw new Error('not implemented');
  });
});

const LPINFO_EXAMPLE_OUTPUT_NO_PRINTERS = '\n';

const LPINFO_EXAMPLE_OUTPUT_SINGLE_PRINTER = `${[
  'direct usb://Brother/PJ-822?serial=000K2G613155',
].join('\n')}\n`;

const LPINFO_EXAMPLE_OUTPUT_MULTIPLE_PRINTERS = `${[
  'direct usb://Brother/PJ-822?serial=000K2G613155',
  'direct usb://HP/LaserJet%20Pro%20M404-M405?serial=PHBBJ08819',
].join('\n')}\n`;

test.each([
  {
    name: 'no printers',
    stdout: LPINFO_EXAMPLE_OUTPUT_NO_PRINTERS,
    expected: [],
  },
  {
    name: 'single printer',
    stdout: LPINFO_EXAMPLE_OUTPUT_SINGLE_PRINTER,
    expected: ['usb://Brother/PJ-822?serial=000K2G613155'],
  },
  {
    name: 'multiple printers',
    stdout: LPINFO_EXAMPLE_OUTPUT_MULTIPLE_PRINTERS,
    expected: [
      'usb://Brother/PJ-822?serial=000K2G613155',
      'usb://HP/LaserJet%20Pro%20M404-M405?serial=PHBBJ08819',
    ],
  },
])('$name: calls lpinfo and parses output', async ({ stdout, expected }) => {
  execMock.mockResolvedValueOnce(
    ok({
      stdout,
      stderr: '',
    })
  );

  expect(await getConnectedDeviceUris()).toEqual(expected);

  expect(execMock).toHaveBeenCalledWith('lpinfo', LPINFO_ARGS);
});

test('lpinfo retries on failure', async () => {
  const retryCount = 4;
  const retryDelay = 1;
  // simulate a success on the final retry
  for (let i = 0; i < retryCount; i += 1) {
    execMock.mockResolvedValueOnce(
      err({
        stdout: '',
        stderr: 'lpinfo: Success\n',
        code: 1,
        signal: null,
        cmd: 'lpinfo --include-schemes usb -v',
      })
    );
  }
  execMock.mockResolvedValueOnce(
    ok({
      stdout: LPINFO_EXAMPLE_OUTPUT_NO_PRINTERS,
      stderr: '',
    })
  );

  expect(await getConnectedDeviceUris({ retryCount, retryDelay })).toEqual([]);
  expect(execMock).toHaveBeenCalledTimes(retryCount + 1);

  // simulate a failure on the final retry
  execMock.mockClear();

  for (let i = 0; i < retryCount + 1; i += 1) {
    execMock.mockResolvedValueOnce(
      err({
        stdout: '',
        stderr: 'lpinfo: Success\n',
        code: 1,
        signal: null,
        cmd: 'lpinfo --include-schemes usb -v',
      })
    );
  }

  await expect(
    getConnectedDeviceUris({ retryCount, retryDelay })
  ).rejects.toThrow();
  expect(execMock).toHaveBeenCalledTimes(retryCount + 1);
});
