import { render, screen } from '../test/react_testing_library';

import { Card } from './card';
import { P } from './typography';
import { AppBase } from './app_base';

test('renders without footer', () => {
  render(
    <AppBase>
      <Card>
        <P>Card content</P>
      </Card>
    </AppBase>
  );

  expect(screen.getByText('Card content')).toBeDefined();
});

test('renders with footer', () => {
  render(
    <AppBase>
      <Card footer="Footer content">
        <P>Card content</P>
      </Card>
    </AppBase>
  );

  expect(screen.getByText('Card content')).toBeDefined();
  expect(screen.getByText('Footer content')).toBeDefined();
});
