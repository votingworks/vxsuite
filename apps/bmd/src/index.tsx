import 'abortcontroller-polyfill/dist/polyfill-patch-fetch'
import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import SampleApp from './SampleApp'

import * as serviceWorker from './serviceWorker'
import {
  AriaScreenReader,
  SpeechSynthesisTextToSpeech,
} from './utils/ScreenReader'
import memoize from './utils/memoize'
import { getUSEnglishVoice } from './utils/voices'

const isSampleApp = window.location.hash === '#sample'
// FIXME: `?reader=on` won't be here on reload since we're using the browser
// history `pushState` API to manipulate the location. Perhaps disable that
// since we don't really care about page URLs anyway?
const readerEnabled =
  new URLSearchParams(window.location.search).get('reader') === 'on'
const tts = new SpeechSynthesisTextToSpeech(memoize(getUSEnglishVoice))
const screenReader = new AriaScreenReader(tts)

if (readerEnabled) {
  tts.unmute()
} else {
  tts.mute()
}

ReactDOM.render(
  isSampleApp ? (
    <SampleApp screenReader={screenReader} />
  ) : (
    <App screenReader={screenReader} />
  ),
  document.getElementById('root')!
)

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.unregister()
