import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route } from 'react-router-dom';

import 'normalize.css';
import './App.css';

import {
  WebServiceCard,
  KioskStorage,
  LocalStorage,
  getHardware,
  getPrinter,
  isAccessibleController,
} from '@votingworks/utils';
import memoize from './utils/memoize';
import {
  ScreenReader,
  AriaScreenReader,
  SpeechSynthesisTextToSpeech,
} from './utils/ScreenReader';
import { getUSEnglishVoice } from './utils/voices';

import AppRoot, { Props as AppRootProps } from './AppRoot';
import FocusManager from './components/FocusManager';
import machineConfigProvider from './utils/machineConfig';

window.oncontextmenu = (e: MouseEvent): void => {
  e.preventDefault();
};

export interface Props {
  hardware?: AppRootProps['hardware'];
  card?: AppRootProps['card'];
  storage?: AppRootProps['storage'];
  printer?: AppRootProps['printer'];
  machineConfig?: AppRootProps['machineConfig'];
  screenReader?: ScreenReader;
}

function App({
  screenReader = new AriaScreenReader(
    new SpeechSynthesisTextToSpeech(memoize(getUSEnglishVoice))
  ),

  card = new WebServiceCard(),
  storage = window.kiosk ? new KioskStorage(window.kiosk) : new LocalStorage(),
  printer = getPrinter(),
  hardware,
  machineConfig = machineConfigProvider,
}: Props): JSX.Element {
  screenReader.mute();
  const [internalHardware, setInternalHardware] = useState(hardware);

  useEffect(() => {
    async function updateHardware() {
      if (internalHardware === undefined) {
        setInternalHardware(await getHardware());
      }
    }
    void updateHardware();
  }, [internalHardware]);

  /* istanbul ignore next - need to figure out how to test this */
  useEffect(() => {
    if (internalHardware !== undefined) {
      const subscription = internalHardware.devices.subscribe((devices) =>
        screenReader.toggleMuted(
          !Array.from(devices).some(isAccessibleController)
        )
      );
      return () => subscription.unsubscribe();
    }
  }, [internalHardware, screenReader]);

  /* istanbul ignore next - need to figure out how to test this */
  const onKeyPress = useCallback(
    async (event: React.KeyboardEvent) => {
      if (event.key === 'r') {
        await screenReader.toggle();
      }
    },
    [screenReader]
  );

  /* istanbul ignore next - need to figure out how to test this */
  const onClick = useCallback(
    ({ target }: React.MouseEvent) => {
      if (target) {
        const currentPath = window.location.pathname;

        setImmediate(async () => {
          // Only send `onClick` to the screen reader if the click didn't
          // trigger navigation and the clicked element is still here.
          if (
            window.location.pathname === currentPath &&
            document.body.contains(target as Node)
          ) {
            await screenReader.onClick(target);
          }
        });
      }
    },
    [screenReader]
  );

  /* istanbul ignore next - need to figure out how to test this */
  const onFocus = useCallback(
    ({ target }: React.FocusEvent) => {
      if (target) {
        const currentPath = window.location.pathname;

        setImmediate(async () => {
          // Only send `onFocus` to the screen reader if the focus didn't
          // trigger navigation and the focused element is still here.
          if (
            window.location.pathname === currentPath &&
            document.body.contains(target as Node)
          ) {
            await screenReader.onFocus(target);
          }
        });
      }
    },
    [screenReader]
  );
  if (internalHardware === undefined) {
    return <BrowserRouter />;
  }
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
          render={(props) => (
            <AppRoot
              card={card}
              printer={printer}
              hardware={internalHardware}
              storage={storage}
              machineConfig={machineConfig}
              screenReader={screenReader}
              {...props}
            />
          )}
        />
      </FocusManager>
    </BrowserRouter>
  );
}

export default App;
