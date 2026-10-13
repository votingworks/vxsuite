import { test } from 'vitest';
import { mockBackupManifest } from '../../test/api_mock_data.js';
import { render, screen } from '../../test/react_testing_library.js';
import { BackupDetails } from './backup_details.js';

test('shows the election, CVR count, and origin of a backup', () => {
  render(<BackupDetails manifest={mockBackupManifest} />);
  screen.getByRole('heading', { name: 'General Election · November 3, 2020' });
  screen.getByText('Franklin County, State of Hamilton');
  screen.getByText('0 CVRs');
  screen.getByText('Machine 0000 · 10/8/2026, 4:00 AM');
});

test.each<{ cvrCount: number; text: string }>([
  { cvrCount: 0, text: '0 CVRs' },
  { cvrCount: 1, text: '1 CVR' },
  { cvrCount: 1234, text: '1,234 CVRs' },
])('counts the CVRs in a backup: $text', ({ cvrCount, text }) => {
  render(<BackupDetails manifest={{ ...mockBackupManifest, cvrCount }} />);
  screen.getByText(text);
});
