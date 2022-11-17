import { mockOf } from '@votingworks/test-utils';
import * as fs from 'fs/promises';
import { getUsbDrives } from './get_usb_drives';
import { execFile } from './utils/exec';

const execMock = mockOf(execFile);
const accessMock = fs.access as unknown as jest.MockedFunction<
  () => Promise<void>
>;
const readdirMock = fs.readdir as unknown as jest.MockedFunction<
  () => Promise<string[]>
>;
const readlinkMock = fs.readlink as unknown as jest.MockedFunction<
  () => Promise<string>
>;

jest.mock('fs/promises', () => ({
  access: jest.fn(),
  readdir: jest.fn(),
  readlink: jest.fn(),
}));

jest.mock('./utils/exec', (): typeof import('./utils/exec') => ({
  ...jest.requireActual('./utils/exec'),
  execFile: jest.fn(),
}));

test('getUsbDrives', async () => {
  readdirMock.mockResolvedValueOnce([
    'usb-foobar-part23',
    'notausb-bazbar-part21',
    'usb-babar-part3',
  ]);
  readlinkMock.mockResolvedValueOnce('../../sdb1');
  readlinkMock.mockResolvedValueOnce('../../sdc1');
  execMock.mockResolvedValueOnce({
    stdout: JSON.stringify({
      blockdevices: [
        {
          name: 'sdb1',
          'maj:min': '8:3',
          rm: '0',
          size: '93.9M',
          ro: '1',
          type: 'part',
          mountpoint: '/media/usb-drive-sdb1',
        },
      ],
    }),
    stderr: '',
  });
  execMock.mockResolvedValueOnce({
    stdout: JSON.stringify({
      blockdevices: [
        {
          name: 'sdc1',
          'maj:min': '8:3',
          rm: '0',
          size: '73.2M',
          ro: '1',
          type: 'part',
          mountpoint: null,
        },
      ],
    }),
    stderr: '',
  });

  execMock.mockResolvedValueOnce({
    stdout: JSON.stringify({
      filesystems: [
        {
          target: '/media/usb-drive-sdb1',
          source: '/dev/sdb1',
        },
        {
          target: '/media/usb-drive-sdz1',
          source: '/dev/sdz1',
        },
        {
          target: 'something',
          source: 'random',
        },
      ],
    }),
    stderr: '',
  });

  accessMock.mockResolvedValueOnce().mockRejectedValueOnce(new Error('ENOENT'));

  const devices = await getUsbDrives();

  expect(execMock).toHaveBeenCalledTimes(2);
  expect(devices).toEqual([
    { deviceName: 'sdb1', mountPoint: '/media/usb-drive-sdb1' },
    { deviceName: 'sdc1' },
  ]);
});
