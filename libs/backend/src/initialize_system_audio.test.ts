import { mockOf } from '@votingworks/test-utils';

import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { execFile } from './exec';
import { initializeSystemAudio } from './initialize_system_audio';

jest.mock('./exec', (): typeof import('./exec') => ({
  ...jest.requireActual('./exec'),
  execFile: jest.fn(),
}));

const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  isFeatureFlagEnabled: (flag) => featureFlagMock.isEnabled(flag),
}));

const execFileMock = mockOf(execFile);

beforeEach(() => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_SYSTEM_AUDIO_SETUP
  );
});

test('sets system volume to 100%', async () => {
  execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

  await initializeSystemAudio();

  expect(execFileMock).toHaveBeenCalledWith(
    'amixer',
    expect.arrayContaining(['sset', 'Master', '100%', 'unmute'])
  );
});

test('skips setup when `SKIP_SYSTEM_AUDIO_SETUP` feature flag is enabled', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_SYSTEM_AUDIO_SETUP
  );

  await initializeSystemAudio();

  expect(execFileMock).not.toHaveBeenCalled();
});
