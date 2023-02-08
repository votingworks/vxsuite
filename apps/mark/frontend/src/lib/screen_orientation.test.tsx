// eslint-disable-next-line vx/gts-no-import-export-type
import type { MachineConfig } from '@votingworks/mark-backend';
import { screenOrientation } from './screen_orientation';

test('Portrait orientation booleans', () => {
  const machineConfig: MachineConfig = {
    machineId: '1',
    codeVersion: 'test',
    screenOrientation: 'portrait',
  };
  const { isPortrait, isLandscape } = screenOrientation(machineConfig);
  expect(isPortrait).toBeTruthy();
  expect(isLandscape).toBeFalsy();
});

test('Landscape orientation booleans', () => {
  const machineConfig: MachineConfig = {
    machineId: '1',
    codeVersion: 'test',
    screenOrientation: 'landscape',
  };
  const { isPortrait, isLandscape } = screenOrientation(machineConfig);
  expect(isPortrait).toBeFalsy();
  expect(isLandscape).toBeTruthy();
});
