import { test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { App } from './app';
import { render, screen } from '../test/react_testing_library';

test('renders overlay when audio-only mode is enabled', () => {
  render(<App />, {
    vxTheme: { isVisualModeDisabled: true },
  });

  userEvent.click(screen.getByText('Exit Audio-Only Mode'));
});
