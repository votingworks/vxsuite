import React from 'react';
import type { Optional } from '@votingworks/basics';
import type { ElectionDefinitionReactQueryApi } from './api.js';

export interface UnexpectedErrorContext {
  action: string;
}

export type ReportUnexpectedError = (
  error: unknown,
  context: UnexpectedErrorContext
) => void;

export interface ElectionDefinitionContextInterface {
  api: ElectionDefinitionReactQueryApi;
  reportUnexpectedError?: ReportUnexpectedError;
}

export const ElectionDefinitionContext =
  React.createContext<Optional<ElectionDefinitionContextInterface>>(undefined);

export function useElectionDefinitionApi(): ElectionDefinitionReactQueryApi {
  const context = React.useContext(ElectionDefinitionContext);
  if (context === undefined) {
    throw new Error('the ElectionDefinition API was not provided');
  }
  return context.api;
}

export interface ElectionDefinitionContextProviderProps {
  api: ElectionDefinitionReactQueryApi;
  reportUnexpectedError?: ReportUnexpectedError;
  children: React.ReactNode;
}

export function ElectionDefinitionContextProvider(
  props: ElectionDefinitionContextProviderProps
): React.ReactNode {
  const { api, reportUnexpectedError, children } = props;

  return (
    <ElectionDefinitionContext.Provider value={{ api, reportUnexpectedError }}>
      {children}
    </ElectionDefinitionContext.Provider>
  );
}
