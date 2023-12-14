import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { assert } from '@votingworks/basics';
import { App } from './app';

import {
  AriaScreenReader,
  SpeechSynthesisTextToSpeech,
  KioskTextToSpeech,
} from './utils/ScreenReader';
import { memoize } from './utils/memoize';
import { getUsEnglishVoice } from './utils/voices';

// FIXME: `?reader=on` won't be here on reload since we're using the browser
// history `pushState` API to manipulate the location. Perhaps disable that
// since we don't really care about page URLs anyway?
const readerEnabled =
  new URLSearchParams(window.location.search).get('reader') === 'on';
const screenReader = new AriaScreenReader(
  window.kiosk
    ? new KioskTextToSpeech()
    : new SpeechSynthesisTextToSpeech(memoize(getUsEnglishVoice))
);

if (readerEnabled) {
  screenReader.unmute();
} else {
  screenReader.mute();
}

const rootElement = document.getElementById('root');
assert(rootElement);
const root = createRoot(rootElement);

root.render(
  <React.Fragment>
    <App enableStringTranslation />
    <DevDock />
  </React.Fragment>
);
