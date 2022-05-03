import React from 'react';
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
      foo
    </FocusManager>
  );
  expect(container.firstChild).toMatchSnapshot();
});
