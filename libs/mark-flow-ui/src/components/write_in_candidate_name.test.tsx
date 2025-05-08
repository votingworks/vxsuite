import { expect, test } from 'vitest';
import { render, screen } from '../../test/react_testing_library';
import { WriteInCandidateName } from './write_in_candidate_name';

test('renders all valid virtual keyboard letters without error', () => {
  render(<WriteInCandidateName name={`ABCDEFGHIJKLMNOPQRSTUVWXYZ . - ' " `} />);
});

test('renders individual letters for audio readout', () => {
  render(<WriteInCandidateName name="HON. FOO" />);
  screen.getByText('H');
  expect(screen.getAllByText('O')).toHaveLength(3);
  screen.getByText('N');
  screen.getByText('.');
  screen.getByText('F');

  // Contrary to the regular letters, the 'space' display text is rendered as a
  // separate element, so we expect to find 2 instances of it here:
  expect(screen.getAllByText('space')).toHaveLength(2);
});
