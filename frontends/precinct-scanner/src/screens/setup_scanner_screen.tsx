import React, { useEffect } from 'react';
import { fontSizeTheme, Main, MainChild, Prose, Screen } from '@votingworks/ui';

function doNothing() {
  // do nothing
}

interface Props {
  useEffectToggleLargeDisplay?: () => void;
}

export function SetupScannerScreen({
  useEffectToggleLargeDisplay = doNothing,
}: Props): JSX.Element {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(useEffectToggleLargeDisplay, []);

  return (
    <Screen white>
      <Main>
        <MainChild center maxWidth={false}>
          <Prose textCenter maxWidth={false} theme={fontSizeTheme.large}>
            <h1>Scanner Not Detected</h1>
            <p>Please ask a poll worker to connect scanner.</p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  );
}
