import { expect, test } from 'vitest';
import { render, screen } from '../test/react_testing_library';
import { BallotText } from './ballot_text';

test('renders single-line text', () => {
  render(<BallotText text="Mayor" />);
  expect(screen.getByText('Mayor')).toBeDefined();
});

test('renders <br/> markers as actual line breaks', () => {
  const { container } = render(<BallotText text="Mayor<br/>of Townsville" />);
  expect(container.textContent).toEqual('Mayorof Townsville');
  expect(container.querySelectorAll('br')).toHaveLength(1);
});
