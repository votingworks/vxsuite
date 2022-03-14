import React, { useEffect } from 'react';
import { fontSizeTheme, Main, MainChild, Prose, Screen } from '.';

function doNothing() {
  // do nothing
}

interface Props {
  useEffectToggleLargeDisplay?: () => void;
  usePollWorkerLanguage?: boolean;
}

export function SetupCardReaderPage({
  useEffectToggleLargeDisplay = doNothing,
  usePollWorkerLanguage = true,
}: Props): JSX.Element {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(useEffectToggleLargeDisplay, []);

  const connectMessage = usePollWorkerLanguage
    ? 'Please ask a poll worker to connect card reader.'
    : 'Please connect the card reader to continue.';

  return (
    <Screen white>
      <Main>
        <MainChild center maxWidth={false}>
          <Prose textCenter maxWidth={false} theme={fontSizeTheme.large}>
            <h1>Card Reader Not Detected</h1>
            <p>{connectMessage}</p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  );
}
