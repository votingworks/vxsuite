import React from 'react';

import { Font, H1, Main, ReadOnLoad, Screen } from '@votingworks/ui';
import { VoterScreen, ButtonFooter } from '@votingworks/mark-flow-ui';

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

  if (voterFacing) {
    return (
      <VoterScreen actionButtons={buttons} centerContent padded>
        <ReadOnLoad>{mainContent}</ReadOnLoad>
      </VoterScreen>
    );
  }

  return (
    <Screen>
      <Main padded centerChild>
        {mainContent}
      </Main>
      {buttons && <ButtonFooter>{buttons}</ButtonFooter>}
    </Screen>
  );
}
