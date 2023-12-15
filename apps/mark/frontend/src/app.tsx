import React, { useCallback, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { assertDefined } from '@votingworks/basics';
import { getHardware, isAccessibleController } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AppBase,
  Button,
  ErrorBoundary,
  H1,
  P,
  Prose,
  UiStringsContextProvider,
} from '@votingworks/ui';
import { ColorMode, ScreenType, SizeMode } from '@votingworks/types';
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
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
  uiStringsApi,
} from './api';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';

window.oncontextmenu = (e: MouseEvent): void => {
  e.preventDefault();
};

const DEFAULT_COLOR_MODE: ColorMode = 'contrastMedium';
const DEFAULT_SCREEN_TYPE: ScreenType = 'elo15';
const DEFAULT_SIZE_MODE: SizeMode = 'touchMedium';

export interface Props {
  hardware?: AppRootProps['hardware'];
  screenReader?: ScreenReader;
  reload?: VoidFunction;
  logger?: AppRootProps['logger'];
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  enableStringTranslation?: boolean;
}

export function App({
  screenReader = new AriaScreenReader(
    window.kiosk
      ? new KioskTextToSpeech()
      : new SpeechSynthesisTextToSpeech(memoize(getUsEnglishVoice))
  ),
  hardware = getHardware(),
  reload = () => window.location.reload(),
  logger = new Logger(LogSource.VxMarkFrontend, window.kiosk),
  /* istanbul ignore next */ apiClient = createApiClient(),
  queryClient = createQueryClient(),
  enableStringTranslation,
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
    <AppBase
      defaultColorMode={DEFAULT_COLOR_MODE}
      defaultSizeMode={DEFAULT_SIZE_MODE}
      isTouchscreen
      screenType={DEFAULT_SCREEN_TYPE}
    >
      <BrowserRouter>
        <ErrorBoundary
          errorMessage={
            <Prose textCenter>
              <H1>Something went wrong</H1>
              <P>Ask a poll worker to restart the ballot marking device.</P>
              <P>
                <Button
                  onPress={() => assertDefined(window.kiosk).reboot()}
                  variant="primary"
                >
                  Restart
                </Button>
              </P>
            </Prose>
          }
          logger={logger}
        >
          <FocusManager
            screenReader={screenReader}
            onKeyDown={onKeyDown}
            onClickCapture={onClick}
            onFocusCapture={onFocus}
          >
            <ApiClientContext.Provider value={apiClient}>
              <QueryClientProvider client={queryClient}>
                <UiStringsContextProvider
                  api={uiStringsApi}
                  disabled={!enableStringTranslation}
                >
                  <AppRoot
                    hardware={hardware}
                    screenReader={screenReader}
                    reload={reload}
                    logger={logger}
                  />
                  <SessionTimeLimitTracker />
                </UiStringsContextProvider>
              </QueryClientProvider>
            </ApiClientContext.Provider>
          </FocusManager>
        </ErrorBoundary>
      </BrowserRouter>
    </AppBase>
  );
}
