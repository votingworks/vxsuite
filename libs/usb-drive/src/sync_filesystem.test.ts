import { expect, test, vi } from 'vitest';
import { exec } from './exec';
import { syncFilesystem } from './sync_filesystem';

vi.mock(
  import('./exec.js'),
  async (importActual): Promise<typeof import('./exec')> => ({
    ...(await importActual()),
    exec: vi.fn(),
  })
);

const execMock = vi.mocked(exec);

test('flushes the filesystem containing the given path', async () => {
  execMock.mockResolvedValue({ stdout: '', stderr: '' });

  await syncFilesystem('/media/vx/usb-drive');

  expect(execMock).toHaveBeenCalledWith('sync', ['-f', '/media/vx/usb-drive']);
});

test('surfaces a failure to flush', async () => {
  execMock.mockRejectedValue(new Error('sync: Input/output error'));

  await expect(syncFilesystem('/media/vx/usb-drive')).rejects.toThrow(
    'sync: Input/output error'
  );
});
