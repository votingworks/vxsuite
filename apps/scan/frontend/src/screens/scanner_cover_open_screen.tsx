import { Caption, H1, Icons, P, appStrings } from '@votingworks/ui';
import { useEffect } from 'react';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';
import * as api from '../api';

interface Props {
  disableAlarm?: boolean;
}

export function ScannerCoverOpenScreen({ disableAlarm }: Props): JSX.Element {
  const enableAlarm = !disableAlarm;

  const playSound = api.playSound.useMutation().mutate;
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (enableAlarm) {
      interval = setInterval(() => playSound({ name: 'alarm' }), 2000);
    }
    return () => clearInterval(interval);
  }, [enableAlarm, playSound]);

  return (
    <ScreenMainCenterChild voterFacing showTestModeBanner={false}>
      <CenteredText>
        <H1>{appStrings.titleScannerCoverIsOpen()}</H1>
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
  return <ScannerCoverOpenScreen />;
}

/* istanbul ignore next - @preserve */
export function WithoutAlarmPreview(): JSX.Element {
  return <ScannerCoverOpenScreen disableAlarm />;
}
