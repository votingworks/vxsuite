import { render, screen } from '../test/react_testing_library';
import { BigMetric } from './big_metric';

test('renders label and formatted value', () => {
  render(<BigMetric label="Number of Machines" value={2} />);
  render(<BigMetric label="Ballots Scanned" value={4096} />);

  // Verify labels are rendered:
  screen.getByText('Number of Machines');
  screen.getByText('Ballots Scanned');

  // Verify counts are rendered as formatted numbers with accessible labels:
  expect(screen.getByText('2')).toHaveAccessibleName('Number of Machines: 2');
  expect(screen.getByText('4,096')).toHaveAccessibleName(
    'Ballots Scanned: 4,096'
  );
});

// To satisfy coverage requirements:
test('renders in both "legacy" and VVSG size modes', () => {
  render(<BigMetric label="Number of Machines" value={2} />, {
    vxTheme: { sizeMode: 'legacy' },
  });

  render(<BigMetric label="Number of Machines" value={2} />, {
    vxTheme: { sizeMode: 'm' },
  });
});
