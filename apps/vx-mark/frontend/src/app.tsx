import React, { useCallback, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import * as grout from '@votingworks/grout';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { Api } from '@votingworks/vx-mark-backend';

import {
  WebServiceCard,
  KioskStorage,
  LocalStorage,
  getHardware,
  isAccessibleController,
} from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AppBase,
  ErrorBoundary,
  Prose,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  Text,
} from '@votingworks/ui';
import { ColorMode } from '@votingworks/types';
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
import { ApiClientContext } from './api';

window.oncontextmenu = (e: MouseEvent): void => {
  e.preventDefault();
};

export interface Props {
  hardware?: AppRootProps['hardware'];
  card?: AppRootProps['card'];
  storage?: AppRootProps['storage'];
  screenReader?: ScreenReader;
  reload?: VoidFunction;
  logger?: AppRootProps['logger'];
  apiClient?: grout.Client<Api>;
  queryClient?: QueryClient;
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
  reload = () => window.location.reload(),
  logger = new Logger(LogSource.VxMarkFrontend, window.kiosk),
  /* istanbul ignore next */ apiClient = grout.createClient<Api>({
    baseUrl: '/api',
  }),
  queryClient = new QueryClient({
    defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
  }),
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

  // Copied from old App.css
  const baseFontSizePx = 24;

  // TODO: Default to high contrast and vary based on user selection.
  const colorMode: ColorMode = 'legacy';

  return (
    <BrowserRouter>
      <ErrorBoundary
        errorMessage={
          <Prose textCenter>
            <h1>Something went wrong</h1>
            <Text>Ask a poll worker to restart the ballot marking device.</Text>
          </Prose>
        }
      >
        <FocusManager
          screenReader={screenReader}
          onKeyDown={onKeyDown}
          onClickCapture={onClick}
          onFocusCapture={onFocus}
        >
          <ApiClientContext.Provider value={apiClient}>
            <QueryClientProvider client={queryClient}>
              <AppBase
                colorMode={colorMode}
                isTouchscreen
                legacyBaseFontSizePx={baseFontSizePx}
              >
                <AppRoot
                  card={card}
                  hardware={hardware}
                  storage={storage}
                  screenReader={screenReader}
                  reload={reload}
                  logger={logger}
                />
              </AppBase>
            </QueryClientProvider>
          </ApiClientContext.Provider>
        </FocusManager>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
