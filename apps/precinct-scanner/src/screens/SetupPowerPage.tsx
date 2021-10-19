import React from 'react';

import { Main, MainChild, Prose, NoWrap } from '@votingworks/ui';

import { CenteredScreen } from '../components/Layout';

const SetupPowerPage = (): JSX.Element => {
  return (
    <CenteredScreen>
      <Main padded>
        <MainChild center>
          <Prose textCenter>
            <h1>
              No Power Detected <NoWrap>and Battery is Low</NoWrap>
            </h1>
            <p>
              Please ask a poll worker to plug-in the power cord for this
              machine.
            </p>
          </Prose>
        </MainChild>
      </Main>
    </CenteredScreen>
  );
};

export default SetupPowerPage;

/* istanbul ignore next */
export const DefaultPreview = (): JSX.Element => {
  return <SetupPowerPage />;
};
