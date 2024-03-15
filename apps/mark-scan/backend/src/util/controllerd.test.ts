import { mockOf } from '@votingworks/test-utils';
import { execFile } from '@votingworks/backend';
import { isAccessibleControllerDaemonRunning } from './controllerd';

jest.mock('@votingworks/backend');

const execFileMock = mockOf(execFile);

test('when virtual device detected', async () => {
  execFileMock.mockResolvedValueOnce({
    stdout: 'does not matter',
    stderr: '',
  });

  expect(await isAccessibleControllerDaemonRunning()).toEqual(true);
});

test('when virtual device not detected', async () => {
  execFileMock.mockRejectedValueOnce({
    stdout: 'does not matter',
    stderr: '',
  });

  expect(await isAccessibleControllerDaemonRunning()).toEqual(false);
});
