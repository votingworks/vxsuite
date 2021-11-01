import React from 'react';
import { Screen, Main, MainChild, Prose, fontSizeTheme } from '@votingworks/ui';
import { ElectionInfoBar, InfoBarMode } from './ElectionInfoBar';

interface CenteredScreenProps {
  children: React.ReactNode;
  infoBar?: boolean;
  infoBarMode?: InfoBarMode;
}

export function CenteredScreen({
  children,
  infoBar = true,
  infoBarMode,
}: CenteredScreenProps): JSX.Element {
  return (
    <Screen flexDirection="column">
      <Main padded>
        <MainChild center maxWidth={false}>
          {children}
        </MainChild>
      </Main>
      {infoBar && <ElectionInfoBar mode={infoBarMode} />}
    </Screen>
  );
}

interface CenteredLargeProseProps {
  children: React.ReactNode;
}

export function CenteredLargeProse({
  children,
}: CenteredLargeProseProps): JSX.Element {
  return (
    <Prose textCenter maxWidth={false} theme={fontSizeTheme.large}>
      {children}
    </Prose>
  );
}
