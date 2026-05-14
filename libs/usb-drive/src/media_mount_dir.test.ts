import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.doUnmock('node:fs');
});

async function importMediaMountDir() {
  return import('./media_mount_dir.js');
}

test('RESOLVED_MEDIA_MOUNT_DIR returns the realpath of /media/vx', async () => {
  vi.doMock('node:fs', async (importActual) => {
    const actual = await importActual<typeof import('node:fs')>();
    return {
      ...actual,
      realpathSync: vi.fn((p: string) => {
        if (p === '/media/vx') return '/var/vx/usb-drives';
        return actual.realpathSync(p);
      }),
    };
  });

  const { MEDIA_MOUNT_DIR, RESOLVED_MEDIA_MOUNT_DIR, REAL_USB_DRIVE_GLOB_PATTERN } =
    await importMediaMountDir();

  expect(MEDIA_MOUNT_DIR).toEqual('/media/vx');
  expect(RESOLVED_MEDIA_MOUNT_DIR).toEqual('/var/vx/usb-drives');
  expect(REAL_USB_DRIVE_GLOB_PATTERN).toEqual('/var/vx/usb-drives/**/*');
});

test('RESOLVED_MEDIA_MOUNT_DIR falls back to the literal path when realpathSync throws', async () => {
  vi.doMock('node:fs', async (importActual) => {
    const actual = await importActual<typeof import('node:fs')>();
    return {
      ...actual,
      realpathSync: vi.fn(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }),
    };
  });

  const { MEDIA_MOUNT_DIR, RESOLVED_MEDIA_MOUNT_DIR, REAL_USB_DRIVE_GLOB_PATTERN } =
    await importMediaMountDir();

  expect(RESOLVED_MEDIA_MOUNT_DIR).toEqual(MEDIA_MOUNT_DIR);
  expect(REAL_USB_DRIVE_GLOB_PATTERN).toEqual('/media/vx/**/*');
});
