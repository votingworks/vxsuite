import React, { useEffect } from 'react';
import { Main } from './main';
import { Prose } from './prose';
import { Screen } from './screen';
import { fontSizeTheme } from './themes';
import { H1, P } from './typography';

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
      <Main centerChild>
        <Prose
          textCenter
          maxWidth={false}
          themeDeprecated={fontSizeTheme.large}
        >
          <H1>Card Reader Not Detected</H1>
          <P>{connectMessage}</P>
        </Prose>
      </Main>
    </Screen>
  );
}
