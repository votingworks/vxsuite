import React from 'react';
import { mockOf } from '@votingworks/test-utils';
import { assertDefined } from '@votingworks/basics';
import { LanguageCode } from '@votingworks/types';
import { WithAltAudio } from './with_alt_audio';
import { newTestContext } from '../../test/ui_strings/test_utils';
import { useAudioContext } from './audio_context';
import { AudioOnly } from './audio_only';
import { act, screen, waitFor } from '../../test/react_testing_library';
import { useCurrentLanguage } from '../hooks/use_current_language';

jest.mock('./audio_only', (): typeof import('./audio_only') => ({
  ...jest.requireActual('./audio_only'),
  AudioOnly: jest.fn(),
}));

const { ENGLISH, SPANISH } = LanguageCode;

function getMockAudioOnlyContentPrefix(languageCode: LanguageCode) {
  return `[${languageCode}]`;
}

function TestTextOnlyString(props: { children: React.ReactNode }) {
  const audioContext = useAudioContext();
  expect(audioContext).toBeUndefined();

  return <span data-testid="textOnly" {...props} />;
}

beforeEach(() => {
  mockOf(AudioOnly).mockImplementation((props) => {
    const { children, ...rest } = props;
    const languageCode = useCurrentLanguage();

    const audioContext = useAudioContext();
    expect(audioContext).toBeDefined();

    return (
      <span data-testid="audioOnly" {...rest}>
        [{languageCode}] {children}
      </span>
    );
  });
});

test('with audio in user language', async () => {
  const { getLanguageContext, render } = newTestContext();

  render(
    <WithAltAudio audioText="Audio-Only String">
      <TestTextOnlyString>Text-Only String</TestTextOnlyString>
    </WithAltAudio>
  );

  await waitFor(() => expect(getLanguageContext()).toBeDefined());

  const { setLanguage } = assertDefined(getLanguageContext());
  act(() => setLanguage(SPANISH));

  expect(screen.getByTestId('textOnly')).toHaveTextContent('Text-Only String');
  expect(screen.getByTestId('audioOnly')).toHaveTextContent(
    `${getMockAudioOnlyContentPrefix(SPANISH)} Audio-Only String`
  );
});

test('with audio language override', async () => {
  const { getLanguageContext, render } = newTestContext();

  render(
    <WithAltAudio audioText="Audio-Only String" audioLanguageOverride={ENGLISH}>
      <TestTextOnlyString>Text-Only String</TestTextOnlyString>
    </WithAltAudio>
  );

  await waitFor(() => expect(getLanguageContext()).toBeDefined());

  const { setLanguage } = assertDefined(getLanguageContext());
  act(() => setLanguage(SPANISH));

  expect(screen.getByTestId('textOnly')).toHaveTextContent('Text-Only String');
  expect(screen.getByTestId('audioOnly')).toHaveTextContent(
    `${getMockAudioOnlyContentPrefix(ENGLISH)} Audio-Only String`
  );
});
