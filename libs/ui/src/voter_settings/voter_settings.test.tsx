import { expect, test, vi } from 'vitest';
import { ThemeConsumer } from 'styled-components';
import type { UiTheme } from '@votingworks/types';
import { mockUseAudioControls } from '@votingworks/test-utils';
import { userEvent } from '../user_event.js';
import { render, screen } from '../../test/react_testing_library.js';
import { VoterSettings } from './index.js';

const mockAudioControls = mockUseAudioControls(vi.fn);

vi.mock(import('../hooks/use_audio_controls.js'), async (importActual) => ({
  ...(await importActual()),
  useAudioControls: () => mockAudioControls,
}));

test('renders expected subcomponents', () => {
  render(<VoterSettings onClose={vi.fn()} />);

  screen.getByRole('heading', { name: 'Settings' });
  screen.getByRole('tablist', { name: 'Settings' });
  screen.getByRole('tabpanel');
  screen.getByRole('radiogroup', { name: 'Color Contrast Settings' });
});

test('changes tab pane on tab bar events', async () => {
  render(<VoterSettings onClose={vi.fn()} />);

  screen.getByRole('radiogroup', { name: 'Color Contrast Settings' });

  await userEvent.click(screen.getByRole('tab', { name: /size/i }));

  screen.getByRole('radiogroup', { name: 'Text Size Settings' });
});

test('renders "Audio" tab when enabled', async () => {
  render(<VoterSettings onClose={vi.fn()} allowAudioVideoOnlyToggles />);

  await userEvent.click(screen.getByRole('tab', { name: /Audio/i }));
  screen.getByRole('button', { name: 'Enable Audio-Only Mode' });
});

test('does not render "Audio" tab when not enabled', () => {
  render(
    <VoterSettings onClose={vi.fn()} allowAudioVideoOnlyToggles={false} />
  );

  expect(screen.queryByText('Audio')).toBeNull();
});

test('resets button resets all voter settings', async () => {
  let currentTheme: UiTheme | null = null;

  function TestComponent(): JSX.Element {
    return (
      <ThemeConsumer>
        {(theme) => {
          currentTheme = theme;
          return <VoterSettings onClose={vi.fn()} />;
        }}
      </ThemeConsumer>
    );
  }

  render(<TestComponent />, {
    vxTheme: { colorMode: 'contrastHighDark', sizeMode: 'touchLarge' },
  });

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'touchLarge',
    })
  );

  await userEvent.click(screen.getByRole('tab', { name: /color/i }));
  await userEvent.click(screen.getByRole('radio', { name: /gray text/i }));

  await userEvent.click(screen.getByRole('tab', { name: /size/i }));
  await userEvent.click(screen.getByRole('radio', { name: /small/i }));

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchSmall',
    })
  );

  expect(mockAudioControls.reset).not.toHaveBeenCalled();

  await userEvent.click(screen.getButton('Reset'));

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'touchLarge',
    })
  );

  expect(mockAudioControls.reset).toHaveBeenCalledTimes(1);
});

test('done button fires onClose event', async () => {
  const onClose = vi.fn();
  render(<VoterSettings onClose={onClose} />);

  expect(onClose).not.toHaveBeenCalled();

  await userEvent.click(screen.getButton('Done'));

  expect(onClose).toHaveBeenCalled();
});
