import React from 'react';

import { GlobalStyles } from './global_styles';

export interface AppBaseProps {
  children: React.ReactNode;
}

/**
 * Common app container that sets up global Vx styles.
 */
export function AppBase(props: AppBaseProps): JSX.Element {
  const { children } = props;

  return (
    <React.Fragment>
      <GlobalStyles />
      {children}
    </React.Fragment>
  );
}
