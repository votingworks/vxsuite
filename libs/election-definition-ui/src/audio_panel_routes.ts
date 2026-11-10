import { generatePath, useRouteMatch } from 'react-router-dom';
import type { ElectionStringKey } from '@votingworks/types';

export interface AudioPanelRoutes {
  readonly panelPath: string;
  readonly isPanelOpen: boolean;
  readonly closeUrl: string;
  readonly screenUrl: (params: {
    stringKey: ElectionStringKey;
    subkey?: string;
  }) => string;
}

export function useAudioPanelRoutes(paramsPattern: string): AudioPanelRoutes {
  const { path, params } = useRouteMatch();
  const panelPath = `${path}/audio/${paramsPattern}`;
  const isPanelOpen = useRouteMatch(panelPath) !== null;
  return {
    panelPath,
    isPanelOpen,
    closeUrl: generatePath(path, params),
    screenUrl: (screenParams) =>
      generatePath(panelPath, { ...params, ...screenParams }),
  };
}
