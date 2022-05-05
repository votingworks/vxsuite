import React, { useEffect, useState } from 'react';
import { Redirect } from 'react-router-dom';

import {
  Loading,
  Main,
  MainChild,
  ProgressBar,
  Prose,
  Screen,
} from '@votingworks/ui';

export function SaveCardScreen(): JSX.Element {
  const saveDelay = 2500;
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setProgress(1);
    }, 1);
    setTimeout(() => {
      setDone(true);
    }, saveDelay);
  }, []);

  if (done) {
    return <Redirect to="/remove" />;
  }
  return (
    <Screen white>
      <Main>
        <MainChild centerVertical maxWidth={false}>
          <Prose textCenter id="audiofocus">
            <ProgressBar progress={progress} duration={saveDelay} />
            <h1>
              <Loading>Saving your votes to the card</Loading>
            </h1>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  );
}
