import { Caption, FullScreenIconWrapper, Icons, P } from '@votingworks/ui';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

interface Props {
  scannedBallotCount: number;
}

export function ScanJamScreen({ scannedBallotCount }: Props): JSX.Element {
  return (
    <Screen centerContent ballotCountOverride={scannedBallotCount}>
      <FullScreenPromptLayout
        title="Ballot Not Counted"
        image={
          <FullScreenIconWrapper color="danger">
            <Icons.Delete />
          </FullScreenIconWrapper>
        }
      >
        <P>The ballot is jammed in the scanner.</P>
        <Caption>Ask a poll worker for help.</Caption>
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanJamScreen scannedBallotCount={42} />;
}
