import {
  appStrings,
  Icons,
  P,
  useAudioControls,
  useAudioEnabled,
} from '@votingworks/ui';

import React from 'react';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';
import { PollWorkerPrompt } from '../components/poll_worker_prompt';

export function ScannerOpenAlarmScreen(): JSX.Element {
  const wasAudioEnabled = React.useRef(useAudioEnabled());
  const { setIsEnabled: setAudioEnabled } = useAudioControls();

  React.useEffect(() => {
    setAudioEnabled(false);

    function restoreAudioOnExit() {
      setAudioEnabled(wasAudioEnabled.current);
    }
    return restoreAudioOnExit;
  }, [setAudioEnabled]);

  return (
    <CenteredCardPageLayout
      icon={<Icons.Danger color="danger" />}
      title={appStrings.titlePrinterCoverIsOpen()}
      voterFacing
    >
      <P>{appStrings.instructionsBmdClosePrinterCover()}</P>
      <P>{appStrings.instructionsAskForHelp()}</P>
      <PollWorkerPrompt>
        Insert a poll worker card to silence the alert. Close and seal the cover
        to resume voting.
      </PollWorkerPrompt>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio autoPlay loop src="/sounds/alarm.mp3" />
    </CenteredCardPageLayout>
  );
}
