import { appStrings, Caption, H1, Icons, P } from '@votingworks/ui';
import { useEffect } from 'react';
import { PollsState } from '@votingworks/types';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';
import * as api from '../api';

interface Props {
  disableAlarm?: boolean;
  pollsState: PollsState;
}

export function InsertUsbScreen({
  disableAlarm,
  pollsState,
}: Props): JSX.Element {
  const enableAlarm = !disableAlarm && pollsState === 'polls_open';

  const playSound = api.playSound.useMutation().mutate;
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (enableAlarm) {
      interval = setInterval(() => playSound({ name: 'alarm' }), 2000);
    }
    return () => clearInterval(interval);
  }, [enableAlarm, playSound]);

  return (
    <ScreenMainCenterChild
      showTestModeBanner={false}
      voterFacing={pollsState === 'polls_open'}
    >
      <CenteredText>
        <H1>No USB Drive Detected</H1>
        <P>
          {pollsState === 'polls_open'
            ? /* Translate this instruction for the voter but leave all else in English for the
                poll worker */
              appStrings.instructionsAskForHelp()
            : 'Insert a USB drive into the USB hub.'}
        </P>
        {enableAlarm && (
          <Caption>
            <Icons.Warning color="warning" /> Insert a poll worker card to
            dismiss the alarm.
          </Caption>
        )}
      </CenteredText>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next - @preserve */
export function PollsClosedPreview(): JSX.Element {
  return <InsertUsbScreen pollsState="polls_closed_initial" />;
}

/* istanbul ignore next - @preserve */
export function PollsOpenWithAlarmPreview(): JSX.Element {
  return <InsertUsbScreen pollsState="polls_open" />;
}

/* istanbul ignore next - @preserve */
export function PollsOpenWithoutAlarmPreview(): JSX.Element {
  return <InsertUsbScreen disableAlarm pollsState="polls_open" />;
}
