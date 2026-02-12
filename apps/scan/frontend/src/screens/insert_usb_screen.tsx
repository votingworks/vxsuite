import { appStrings, Caption, H1, Icons, P } from '@votingworks/ui';
import { PollsState } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';
import { useAlarm } from '../utils/use_alarm';

export interface InsertUsbScreenProps {
  disableAlarm?: boolean;
  pollsState: PollsState;
}

export function InsertUsbScreen({
  disableAlarm,
  pollsState,
}: InsertUsbScreenProps): JSX.Element {
  assert(pollsState !== 'polls_closed_final');

  const enableAlarm = !disableAlarm && pollsState === 'polls_open';
  useAlarm(enableAlarm);

  return (
    <ScreenMainCenterChild
      disableSettingsButtons={enableAlarm}
      showTestModeBanner={false}
      showEarlyVotingBanner={false}
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
