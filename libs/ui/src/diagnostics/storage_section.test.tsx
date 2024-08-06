import type { DiskSpaceSummary } from '@votingworks/backend';
import { render, screen } from '../../test/react_testing_library';
import { expectTextWithIcon } from '../../test/expect_text_with_icon';
import { StorageSection } from './storage_section';

const mockDiskSpaceSummary: DiskSpaceSummary = {
  total: 1000000000,
  available: 500000000,
  used: 500000000,
};

test('normal disk space summary', async () => {
  render(<StorageSection diskSpaceSummary={mockDiskSpaceSummary} />);

  screen.getByRole('heading', { name: 'Storage' });
  await expectTextWithIcon(
    'Free Disk Space: 50% (500 GB / 1000 GB)',
    'square-check'
  );
});

test('low disk space summary', async () => {
  render(
    <StorageSection
      diskSpaceSummary={{
        total: 1000000000,
        available: 2400000,
        used: 976000000,
      }}
    />
  );

  screen.getByRole('heading', { name: 'Storage' });
  await expectTextWithIcon(
    'Free Disk Space: 0% (2.4 GB / 1000 GB)',
    'triangle-exclamation'
  );
});
