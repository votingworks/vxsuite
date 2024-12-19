import { FullScreenIconWrapper, Icons, P, appStrings } from '@votingworks/ui';

import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

interface Props {
  scannedBallotCount: number;
}

export function ScanSuccessScreen({ scannedBallotCount }: Props): JSX.Element {
  return (
    <Screen centerContent ballotCountOverride={scannedBallotCount} voterFacing>
      <FullScreenPromptLayout
        title={appStrings.titleScannerSuccessScreen()}
        image={
          <FullScreenIconWrapper>
            <Icons.Done color="success" />
          </FullScreenIconWrapper>
        }
      >
        <P>{appStrings.noteThankYouForVoting()}</P>
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return <ScanSuccessScreen scannedBallotCount={42} />;
}
