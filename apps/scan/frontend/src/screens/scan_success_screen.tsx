import { FullScreenIconWrapper, Icons, P } from '@votingworks/ui';

import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

interface Props {
  scannedBallotCount: number;
}

export function ScanSuccessScreen({ scannedBallotCount }: Props): JSX.Element {
  return (
    <Screen centerContent ballotCountOverride={scannedBallotCount}>
      <FullScreenPromptLayout
        title="Your ballot was counted!"
        image={
          <FullScreenIconWrapper>
            <Icons.Done color="success" />
          </FullScreenIconWrapper>
        }
      >
        <P>Thank you for voting.</P>
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanSuccessScreen scannedBallotCount={42} />;
}
