import React, { useState } from 'react';
import useInterval from 'use-interval';

import {
  Button,
  H1,
  Loading,
  Main,
  Screen,
  P,
  Font,
  appStrings,
  AudioOnly,
  NumberString,
  ReadOnLoad,
} from '@votingworks/ui';

import {
  IDLE_RESET_TIMEOUT_SECONDS,
  idleTimeoutWarningStringFn,
} from '../config/globals';

const timeoutSeconds = IDLE_RESET_TIMEOUT_SECONDS;

export interface IdlePageProps {
  /**
   * Called when the user clicks the "I'm still voting" button.
   */
  onDismiss?: () => void;

  /**
   * Called when the countdown ends.
   */
  onCountdownEnd?: () => void;
}

function noop(): void {
  // do nothing
}

export function IdlePage({
  onDismiss = noop,
  onCountdownEnd = noop,
}: IdlePageProps): JSX.Element {
  const [numSecondsRemaining, setNumSecondsRemaining] =
    useState(timeoutSeconds);
  const [isLoading, setIsLoading] = useState(false);

  useInterval(() => {
    if (numSecondsRemaining === 0 && !isLoading) {
      setIsLoading(true);
      onCountdownEnd();
    } else if (!isLoading) {
      setNumSecondsRemaining((previous) => previous - 1);
    }
  }, 1000);

  return (
    <Screen flexDirection="row">
      <Main centerChild padded>
        {isLoading ? (
          <Loading>{appStrings.noteBmdClearingBallot()}</Loading>
        ) : (
          <Font align="center">
            <ReadOnLoad>
              <H1>{appStrings.titleBmdIdleScreen()}</H1>
              <P>{idleTimeoutWarningStringFn()}</P>
              <AudioOnly>
                {appStrings.instructionsBmdSelectToContinue()}
              </AudioOnly>
              {numSecondsRemaining <= timeoutSeconds / 2 && (
                <React.Fragment>
                  <P>{appStrings.warningBmdInactiveTimeRemaining()}</P>
                  <P>
                    {appStrings.labelBmdSecondsRemaining()}{' '}
                    {/* TODO(kofi): Repeat audio when value changes: */}
                    <NumberString weight="bold" value={numSecondsRemaining} />
                  </P>
                </React.Fragment>
              )}
            </ReadOnLoad>
            <Button autoFocus variant="primary" onPress={onDismiss}>
              {appStrings.buttonStillVoting()}
            </Button>
          </Font>
        )}
      </Main>
    </Screen>
  );
}
