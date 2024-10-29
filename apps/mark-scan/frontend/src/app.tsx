import { BrowserRouter } from 'react-router-dom';

import { BaseLogger, LogSource } from '@votingworks/logging';
import { QueryClient } from '@tanstack/react-query';
import {
  AppBase,
  AppErrorBoundary,
  VisualModeDisabledOverlay,
} from '@votingworks/ui';
import { ColorMode, ScreenType, SizeMode } from '@votingworks/types';

import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { AppRoot } from './app_root';
import { ApiClient, createApiClient, createQueryClient } from './api';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';
import { ApiProvider } from './api_provider';

window.oncontextmenu = (e: MouseEvent): void => {
  e.preventDefault();
};

const DEFAULT_COLOR_MODE: ColorMode = 'contrastMedium';
const DEFAULT_SCREEN_TYPE: ScreenType = 'elo15';
const DEFAULT_SIZE_MODE: SizeMode = 'touchMedium';

export interface Props {
  logger?: BaseLogger;
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  enableStringTranslation?: boolean;
  noAudio?: boolean;
}

const RESTART_MESSAGE =
  'Ask a poll worker to restart the ballot marking device.';

export function App({
  logger = new BaseLogger(LogSource.VxMarkScanFrontend, window.kiosk),
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
      hideCursor={isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.HIDE_CURSOR
      )}
    >
      <BrowserRouter>
        <AppErrorBoundary restartMessage={RESTART_MESSAGE} logger={logger}>
          <ApiProvider
            queryClient={queryClient}
            apiClient={apiClient}
            enableStringTranslation={enableStringTranslation}
            noAudio={noAudio}
          >
            <VisualModeDisabledOverlay />
            <AppRoot />
            <SessionTimeLimitTracker />
          </ApiProvider>
        </AppErrorBoundary>
      </BrowserRouter>
    </AppBase>
  );
}
