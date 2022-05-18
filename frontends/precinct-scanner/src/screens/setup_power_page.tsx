import React from 'react';

import { Main, Prose, NoWrap } from '@votingworks/ui';

import { ScreenMainCenterChild } from '../components/layout';

export function SetupPowerPage(): JSX.Element {
  return (
    <ScreenMainCenterChild>
      <Main padded centerChild>
        <Prose textCenter>
          <h1>
            No Power Detected <NoWrap>and Battery is Low</NoWrap>
          </h1>
          <p>
            Please ask a poll worker to plug-in the power cord for this machine.
          </p>
        </Prose>
      </Main>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <SetupPowerPage />;
}
