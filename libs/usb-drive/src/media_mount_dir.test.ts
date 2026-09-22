import { expect, test, vi } from 'vitest';
import { realpathSync } from 'node:fs';
import {
  getMediaMountDir,
  getRealUsbDriveGlobPattern,
  getResolvedMediaMountDir,
} from './media_mount_dir.js';

const realfs = await vi.importActual<typeof import('node:fs')>('node:fs');

vi.mock('node:fs', async (importActual) => {
  const actual = await importActual<typeof import('node:fs')>();
  return {
    ...actual,
    realpathSync: vi.fn((p: string) => {
      if (p === '/media/vx') return '/var/vx/usb-drives';
      return actual.realpathSync(p);
    }),
  };
});

test('getResolvedMediaMountDir returns the realpath of /media/vx', () => {
  vi.mocked(realpathSync).mockImplementation((p) => {
    if (p === '/media/vx') return '/var/vx/usb-drives';
    return realfs.realpathSync(p);
  });

  expect(getMediaMountDir()).toEqual('/media/vx');
  expect(getResolvedMediaMountDir()).toEqual('/var/vx/usb-drives');
  expect(getRealUsbDriveGlobPattern()).toEqual('/var/vx/usb-drives/**/*');
});

test('getResolvedMediaMountDir falls back to the literal path when realpathSync throws', () => {
  vi.mocked(realpathSync).mockImplementation(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });

  expect(getResolvedMediaMountDir()).toEqual(getMediaMountDir());
  expect(getRealUsbDriveGlobPattern()).toEqual('/media/vx/**/*');
});
