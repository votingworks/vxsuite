import { render, screen } from '../../test/react_testing_library';
import { expectTextWithIcon } from '../../test/expect_text_with_icon';
import { BatterySection } from './battery_section';

test('undefined battery info', async () => {
  render(<BatterySection />);

  screen.getByRole('heading', { name: 'Battery' });
  await expectTextWithIcon('Battery Level: 100%', 'square-check');
  await expectTextWithIcon('Power Source: Unknown', 'square-check');
});

test('on low battery power', async () => {
  render(<BatterySection batteryInfo={{ level: 0.02, discharging: true }} />);

  screen.getByRole('heading', { name: 'Battery' });
  await expectTextWithIcon('Battery Level: 2%', 'triangle-exclamation');
  await expectTextWithIcon('Power Source: Battery', 'circle-info');
});

test('on external power', async () => {
  render(<BatterySection batteryInfo={{ level: 0.02, discharging: false }} />);

  screen.getByRole('heading', { name: 'Battery' });
  await expectTextWithIcon('Battery Level: 2%', 'square-check');
  await expectTextWithIcon(
    'Power Source: External Power Supply',
    'square-check'
  );
});
