import { appStrings, Icons, P, useMuteAudio } from '@votingworks/ui';

import {
  CenteredCardPageLayout,
  PollWorkerPrompt,
} from '@votingworks/mark-flow-ui';

export function ScannerOpenAlarmScreen(): JSX.Element {
  useMuteAudio(true);

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
