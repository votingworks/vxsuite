import React from 'react'
import { render } from '../../test/testUtils'

import FocusManager from './FocusManager'
import {
  AriaScreenReader,
  SpeechSynthesisTextToSpeech,
} from '../utils/ScreenReader'

it('renders FocusManager', async () => {
  const { container } = render(
    <FocusManager
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    >
      foo
    </FocusManager>
  )
  expect(container.firstChild).toMatchSnapshot()
})
