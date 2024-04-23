import React from 'react';
import styled from 'styled-components';

import {
  Align,
  Font,
  Main,
  ReadOnLoad as ReadOnLoadBase,
  Screen,
} from '@votingworks/ui';
import { VoterScreen, ButtonFooter } from '@votingworks/mark-flow-ui';

export interface CenteredPageLayoutProps {
  buttons?: React.ReactNode;
  children: React.ReactNode;
  voterFacing: boolean;
  textAlign?: Align;
}

const ReadOnLoad = styled(ReadOnLoadBase)`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const Content = styled(Font)`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

export function CenteredPageLayout(
  props: CenteredPageLayoutProps
): JSX.Element {
  const { buttons, children, textAlign, voterFacing } = props;

  const mainContent = (
    <Content align={textAlign || 'center'}>{children}</Content>
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
