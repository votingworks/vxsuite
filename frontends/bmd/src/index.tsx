import './polyfills';
import React from 'react';
import ReactDom from 'react-dom';
import { App } from './app';

import {
  AriaScreenReader,
  SpeechSynthesisTextToSpeech,
} from './utils/ScreenReader';
import { memoize } from './utils/memoize';
import { getUsEnglishVoice } from './utils/voices';

// FIXME: `?reader=on` won't be here on reload since we're using the browser
// history `pushState` API to manipulate the location. Perhaps disable that
// since we don't really care about page URLs anyway?
const readerEnabled =
  new URLSearchParams(window.location.search).get('reader') === 'on';
const tts = new SpeechSynthesisTextToSpeech(memoize(getUsEnglishVoice));
const screenReader = new AriaScreenReader(tts);

if (readerEnabled) {
  tts.unmute();
} else {
  tts.mute();
}

ReactDom.render(
  <App screenReader={screenReader} />,
  document.getElementById('root') as HTMLElement
);
