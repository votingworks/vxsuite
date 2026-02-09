import { expect, test } from 'vitest';
import { render, screen } from '../test/react_testing_library';
import { EarlyVotingCallout } from './early_voting_callout';
import { DesktopPalette, TouchscreenPalette } from './themes/make_theme';

test('EarlyVotingCallout touch', () => {
  const { container } = render(<EarlyVotingCallout viewMode="touch" />);
  const card = screen.getByText('Early Voting').closest('div');
  const icon = container.querySelector('svg');

  expect(card).toHaveStyle({
    borderColor: TouchscreenPalette.Purple80,
    backgroundColor: TouchscreenPalette.Gray5,
  });
  expect(icon).toHaveStyle({ color: TouchscreenPalette.Purple80 });
});

test('EarlyVotingCallout desktop', () => {
  const { container } = render(<EarlyVotingCallout viewMode="desktop" />, {
    vxTheme: { colorMode: 'desktop' },
  });
  const card = container.firstChild;
  const icon = container.querySelector('svg');

  expect(card).toHaveStyle({
    backgroundColor: DesktopPalette.Purple20,
  });
  expect(icon).toHaveStyle({ color: DesktopPalette.Purple80 });
});
