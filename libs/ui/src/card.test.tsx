import { render, screen } from '../test/react_testing_library';

import { Card } from './card';
import { makeTheme } from './themes/make_theme';
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

test('renders with desktop theme and color', () => {
  const theme = makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' });
  render(
    <Card color="primary">
      <P>Card content</P>
    </Card>,
    { vxTheme: theme }
  );
  const cardContents = screen.getByText('Card content');
  expect(cardContents).toHaveStyleRule('padding: 1rem');
  expect(cardContents.parentElement).toHaveStyleRule(
    `background-color: ${theme.colors.primaryContainer}`
  );
});
