import { mockOf } from '@votingworks/test-utils';
import { exec } from '../utils/exec';
import { getConnectedDeviceUris } from './device_uri';

jest.mock('../utils/exec');

const execMock = mockOf(exec);

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

test('calls lpinfo and parses output', async () => {
  const testCases: Array<{ stdout: string; expected: string[] }> = [
    {
      stdout: LPINFO_EXAMPLE_OUTPUT_NO_PRINTERS,
      expected: [],
    },
    {
      stdout: LPINFO_EXAMPLE_OUTPUT_SINGLE_PRINTER,
      expected: ['usb://Brother/PJ-822?serial=000K2G613155'],
    },
    {
      stdout: LPINFO_EXAMPLE_OUTPUT_MULTIPLE_PRINTERS,
      expected: [
        'usb://Brother/PJ-822?serial=000K2G613155',
        'usb://HP/LaserJet%20Pro%20M404-M405?serial=PHBBJ08819',
      ],
    },
  ];

  for (const { stdout, expected } of testCases) {
    execMock.mockResolvedValueOnce({
      stdout,
      stderr: '',
    });

    expect(await getConnectedDeviceUris()).toEqual(expected);

    expect(execMock).toHaveBeenCalledWith('lpinfo', [
      '--include-schemes',
      'usb',
      '-v',
    ]);
  }
});
