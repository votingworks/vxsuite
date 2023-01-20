import React, { useCallback, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';

import 'normalize.css';
import './App.css';

import {
  WebServiceCard,
  KioskStorage,
  LocalStorage,
  getHardware,
  isAccessibleController,
} from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { memoize } from './utils/memoize';
import {
  ScreenReader,
  AriaScreenReader,
  SpeechSynthesisTextToSpeech,
  KioskTextToSpeech,
} from './utils/ScreenReader';
import { getUsEnglishVoice } from './utils/voices';

import { AppRoot, Props as AppRootProps } from './app_root';
import { FocusManager } from './components/focus_manager';
import { machineConfigProvider } from './utils/machine_config';

window.oncontextmenu = (e: MouseEvent): void => {
  e.preventDefault();
};

export interface Props {
  hardware?: AppRootProps['hardware'];
  card?: AppRootProps['card'];
  storage?: AppRootProps['storage'];
  machineConfig?: AppRootProps['machineConfig'];
  screenReader?: ScreenReader;
  reload?: VoidFunction;
  logger?: AppRootProps['logger'];
}

export function App({
  screenReader = new AriaScreenReader(
    window.kiosk
      ? new KioskTextToSpeech()
      : new SpeechSynthesisTextToSpeech(memoize(getUsEnglishVoice))
  ),

  card = new WebServiceCard(),
  storage = window.kiosk ? new KioskStorage(window.kiosk) : new LocalStorage(),
  hardware = getHardware(),
  machineConfig = machineConfigProvider,
  reload = () => window.location.reload(),
  logger = new Logger(LogSource.VxMarkFrontend, window.kiosk),
}: Props): JSX.Element {
  screenReader.mute();
  /* istanbul ignore next - need to figure out how to test this */
  useEffect(() => {
    const unsubscribe = hardware.devices.subscribe((devices) =>
      screenReader.toggleMuted(
        !Array.from(devices).some(isAccessibleController)
      )
    );
    return unsubscribe;
  }, [hardware, screenReader]);

  const onKeyDown = useCallback(
    async (event: React.KeyboardEvent) => {
      if (event.key === 'r') {
        await screenReader.toggle();
      } else if (event.key === 'F17') {
        screenReader.changeVolume();
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
  return (
    <BrowserRouter>
      <FocusManager
        screenReader={screenReader}
        onKeyDown={onKeyDown}
        onClickCapture={onClick}
        onFocusCapture={onFocus}
      >
        <AppRoot
          card={card}
          hardware={hardware}
          storage={storage}
          machineConfig={machineConfig}
          screenReader={screenReader}
          reload={reload}
          logger={logger}
        />
      </FocusManager>
    </BrowserRouter>
  );
}
