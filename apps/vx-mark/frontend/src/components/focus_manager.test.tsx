import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../../test/test_utils';

import { FocusManager } from './focus_manager';
import {
  AriaScreenReader,
  SpeechSynthesisTextToSpeech,
} from '../utils/ScreenReader';

it('renders FocusManager', () => {
  const { container } = render(
    <FocusManager
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    >
      <div>foo</div>
    </FocusManager>
  );
  expect(container).toMatchSnapshot();
});

it('focuses the element with id audiofocus', async () => {
  render(
    <FocusManager
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    >
      <button type="button">dont focus me</button>
      <button type="button" id="audiofocus">
        focus me
      </button>
    </FocusManager>
  );
  await waitFor(() => expect(screen.getByText('focus me')).toHaveFocus());
  expect(screen.getByText('dont focus me')).not.toHaveFocus();
});
