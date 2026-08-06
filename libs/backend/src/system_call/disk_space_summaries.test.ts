import { afterEach, expect, test, vi } from 'vitest';
import { getDiskSpaceSummaries } from './disk_space_summaries.js';
import { execFile } from '../exec.js';

vi.mock(
  import('../exec.js'),
  async (importActual): Promise<typeof import('../exec.js')> => ({
    ...(await importActual()),
    execFile: vi.fn(),
  })
);

afterEach(() => {
  vi.clearAllMocks();
});

const EXAMPLE_STDOUT = `1K-blocks      Used    Avail Mounted on
   940768        40   875604 /tmp
 91997880   4424092 82854584 /var
`;

test('getDiskSpaceSummaries returns one summary per path', async () => {
  vi.mocked(execFile).mockResolvedValue({
    stdout: EXAMPLE_STDOUT,
    stderr: '',
  });

  expect(await getDiskSpaceSummaries(['/tmp/a', '/var/b'])).toEqual([
    {
      path: '/tmp/a',
      mountpoint: '/tmp',
      total: 940768,
      used: 40,
      available: 875604,
    },
    {
      path: '/var/b',
      mountpoint: '/var',
      total: 91997880,
      used: 4424092,
      available: 82854584,
    },
  ]);
  expect(execFile).toHaveBeenCalledWith('df', [
    '-k',
    '--output=size,used,avail,target',
    '/tmp/a',
    '/var/b',
  ]);
});

test('getDiskSpaceSummaries returns a summary per path, matching arity', async () => {
  vi.mocked(execFile).mockResolvedValue({
    stdout: EXAMPLE_STDOUT,
    stderr: '',
  });

  // destructuring both elements only type-checks if the return value is a
  // 2-tuple rather than an array
  const [tmp, usr] = await getDiskSpaceSummaries(['/tmp/a', '/var/b']);
  expect(tmp.mountpoint).toEqual('/tmp');
  expect(usr.mountpoint).toEqual('/var');
});

test('getDiskSpaceSummaries handles mountpoints containing spaces', async () => {
  vi.mocked(execFile).mockResolvedValue({
    stdout: `1K-blocks      Used    Avail Mounted on
   940768        40   875604 /media/usb drive
`,
    stderr: '',
  });

  expect(await getDiskSpaceSummaries(['/media/usb drive'])).toEqual([
    {
      path: '/media/usb drive',
      mountpoint: '/media/usb drive',
      total: 940768,
      used: 40,
      available: 875604,
    },
  ]);
});

test('getDiskSpaceSummaries with no paths is a no-op', async () => {
  await expect(getDiskSpaceSummaries([])).resolves.toEqual([]);
  expect(execFile).not.toHaveBeenCalled();
});

test('getDiskSpaceSummaries requires one row of output per path', async () => {
  vi.mocked(execFile).mockResolvedValue({
    stdout: EXAMPLE_STDOUT,
    stderr: '',
  });

  await expect(getDiskSpaceSummaries(['/tmp/a'])).rejects.toThrow(
    'expected one row of df output per path, got 2 for 1 path(s)'
  );
});

test('getDiskSpaceSummaries rejects unparseable output', async () => {
  vi.mocked(execFile).mockResolvedValue({
    stdout: `1K-blocks      Used    Avail Mounted on
df: /nope: No such file or directory
`,
    stderr: '',
  });

  await expect(getDiskSpaceSummaries(['/nope'])).rejects.toThrow(
    'unexpected df output: df: /nope: No such file or directory'
  );
});
