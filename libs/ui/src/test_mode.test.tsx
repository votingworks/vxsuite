import { expect, test } from 'vitest';
import { render, screen } from '../test/react_testing_library';
import { TestModeBanner } from './test_mode';
import {
  DesktopPalette,
  makeTheme,
  TouchscreenPalette,
} from './themes/make_theme';

test('TestModeBanner touch locks to medium size and contrast', () => {
  const mediumTheme = makeTheme({
    colorMode: 'contrastMedium',
    sizeMode: 'touchMedium',
  });
  const extraLargeTheme = makeTheme({
    colorMode: 'contrastHighLight',
    sizeMode: 'touchExtraLarge',
  });

  // Verify the themes actually differ so the test is meaningful
  expect(mediumTheme.sizes.fontDefault).not.toBe(
    extraLargeTheme.sizes.fontDefault
  );

  render(<TestModeBanner />, {
    vxTheme: { colorMode: 'contrastHighLight', sizeMode: 'touchExtraLarge' },
  });
  const banner = screen.getByText('Test Ballot Mode').closest('div');

  expect(banner).toHaveStyle({
    backgroundColor: TouchscreenPalette.Orange30,
  });
  // Should use touchMedium font size (px), not touchExtraLarge
  expect(banner).toHaveStyle({
    fontSize: `${mediumTheme.sizes.fontDefault}px`,
  });
});

test('TestModeBanner desktop', () => {
  render(<TestModeBanner />, {
    vxTheme: { colorMode: 'desktop', sizeMode: 'desktop' },
  });
  const banner = screen.getByText('Test Ballot Mode').closest('div');

  expect(banner).toHaveStyle({
    backgroundColor: DesktopPalette.Orange30,
  });
});
