import { BrowserRouter } from 'react-router-dom';

import { assertDefined } from '@votingworks/basics';
import { getHardware } from '@votingworks/utils';
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

import { AppRoot, Props as AppRootProps } from './app_root';
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
  reload?: VoidFunction;
  logger?: AppRootProps['logger'];
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  enableStringTranslation?: boolean;
}

export function App({
  hardware = getHardware(),
  reload = () => window.location.reload(),
  logger = new Logger(LogSource.VxMarkFrontend, window.kiosk),
  /* istanbul ignore next */ apiClient = createApiClient(),
  queryClient = createQueryClient(),
  enableStringTranslation,
}: Props): JSX.Element {
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
          <ApiClientContext.Provider value={apiClient}>
            <QueryClientProvider client={queryClient}>
              <UiStringsContextProvider
                api={uiStringsApi}
                disabled={!enableStringTranslation}
              >
                <AppRoot hardware={hardware} reload={reload} logger={logger} />
                <SessionTimeLimitTracker />
              </UiStringsContextProvider>
            </QueryClientProvider>
          </ApiClientContext.Provider>
        </ErrorBoundary>
      </BrowserRouter>
    </AppBase>
  );
}
