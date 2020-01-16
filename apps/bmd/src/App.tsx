import React, { useState, useCallback } from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import 'normalize.css'
import './App.css'

import memoize from './utils/memoize'
import {
  ScreenReader,
  AriaScreenReader,
  SpeechSynthesisTextToSpeech,
  NullTextToSpeech,
  TextToSpeech,
} from './utils/ScreenReader'
import { WebServiceCard } from './utils/Card'
import { LocalStorage } from './utils/Storage'
import { getUSEnglishVoice } from './utils/voices'
import getPrinter from './utils/printer'
import { getHardware } from './utils/Hardware'

import AppRoot, { Props as AppRootProps, AppStorage } from './AppRoot'
import FocusManager from './components/FocusManager'

window.oncontextmenu = (e: MouseEvent): void => {
  e.preventDefault()
}

export interface Props {
  hardware?: AppRootProps['hardware']
  card?: AppRootProps['card']
  storage?: AppRootProps['storage']
  printer?: AppRootProps['printer']
  tts?: {
    enabled: TextToSpeech
    disabled: TextToSpeech
  }
}

const App = ({
  tts = {
    enabled: new SpeechSynthesisTextToSpeech(memoize(getUSEnglishVoice)),
    disabled: new NullTextToSpeech(),
  },
  card = new WebServiceCard(),
  storage = new LocalStorage<AppStorage>(),
  printer = getPrinter(),
  hardware = getHardware(),
}: Props) => {
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false)
  const [screenReader, setScreenReader] = useState<ScreenReader>(
    new AriaScreenReader(tts.disabled)
  )

  /* istanbul ignore next - need to figure out how to test this */
  const onKeyPress = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'r') {
        if (screenReaderEnabled) {
          screenReader.onScreenReaderDisabled()
          setScreenReader(new AriaScreenReader(tts.disabled))
          setScreenReaderEnabled(false)
        } else {
          const newScreenReader = new AriaScreenReader(tts.enabled)
          setScreenReader(newScreenReader)
          setScreenReaderEnabled(true)
          newScreenReader.onScreenReaderEnabled()
        }
      }
    },
    [
      screenReader,
      setScreenReader,
      screenReaderEnabled,
      setScreenReaderEnabled,
      tts.disabled,
      tts.enabled,
    ]
  )

  /* istanbul ignore next - need to figure out how to test this */
  const onClick = useCallback(
    ({ target }: React.MouseEvent) => {
      if (target) {
        const currentPath = window.location.pathname

        setImmediate(() => {
          // Only send `onClick` to the screen reader if the click didn't
          // trigger navigation and the clicked element is still here.
          if (
            window.location.pathname === currentPath &&
            document.body.contains(target as Node)
          ) {
            screenReader.onClick(target)
          }
        })
      }
    },
    [screenReader]
  )

  /* istanbul ignore next - need to figure out how to test this */
  const onFocus = useCallback(
    ({ target }: React.FocusEvent) => {
      if (target) {
        const currentPath = window.location.pathname

        setImmediate(() => {
          // Only send `onFocus` to the screen reader if the focus didn't
          // trigger navigation and the focused element is still here.
          if (
            window.location.pathname === currentPath &&
            document.body.contains(target as Node)
          ) {
            screenReader.onFocus(target)
          }
        })
      }
    },
    [screenReader]
  )
  return (
    <BrowserRouter>
      <FocusManager
        screenReader={screenReader}
        onKeyPress={onKeyPress}
        onClickCapture={onClick}
        onFocusCapture={onFocus}
      >
        <Route
          path="/"
          render={props => (
            <AppRoot
              card={card}
              printer={printer}
              hardware={hardware}
              storage={storage}
              {...props}
            />
          )}
        />
      </FocusManager>
    </BrowserRouter>
  )
}

export default App
