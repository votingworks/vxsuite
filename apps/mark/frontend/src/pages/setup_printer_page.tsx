import React, { useEffect } from 'react';

import { Main, Screen, Prose, H1, P } from '@votingworks/ui';

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
      <Main padded centerChild>
        <Prose textCenter>
          <H1>No Printer Detected</H1>
          <P>Please ask a poll worker to connect printer.</P>
        </Prose>
      </Main>
    </Screen>
  );
}
