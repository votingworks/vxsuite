import { test } from 'vitest';
import { render, screen } from '../test/react_testing_library';
import { TestModeCallout } from './test_mode';

test('TestModeCallout', () => {
  render(<TestModeCallout />);
  screen.getByText('Test Ballot Mode');
});
