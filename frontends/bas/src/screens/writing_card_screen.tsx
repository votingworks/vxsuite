import React, { useState, useEffect } from 'react';
import { BallotStyleId } from '@votingworks/types';

import { Screen } from '@votingworks/ui';

import { Prose } from '../components/prose';
import { Main, MainChild } from '../components/main';
import { ProgressBar } from '../components/progress_bar';

interface Props {
  precinctName: string;
  ballotStyleId: BallotStyleId;
}

export function WritingCardScreen({
  ballotStyleId,
  precinctName,
}: Props): JSX.Element {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setTimeout(() => {
      setProgress(1);
    }, 0);
  }, []);

  return (
    <Screen flexDirection="column">
      <Main>
        <MainChild center>
          <Prose textCenter>
            <p>
              <ProgressBar progress={progress} />
            </p>
            <h1>Encoding card…</h1>
            <p>
              {precinctName} / {ballotStyleId}
            </p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  );
}
