import React from 'react';
import type { ElectionId } from '@votingworks/types';

export interface DesignShell {
  ElectionNavScreen: (props: {
    electionId: ElectionId;
    children: React.ReactNode;
  }) => JSX.Element | null;
  Header: (props: {
    className?: string;
    children: React.ReactNode;
  }) => JSX.Element;
  reportError?: (error: unknown, context?: Record<string, unknown>) => void;
}

export const DesignShellContext = React.createContext<DesignShell | undefined>(
  undefined
);

export function useDesignShell(): DesignShell {
  const shell = React.useContext(DesignShellContext);
  if (!shell) {
    throw new Error('DesignShellContext.Provider not found');
  }
  return shell;
}
