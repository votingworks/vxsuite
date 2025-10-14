import { H1, InsertCardImage, Main, Screen } from '@votingworks/ui';
import React from 'react';

export function MachineLockedScreen(): JSX.Element | null {
  return (
    <Screen>
      <Main centerChild>
        <React.Fragment>
          <InsertCardImage cardInsertionDirection="right" />
          <H1 align="center" style={{ maxWidth: '36rem' }}>
            Insert a system administrator or election manager card to configure
            VxPrint
          </H1>
        </React.Fragment>
      </Main>
    </Screen>
  );
}
