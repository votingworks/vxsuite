import React from 'react';
import type { ElectionId } from '@votingworks/types';
import type { ApiClient } from './api.js';
import { buildDesignRoutes, type DesignRoutes } from './routes.js';

export interface DesignContextValue {
  apiClient: ApiClient;
  basePath: string;
  ElectionNavScreen: (props: {
    electionId: ElectionId;
    children: React.ReactNode;
  }) => JSX.Element | null;
  Header: (props: {
    className?: string;
    children: React.ReactNode;
  }) => JSX.Element;
  reportError?: (error: unknown, context?: Record<string, unknown>) => void;
  saveFile?: (data: Uint8Array, fileName: string) => Promise<void>;
}

export const DesignContext = React.createContext<
  DesignContextValue | undefined
>(undefined);

export function useDesignContext(): DesignContextValue {
  const context = React.useContext(DesignContext);
  if (!context) {
    throw new Error('DesignContext.Provider not found');
  }
  return context;
}

export function useDesignRoutes(): DesignRoutes {
  const { basePath } = useDesignContext();
  return React.useMemo(() => buildDesignRoutes(basePath), [basePath]);
}
