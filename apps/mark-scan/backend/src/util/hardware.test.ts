import { mockOf } from '@votingworks/test-utils';
import { exec } from '@votingworks/backend';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  getMarkScanBmdModel,
  isAccessibleControllerDaemonRunning,
} from './hardware';

jest.mock('@votingworks/backend');
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

const execMock = mockOf(exec);

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('when bmd-150 flag is on', () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.MARK_SCAN_USE_BMD_150
  );

  expect(getMarkScanBmdModel()).toEqual('bmd-150');
});

test('when bmd-150 flag is off', () => {
  expect(getMarkScanBmdModel()).toEqual('bmd-155');
});

test('when virtual device detected', async () => {
  execMock.mockResolvedValueOnce({
    stdout: 'does not matter',
    stderr: '',
  });

  expect(await isAccessibleControllerDaemonRunning()).toEqual(true);
});

test('when virtual device not detected', async () => {
  execMock.mockRejectedValueOnce({
    stdout: 'does not matter',
    stderr: '',
  });

  expect(await isAccessibleControllerDaemonRunning()).toEqual(false);
});
