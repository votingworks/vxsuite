import { hasTextAcrossElements } from '@votingworks/test-utils';
import { render, screen } from '../test/react_testing_library';
import { BigMetric } from './big_metric';

test('renders label and formatted value', () => {
  render(<BigMetric label="Number of Machines" value={2} />);
  render(<BigMetric label="Ballots Scanned" value={4096} />);

  // Verify labels are rendered:
  screen.getByText('Number of Machines');
  screen.getByText('Ballots Scanned');

  // Verify counts are rendered as formatted numbers with accessible labels:
  screen.getByText(hasTextAcrossElements(/Number of Machines.?2/));
  screen.getByText(hasTextAcrossElements(/Ballots Scanned.?4,096/));
});
