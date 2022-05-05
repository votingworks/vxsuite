import React, { useEffect } from 'react';

import { Main, MainChild, Screen, Prose } from '@votingworks/ui';

interface Props {
  useEffectToggleLargeDisplay: () => void;
}

export function SetupPrinterPage({
  useEffectToggleLargeDisplay,
}: Props): JSX.Element {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(useEffectToggleLargeDisplay, []);

  return (
    <Screen white>
      <Main padded>
        <MainChild center>
          <Prose textCenter>
            <h1>No Printer Detected</h1>
            <p>Please ask a poll worker to connect printer.</p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  );
}
