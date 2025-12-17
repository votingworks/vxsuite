import React from 'react';
import {
  appStrings,
  Icons,
  Main,
  P,
  Screen,
  H1,
  useAudioControls,
  useAudioEnabled,
} from '@votingworks/ui';
import { PollWorkerPrompt } from '@votingworks/mark-flow-ui';
import type { PollsState } from '@votingworks/types';

export interface SetupPrinterPageProps {
  isPollWorkerAuth?: boolean;
  pollsState?: PollsState;
}

export function SetupPrinterPage({
  isPollWorkerAuth,
  pollsState,
}: SetupPrinterPageProps): JSX.Element {
  const wasAudioEnabled = React.useRef(useAudioEnabled());
  const { setIsEnabled: setAudioEnabled } = useAudioControls();
  const isVoterFacingAlarmState =
    !isPollWorkerAuth &&
    (pollsState === 'polls_open' || pollsState === 'polls_paused');

  // Disable TTS audio while alarm is playing to avoid confusion
  React.useEffect(() => {
    if (!isVoterFacingAlarmState) return;

    setAudioEnabled(false);

    function restoreAudioOnExit() {
      setAudioEnabled(wasAudioEnabled.current);
    }
    return restoreAudioOnExit;
  }, [setAudioEnabled, isVoterFacingAlarmState]);

  // Voter-facing alarm state when polls are open or paused
  if (isVoterFacingAlarmState) {
    return (
      <Screen>
        <Main padded centerChild>
          <div>
            <H1>
              <Icons.Danger color="danger" />{' '}
              {appStrings.titleInternalConnectionProblem()}
            </H1>
            <P>{appStrings.notePrinterDisconnected()}</P>
            <P>{appStrings.instructionsAskForHelp()}</P>
            <PollWorkerPrompt>
              Insert a poll worker card to silence the alert. Connect the
              printer to resume voting.
            </PollWorkerPrompt>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio autoPlay loop src="/sounds/alarm.mp3" />
          </div>
        </Main>
      </Screen>
    );
  }

  // Non-alarm state (poll worker auth, or polls not open/paused)
  return (
    <Screen>
      <Main padded centerChild>
        <div>
          <H1>No Printer Detected</H1>
          <P>Please ask a poll worker to connect printer.</P>
        </div>
      </Main>
    </Screen>
  );
}
