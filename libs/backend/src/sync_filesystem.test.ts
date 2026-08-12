import { expect, test, vi } from 'vitest';
import { execFile } from './exec';
import { syncFilesystem } from './sync_filesystem';

vi.mock(
  import('./exec.js'),
  async (importActual): Promise<typeof import('./exec')> => ({
    ...(await importActual()),
    execFile: vi.fn(),
  })
);

const execFileMock = vi.mocked(execFile);

test('flushes the filesystem containing the given path', async () => {
  execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

  await syncFilesystem('/media/vx/usb-drive');

  expect(execFileMock).toHaveBeenCalledWith('sync', [
    '-f',
    '/media/vx/usb-drive',
  ]);
});

test('surfaces a failure to flush', async () => {
  execFileMock.mockRejectedValue(new Error('sync: Input/output error'));

  await expect(syncFilesystem('/media/vx/usb-drive')).rejects.toThrow(
    'sync: Input/output error'
  );
});
