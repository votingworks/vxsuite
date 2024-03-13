import { mockOf } from '@votingworks/test-utils';
import { readFile } from 'fs/promises';
import { isAccessibleControllerDaemonRunning } from './controllerd';

jest.mock('fs/promises');

const readFileMock = mockOf(readFile);

export const MOCK_VIRTUAL_INPUT_DEVICE_OUTPUT = `
I: Bus=0000 Vendor=0000 Product=0000 Version=0000
N: Name="Accessible Controller Daemon Virtual Device"
P: Phys=
S: Sysfs=/devices/virtual/input/input25
U: Uniq=
H: Handlers=sysrq kbd event11 rfkill 
B: PROP=0
B: EV=3
B: KEY=3f0003007f 100007fffffff 7fe001fffff000f 7ffffffffffffff ffffffff00000000 0 1ffffffffffff07 ffffffffffffffff ffffffffffefffff fffffffffffffffe
`;

test('when virtual device detected', async () => {
  readFileMock.mockResolvedValueOnce(MOCK_VIRTUAL_INPUT_DEVICE_OUTPUT);

  expect(await isAccessibleControllerDaemonRunning()).toEqual(true);
});

test('when virtual device not detected', async () => {
  readFileMock.mockResolvedValueOnce(`
    I: Bus=0000 Vendor=0000 Product=0000 Version=0000
    N: Name="Some Other Device"
    P: Phys=
    S: Sysfs=/devices/virtual/input/input25
    U: Uniq=
    H: Handlers=sysrq kbd event11 rfkill 
    B: PROP=0
    B: EV=3
    B: KEY=3f0003007f 100007fffffff 7fe001fffff000f 7ffffffffffffff ffffffff00000000 0 1ffffffffffff07 ffffffffffffffff ffffffffffefffff fffffffffffffffe
    `);

  expect(await isAccessibleControllerDaemonRunning()).toEqual(false);
});
