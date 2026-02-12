import { Caption, H1, Icons, P, appStrings } from '@votingworks/ui';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';
import { useAlarm } from '../utils/use_alarm';

interface Props {
  disableAlarm?: boolean;
}

export function AccessibilityInputDisconnectedScreen({
  disableAlarm,
}: Props): JSX.Element {
  const enableAlarm = !disableAlarm;
  useAlarm(enableAlarm);

  return (
    <ScreenMainCenterChild
      disableSettingsButtons={enableAlarm}
      showTestModeBanner={false}
      showEarlyVotingBanner={false}
      voterFacing
    >
      <CenteredText>
        <H1>Accessibility Input Disconnected</H1>
        {/* Translate this instruction for the voter but leave all else in
          English for the poll worker */}
        <P>{appStrings.instructionsAskForHelp()}</P>
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
export function WithAlarmPreview(): JSX.Element {
  return <AccessibilityInputDisconnectedScreen />;
}

/* istanbul ignore next - @preserve */
export function WithoutAlarmPreview(): JSX.Element {
  return <AccessibilityInputDisconnectedScreen disableAlarm />;
}
