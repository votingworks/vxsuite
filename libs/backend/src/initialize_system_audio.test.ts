import { expect, test, vi } from 'vitest';
import { execFile } from './exec';
import { initializeSystemAudio } from './initialize_system_audio';

vi.mock(
  import('./exec.js'),
  async (importActual): Promise<typeof import('./exec')> => ({
    ...(await importActual()),
    execFile: vi.fn(),
  })
);

const execFileMock = vi.mocked(execFile);

test('sets system volume to 100%', async () => {
  execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

  await initializeSystemAudio();

  expect(execFileMock).toHaveBeenCalledWith(
    'amixer',
    expect.arrayContaining(['sset', 'Master', '100%', 'unmute'])
  );
});
