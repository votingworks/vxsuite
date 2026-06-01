import { expect, test } from 'vitest';
import { render, screen } from '../test/react_testing_library';
import { Checkbox } from './checkbox';

test('renders a checked checkbox', () => {
  const { container } = render(<Checkbox checked />);
  expect(container.firstChild).toBeDefined();
  expect(screen.getByRole('img', { hidden: true })).toBeDefined();
});

test('renders an unchecked checkbox', () => {
  const { container } = render(<Checkbox />);
  expect(container.firstChild).toBeDefined();
});

test('renders a filled checkbox (used to mark direct voter selections)', () => {
  // The `filled` variant gets applied via styled-components when the checkbox
  // represents a voter-marked option, distinct from a derived (SP-expanded)
  // selection. Just exercising the render path covers the filled-styles CSS.
  const { container } = render(<Checkbox checked filled />);
  expect(container.firstChild).toBeDefined();
});
