import { mockOf } from '@votingworks/test-utils';
import { execFile } from './exec';
import { getDiskSpaceSummary } from './disk_space_summary';

jest.mock('./exec', (): typeof import('./exec') => ({
  ...jest.requireActual('./exec'),
  execFile: jest.fn(),
}));

const execFileMock = mockOf(execFile);

const EXAMPLE_STDOUT = `Filesystem             1K-blocks    Used Available Use% Mounted on
/dev/mapper/Vx--vx-tmp    940768      40    875604   1% /tmp
/dev/mapper/Vx--vg-var  91997880 4424092  82854584   6% /var
total                   92938648 4424132  83730188   6% -
`;

test('getDiskSpaceSummary', async () => {
  execFileMock.mockResolvedValue({
    stdout: EXAMPLE_STDOUT,
    stderr: '',
  });

  expect(await getDiskSpaceSummary(['/tmp', '/var'])).toEqual({
    total: 92938648,
    used: 4424132,
    available: 83730188,
  });
});
