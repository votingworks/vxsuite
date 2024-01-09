import React from 'react';

import { Font, H1, Main, ReadOnLoad, Screen } from '@votingworks/ui';
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

  const mainContent = (
    <Font align="center">
      {title && <H1>{title}</H1>}
      {children}
    </Font>
  );

  return (
    <Screen>
      <Main padded centerChild>
        {voterFacing ? <ReadOnLoad>{mainContent}</ReadOnLoad> : mainContent}
      </Main>
      {buttons && <ButtonFooter>{buttons}</ButtonFooter>}
    </Screen>
  );
}
