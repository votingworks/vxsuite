import {
  appStrings,
  Caption,
  H6,
  Icons,
  P,
  useAudioControls,
  useAudioEnabled,
} from '@votingworks/ui';

import React from 'react';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

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

      {/* Poll Worker strings - not translated: */}
      <H6 as="h2">
        <Icons.Info /> Poll Workers:
      </H6>
      <P>
        <Caption>
          Insert a poll worker card to silence the alert. Close and seal the
          cover to resume voting.
        </Caption>
      </P>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio autoPlay loop src="/sounds/alarm.mp3" />
    </CenteredCardPageLayout>
  );
}
