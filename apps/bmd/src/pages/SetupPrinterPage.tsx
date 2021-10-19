import React, { useEffect } from 'react';

import { Main, MainChild } from '@votingworks/ui';

import Prose from '../components/Prose';
import Screen from '../components/Screen';

interface Props {
  useEffectToggleLargeDisplay: () => void;
}

const SetupPrinterPage = ({
  useEffectToggleLargeDisplay,
}: Props): JSX.Element => {
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
};

export default SetupPrinterPage;
