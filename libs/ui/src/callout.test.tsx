import { render, screen } from '../test/react_testing_library';
import { Callout } from './callout';
import { makeTheme } from './themes/make_theme';

test('Callout shows a card with an icon and children', () => {
  const theme = makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' });
  render(
    <Callout icon="Warning" color="warning">
      This is a warning
    </Callout>,
    { vxTheme: theme }
  );
  const contents = screen.getByText('This is a warning');
  screen.getByRole('img', { hidden: true });
  expect(contents.parentElement).toHaveStyleRule(
    `background-color: ${theme.colors.warningContainer}`
  );
});

test('Callout takes a custom icon', () => {
  render(<Callout icon={<div>Custom icon</div>} />);
  screen.getByText('Custom icon');
});
