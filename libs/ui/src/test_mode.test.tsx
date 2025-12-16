import { expect, test } from 'vitest';
import { render, screen } from '../test/react_testing_library';
import { TestModeCallout } from './test_mode';
import { DesktopPalette, TouchscreenPalette } from './themes/make_theme';

test('TestModeCallout touch', () => {
  const { container } = render(<TestModeCallout viewMode="touch" />);
  const card = screen.getByText('Test Ballot Mode').closest('div');
  const icon = container.querySelector('svg');

  expect(card).toHaveStyle({ backgroundColor: TouchscreenPalette.Gray5 });
  expect(icon).toHaveStyle({ color: TouchscreenPalette.Orange50 });
});

test('TestModeCallout desktop', () => {
  const { container } = render(<TestModeCallout viewMode="desktop" />, {
    vxTheme: { colorMode: 'desktop' },
  });
  const card = container.firstChild;
  const icon = container.querySelector('svg');

  expect(card).toHaveStyle({ backgroundColor: DesktopPalette.Orange10 });
  expect(icon).toHaveStyle({ color: DesktopPalette.Orange50 });
});
