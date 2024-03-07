import { BrowserRouter } from 'react-router-dom';

import { getHardware } from '@votingworks/utils';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { QueryClient } from '@tanstack/react-query';
import {
  AppBase,
  AppErrorBoundary,
  VisualModeDisabledOverlay,
} from '@votingworks/ui';
import { ColorMode, ScreenType, SizeMode } from '@votingworks/types';

import { AppRoot, Props as AppRootProps } from './app_root';
import { ApiClient, createApiClient, createQueryClient } from './api';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';
import { ApiProvider } from './api_provider';

window.oncontextmenu = (e: MouseEvent): void => {
  e.preventDefault();
};

const DEFAULT_COLOR_MODE: ColorMode = 'contrastMedium';
const DEFAULT_SCREEN_TYPE: ScreenType = 'elo15';
const DEFAULT_SIZE_MODE: SizeMode = 'touchMedium';

const RESTART_MESSAGE =
  'Ask a poll worker to restart the ballot marking device.';

export interface Props {
  hardware?: AppRootProps['hardware'];
  reload?: VoidFunction;
  logger?: AppRootProps['logger'];
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  enableStringTranslation?: boolean;
  noAudio?: boolean;
}

export function App({
  hardware = getHardware(),
  reload = () => window.location.reload(),
  logger = new BaseLogger(LogSource.VxMarkFrontend, window.kiosk),
  /* istanbul ignore next */ apiClient = createApiClient(),
  queryClient = createQueryClient(),
  enableStringTranslation,
  noAudio,
}: Props): JSX.Element {
  return (
    <AppBase
      defaultColorMode={DEFAULT_COLOR_MODE}
      defaultSizeMode={DEFAULT_SIZE_MODE}
      screenType={DEFAULT_SCREEN_TYPE}
    >
      <BrowserRouter>
        <AppErrorBoundary restartMessage={RESTART_MESSAGE} logger={logger}>
          <ApiProvider
            queryClient={queryClient}
            apiClient={apiClient}
            enableStringTranslation={enableStringTranslation}
            noAudio={noAudio}
          >
            <AppErrorBoundary
              restartMessage={RESTART_MESSAGE}
              showRestartButton
              logger={logger}
            >
              <VisualModeDisabledOverlay />
              <AppRoot hardware={hardware} reload={reload} logger={logger} />
              <SessionTimeLimitTracker />
            </AppErrorBoundary>
          </ApiProvider>
        </AppErrorBoundary>
      </BrowserRouter>
    </AppBase>
  );
}
