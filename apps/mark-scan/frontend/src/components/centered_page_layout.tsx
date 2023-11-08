import React from 'react';

import { Font, H1, Main, Screen } from '@votingworks/ui';
import { ButtonFooter } from '@votingworks/mark-flow-ui';

export interface CenteredPageLayoutProps {
  buttons?: React.ReactNode;
  children: React.ReactNode;
  title?: React.ReactNode;
  voterFacing: boolean;
}

export function CenteredPageLayout(
  props: CenteredPageLayoutProps
): JSX.Element {
  const { buttons, children, title, voterFacing } = props;

  return (
    <Screen>
      <Main padded centerChild>
        <Font align="center" id={voterFacing ? 'audiofocus' : undefined}>
          {title && <H1>{title}</H1>}
          {children}
        </Font>
      </Main>
      {buttons && <ButtonFooter>{buttons}</ButtonFooter>}
    </Screen>
  );
}
