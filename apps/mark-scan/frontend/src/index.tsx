import './polyfills';
import React from 'react';
import ReactDom from 'react-dom';
import { DevDock } from '@votingworks/dev-dock-frontend';
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

// @ts-expect-error `hot` prop does not exist on ImportMeta, but we explicity check for it
// so we can disable hot reloading for limited hardware
// https://vitejs.dev/guide/api-hmr.html#required-conditional-guard
if (import.meta.hot) {
  // @ts-expect-error Disable hot reloading
  // https://vitejs.dev/guide/api-hmr.html#hot-invalidate-message-string
  import.meta.hot.accept(() => import.meta.hot.invalidate());
}

if (readerEnabled) {
  screenReader.unmute();
} else {
  screenReader.mute();
}

ReactDom.render(
  <React.Fragment>
    <App screenReader={screenReader} />
    <DevDock />
  </React.Fragment>,
  document.getElementById('root') as HTMLElement
);
