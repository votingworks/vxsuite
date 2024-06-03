import React from 'react';

import { Optional } from '@votingworks/basics';

export interface PatDeviceContextInterface {
  isPatDeviceConnected: boolean;
}

const PatDeviceContext =
  React.createContext<Optional<PatDeviceContextInterface>>(undefined);

export function usePatDeviceContext(): Optional<PatDeviceContextInterface> {
  return React.useContext(PatDeviceContext);
}

export function useIsPatDeviceConnected(): boolean {
  return usePatDeviceContext()?.isPatDeviceConnected || false;
}

export interface PatDeviceContextProviderProps {
  children: React.ReactNode;
  isPatDeviceConnected: boolean;
}

export function PatDeviceContextProvider(
  props: PatDeviceContextProviderProps
): JSX.Element {
  const { children, isPatDeviceConnected } = props;

  return (
    <PatDeviceContext.Provider value={{ isPatDeviceConnected }}>
      {children}
    </PatDeviceContext.Provider>
  );
}
