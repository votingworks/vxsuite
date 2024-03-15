import type { DiskSpaceSummary } from '@votingworks/backend';
import { render, screen } from '../../test/react_testing_library';
import { ComputerSection } from './computer_section';
import { expectTextWithIcon } from '../../test/expect_text_with_icon';

const mockDiskSpaceSummary: DiskSpaceSummary = {
  total: 1000000000,
  available: 500000000,
  used: 500000000,
};

test('normal disk space summary', async () => {
  render(<ComputerSection diskSpaceSummary={mockDiskSpaceSummary} />);

  screen.getByRole('heading', { name: 'Storage' });
  await expectTextWithIcon(
    'Free Disk Space: 50% (500 GB / 1000 GB)',
    'square-check'
  );
});

test('low disk space summary', async () => {
  render(
    <ComputerSection
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

test('undefined battery info', async () => {
  render(<ComputerSection diskSpaceSummary={mockDiskSpaceSummary} />);

  screen.getByRole('heading', { name: 'Power' });
  await expectTextWithIcon('Battery Level: 100%', 'square-check');
  await expectTextWithIcon('Power Source: Unknown', 'square-check');
});

test('on low battery power', async () => {
  render(
    <ComputerSection
      diskSpaceSummary={mockDiskSpaceSummary}
      batteryInfo={{ level: 0.02, discharging: true }}
    />
  );

  screen.getByRole('heading', { name: 'Power' });
  await expectTextWithIcon('Battery Level: 2%', 'triangle-exclamation');
  await expectTextWithIcon('Power Source: Battery', 'circle-info');
});

test('on external power', async () => {
  render(
    <ComputerSection
      diskSpaceSummary={mockDiskSpaceSummary}
      batteryInfo={{ level: 0.02, discharging: false }}
    />
  );

  screen.getByRole('heading', { name: 'Power' });
  await expectTextWithIcon('Battery Level: 2%', 'square-check');
  await expectTextWithIcon(
    'Power Source: External Power Supply',
    'square-check'
  );
});
