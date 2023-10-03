import { render, screen } from '../test/react_testing_library';

import { Card } from './card';
import { P } from './typography';

test('renders without footer', () => {
  render(
    <Card>
      <P>Card content</P>
    </Card>
  );

  expect(screen.getByText('Card content')).toBeDefined();
});

test('renders with footer', () => {
  render(
    <Card footer="Footer content">
      <P>Card content</P>
    </Card>
  );

  expect(screen.getByText('Card content')).toBeDefined();
  expect(screen.getByText('Footer content')).toBeDefined();
});
