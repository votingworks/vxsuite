import { render, screen } from '../test/react_testing_library';

import { FullScreenIconWrapper, IconColor, Icons } from './icons';
import { makeTheme } from './themes/make_theme';

for (const [name, Component] of Object.entries(Icons)) {
  if (typeof Component !== 'function') {
    continue;
  }

  test(`Icons.${name} renders with no props`, () => {
    render(<Component />);

    screen.getByRole('img', { hidden: true });
  });
}

test(`Icon renders with color`, () => {
  const theme = makeTheme({ colorMode: 'desktop' });
  const expectedColors: Record<IconColor, string> = {
    neutral: theme.colors.onBackground,
    primary: theme.colors.primary,
    success: theme.colors.successAccent,
    warning: theme.colors.warningAccent,
    danger: theme.colors.dangerAccent,
  };

  for (const [color, expectedColor] of Object.entries(expectedColors)) {
    const { unmount } = render(<Icons.Add color={color as IconColor} />, {
      vxTheme: theme,
    });
    expect(screen.getByRole('img', { hidden: true })).toHaveStyle(
      `color: ${expectedColor};`
    );
    unmount();
  }
});

test('FullScreenIconWrapper renders child icon - portrait screen', () => {
  global.innerHeight = 1920;
  global.innerWidth = 1080;

  render(
    <FullScreenIconWrapper>
      <Icons.Info />
    </FullScreenIconWrapper>
  );

  screen.getByRole('img', { hidden: true });
});

// Testing both screen orientations to satisfy code coverage requirements:
test('FullScreenIconWrapper renders child icon - landscape screen', () => {
  global.innerHeight = 1080;
  global.innerWidth = 1920;

  render(
    <FullScreenIconWrapper>
      <Icons.Info />
    </FullScreenIconWrapper>
  );

  screen.getByRole('img', { hidden: true });
});
