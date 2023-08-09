import { useState } from 'react';
import pluralize from 'pluralize';
import useInterval from 'use-interval';

import { Button, H1, Loading, Main, Prose, Screen, P } from '@votingworks/ui';

import {
  IDLE_RESET_TIMEOUT_SECONDS,
  IDLE_TIMEOUT_SECONDS,
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
  const [countdown, setCountdown] = useState(timeoutSeconds);
  const [isLoading, setIsLoading] = useState(false);

  useInterval(() => {
    if (countdown === 0 && !isLoading) {
      setIsLoading(true);
      onCountdownEnd();
    } else if (!isLoading) {
      setCountdown((previous) => previous - 1);
    }
  }, 1000);

  return (
    <Screen navRight>
      <Main centerChild>
        {isLoading ? (
          <Loading>Clearing ballot</Loading>
        ) : (
          <Prose textCenter>
            <H1 aria-label="Are you still voting?">Are you still voting?</H1>
            <P>
              This voting station has been inactive for more than{' '}
              {pluralize('minute', IDLE_TIMEOUT_SECONDS / 60, true)}.
            </P>
            {countdown <= timeoutSeconds / 2 && (
              <P>
                To protect your privacy, this ballot will be cleared in{' '}
                <strong>{pluralize('second', countdown, true)}</strong>.
              </P>
            )}
            <Button variant="primary" onPress={onDismiss}>
              Yes, I’m still voting.
            </Button>
          </Prose>
        )}
      </Main>
    </Screen>
  );
}
