import './polyfills';
import React from 'react';
import ReactDom from 'react-dom';
import { App } from './app';

import { AriaScreenReader, KioskTextToSpeech } from './utils/ScreenReader';

// FIXME: `?reader=on` won't be here on reload since we're using the browser
// history `pushState` API to manipulate the location. Perhaps disable that
// since we don't really care about page URLs anyway?
const readerEnabled =
  new URLSearchParams(window.location.search).get('reader') === 'on';
const tts = new KioskTextToSpeech(!readerEnabled);
const screenReader = new AriaScreenReader(tts);

ReactDom.render(
  <App screenReader={screenReader} />,
  document.getElementById('root') as HTMLElement
);
